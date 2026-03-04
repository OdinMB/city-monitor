import type { PollenForecast, PollenType, PollenIntensity, PollenTypeForecast } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { savePollen } from '../db/writes.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { getActiveCities } from '../config/index.js';

const log = createLogger('ingest-pollen');

const DWD_POLLEN_URL = 'https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json';
const FETCH_TIMEOUT_MS = 15_000;
const TTL_SECONDS = 86400; // 1 day

const POLLEN_TYPES: PollenType[] = [
  'Hasel', 'Erle', 'Esche', 'Birke', 'Graeser', 'Roggen', 'Beifuss', 'Ambrosia',
];

const VALID_INTENSITIES = new Set<string>(['0', '0-1', '1', '1-2', '2', '2-3', '3', '-1']);

function toIntensity(v: unknown): PollenIntensity {
  const s = String(v ?? '-1');
  return VALID_INTENSITIES.has(s) ? (s as PollenIntensity) : '-1';
}

/**
 * Parse the DWD Pollenflug-Gefahrenindex JSON and extract data for a specific region.
 * @param json Parsed DWD JSON response
 * @param regionId DWD region ID (e.g. 50 for Brandenburg/Berlin)
 * @param partregionId DWD sub-region ID (-1 means no sub-regions)
 */
export function parseDwdPollenJson(
  json: Record<string, unknown>,
  regionId: number,
  partregionId: number,
): PollenForecast | null {
  const content = json.content as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(content) || content.length === 0) return null;

  const entry = content.find(
    (e) => e.region_id === regionId && e.partregion_id === partregionId,
  );
  if (!entry) return null;

  const pollenData = entry.Pollen as Record<string, Record<string, string>> | undefined;
  if (!pollenData) return null;

  const regionName = partregionId === -1
    ? String(entry.region_name ?? '')
    : String(entry.partregion_name ?? '');

  const pollen = {} as Record<PollenType, PollenTypeForecast>;
  for (const type of POLLEN_TYPES) {
    const raw = pollenData[type];
    pollen[type] = {
      today: toIntensity(raw?.today),
      tomorrow: toIntensity(raw?.tomorrow),
      dayAfterTomorrow: toIntensity(raw?.dayafter_to),
    };
  }

  return {
    region: regionName,
    updatedAt: String(json.last_update ?? ''),
    pollen,
  };
}

export function createPollenIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestPollen(): Promise<void> {
    try {
      const res = await log.fetch(DWD_POLLEN_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        log.warn(`DWD pollen returned ${res.status}`);
        return;
      }

      const json = await res.json() as Record<string, unknown>;
      const cities = getActiveCities();

      for (const city of cities) {
        const pollenCfg = city.dataSources.pollen;
        if (!pollenCfg) continue;

        const forecast = parseDwdPollenJson(json, pollenCfg.regionId, pollenCfg.partregionId);
        if (!forecast) {
          log.warn(`No pollen data for ${city.id} (region=${pollenCfg.regionId}, part=${pollenCfg.partregionId})`);
          continue;
        }

        cache.set(CK.pollen(city.id), forecast, TTL_SECONDS);

        if (db) {
          try {
            await savePollen(db, city.id, forecast);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }

        const active = Object.values(forecast.pollen)
          .filter((p) => p.today !== '0' && p.today !== '-1')
          .length;
        log.info(`${city.id} pollen updated: ${active}/8 types active`);
      }
    } catch (err) {
      log.error('Pollen ingestion failed', err);
    }
  };
}
