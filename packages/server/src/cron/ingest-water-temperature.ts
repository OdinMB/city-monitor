/**
 * Water temperature at a city's measuring points, per city from
 * `dataSources.waterTemperature`. Today Berlin's Wasserportal (Senatsverwaltung
 * für Mobilität, Verkehr, Klimaschutz und Umwelt; dl-de/by-2.0 on the Berlin
 * data register, "Gewässerkundliche Messdaten"): one CSV export per station,
 * 15-minute single values. See .context/water-levels.md, "Water Temperature".
 */
import type { CityConfig, WaterTemperatureData, WaterTemperatureStation } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveWaterTemperature } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-water-temperature');

const FETCH_TIMEOUT_MS = 15_000;
/** Two job runs (every 15 min): a missed run keeps the readings, a second lets them lapse to the DB fallback. */
export const WATER_TEMPERATURE_TTL_SECONDS = 1800;
/**
 * How many days back the export starts. Online stations send every 15 minutes,
 * the others in batches a day or two late; a station with no reading in this
 * window is left out rather than shown with a temperature from last season.
 */
export const WASSERPORTAL_WINDOW_DAYS = 3;
/** The portal's marker for a missing value. */
const MISSING = -777;

const WASSERPORTAL_BASE = 'https://wasserportal.berlin.de/station.php';

/** "DD.MM.YYYY" of a moment in MEZ (UTC+1), the time the portal's series are kept in. */
function mezDate(ms: number): string {
  const d = new Date(ms + 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** The CSV export of a station's water temperature (single values) from `WASSERPORTAL_WINDOW_DAYS` ago up to now. */
export function wasserportalCsvUrl(stationId: string, now: number): string {
  const params = new URLSearchParams({
    anzeige: 'd',
    station: stationId,
    thema: 'owt',
    sreihe: 'ew',
    smode: 'c',
    sdatum: mezDate(now - WASSERPORTAL_WINDOW_DAYS * 86_400_000),
  });
  return `${WASSERPORTAL_BASE}?${params}`;
}

/** The station's page on the portal, with its water-temperature chart. */
export function wasserportalStationUrl(stationId: string): string {
  return `${WASSERPORTAL_BASE}?anzeige=g&thema=owt&station=${encodeURIComponent(stationId)}`;
}

/**
 * The newest valid reading of a Wasserportal CSV export: rows of
 * `"03.11.2026 02:45";9,3` (decimal comma, -777 for a gap) under a header row.
 * The times are MEZ all year (the export has 02:00–02:45 on the spring DST day
 * and each 02:xx once on the autumn one), so they get a fixed +01:00. Null when
 * the export has no valid value.
 */
export function parseWasserportalCsv(text: string): { temperature: number; measuredAt: string } | null {
  let newest: { temperature: number; measuredAt: string } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^"?(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})"?;\s*(-?\d+(?:,\d+)?)\s*$/);
    if (!m) continue;
    const [, dd, mm, yyyy, hh, min, raw] = m;
    const value = Number(raw!.replace(',', '.'));
    if (!Number.isFinite(value) || value === MISSING || value < -5 || value > 40) continue;
    const measuredAt = `${yyyy}-${mm}-${dd}T${hh}:${min}:00+01:00`;
    // Rows come oldest first, but compare anyway: a later row wins
    if (!newest || Date.parse(measuredAt) >= Date.parse(newest.measuredAt)) {
      newest = { temperature: Math.round(value * 10) / 10, measuredAt };
    }
  }
  return newest;
}

/** One station's newest reading; null when the request failed (undefined: answered, but no reading). */
async function fetchStation(cityId: string, stationId: string, now: number): Promise<{ temperature: number; measuredAt: string } | null | undefined> {
  try {
    const res = await log.fetch(wasserportalCsvUrl(stationId, now), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)', Accept: 'text/csv,text/plain,*/*' },
    });
    if (!res.ok) {
      log.warn(`${cityId}: Wasserportal station ${stationId} returned ${res.status}`);
      return null;
    }
    // The portal sends ISO-8859-1; only the header holds non-ASCII text
    const text = new TextDecoder('latin1').decode(await res.arrayBuffer());
    return parseWasserportalCsv(text) ?? undefined;
  } catch (err) {
    log.warn(`${cityId}: Wasserportal station ${stationId} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function fetchCity(city: CityConfig, cache: Cache, now: number): Promise<WaterTemperatureData | null> {
  const source = city.dataSources.waterTemperature!;
  const previous = new Map((cache.get<WaterTemperatureData>(CK.waterTemperature(city.id))?.stations ?? []).map((s) => [s.id, s]));
  const stations: WaterTemperatureStation[] = [];
  let failed = 0;
  // One station at a time: the portal is a public web front end, not a bulk API
  for (const s of source.stations) {
    const reading = await fetchStation(city.id, s.id, now);
    if (reading === null) {
      failed++;
      // A failed request keeps the station's last reading rather than dropping it from the map
      const kept = previous.get(s.id);
      if (kept) stations.push(kept);
      continue;
    }
    if (reading === undefined) continue;
    stations.push({ id: s.id, name: s.name, waterBody: s.waterBody, lat: s.lat, lon: s.lon, ...reading, url: wasserportalStationUrl(s.id) });
  }
  if (failed === source.stations.length) {
    log.warn(`${city.id}: every Wasserportal request failed, keeping the previous readings`);
    return null;
  }
  return { stations };
}

/** `now` is for tests. */
export function createWaterTemperatureIngestion(cache: Cache, db: Db | null = null, now: () => number = Date.now) {
  return async function ingestWaterTemperature(): Promise<void> {
    for (const city of getActiveCities()) {
      if (!city.dataSources.waterTemperature?.stations.length) continue;
      try {
        const data = await fetchCity(city, cache, now());
        if (!data) continue;
        cache.set(CK.waterTemperature(city.id), data, WATER_TEMPERATURE_TTL_SECONDS);
        if (db) {
          try {
            await saveWaterTemperature(db, city.id, data);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        log.info(`${city.id}: water temperature at ${data.stations.length} of ${city.dataSources.waterTemperature.stations.length} stations`);
      } catch (err) {
        log.error(`${city.id} water temperature failed`, err);
      }
    }
  };
}
