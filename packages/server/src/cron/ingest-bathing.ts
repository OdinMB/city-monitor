import type { BathingSource, BathingSpot } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveBathingSpots } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

export type { BathingSpot };

const log = createLogger('ingest-bathing');

const FETCH_TIMEOUT_MS = 15_000;
const BATHING_TTL_SECONDS = 86400; // 24 hours

function parseGermanDate(dateStr: string): string {
  const [day, month, year] = dateStr.split('.');
  if (!day || !month || !year) return dateStr;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** "18,7", "<15", "> 1,0" as a number; "NA", "ng", "n.g." and blanks as null. */
function parseNumeric(value: string | null | undefined): number | null {
  if (!value || value === 'NA') return null;
  const cleaned = value.trim().replace(/^[<>]\s*/, '').replace(',', '.');
  if (!/^-?\d/.test(cleaned)) return null;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function toQuality(farbId: string): BathingSpot['quality'] {
  const id = parseInt(farbId, 10);
  if (id === 1 || id === 11) return 'good';
  if (id === 3 || id === 13) return 'warning';
  return 'poor';
}

function toNullableText(value: string): string | null {
  if (!value || value === 'keine' || value === 'NA') return null;
  return value;
}

/** The bathing season the badges assume where a spot gives none: 15 May to 15 September. */
function isBathingSeason(now: Date): boolean {
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  return (month === 5 && day >= 15) || (month > 5 && month < 9) || (month === 9 && day <= 15);
}

/** LAGeSo's CSV (Berlin): one row per spot with its latest sample. */
export function parseLagesoCsv(text: string, now: Date): BathingSpot[] {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const inSeason = isBathingSeason(now);
  const spots: BathingSpot[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(';');
    if (fields.length < 32) continue;

    const lat = parseFloat(fields[4]);
    const lon = parseFloat(fields[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const bsl = fields[13]; // BSL station code

    spots.push({
      id: `bath-${bsl}`,
      name: fields[0],
      district: fields[1],
      waterBody: fields[2],
      lat,
      lon,
      measuredAt: parseGermanDate(fields[8]),
      waterTemp: parseNumeric(fields[17]),
      visibility: parseNumeric(fields[9]),
      quality: toQuality(fields[20]),
      algae: toNullableText(fields[21]),
      advisory: toNullableText(fields[22]),
      classification: toNullableText(fields[31]) ?? null,
      detailUrl: fields[7],
      inSeason,
    });
  }

  return spots;
}

// ── Hamburg (HH_WFS_Badegewaesser) ─────────────────────────────

/** The WFS GetFeature URL for one of the service's two feature types, as GeoJSON in WGS84. */
export function hamburgBathingUrl(base: string, typeName: 'badegewaesser' | 'badegewaesser_proben'): string {
  return `${base}?SERVICE=WFS&REQUEST=GetFeature&VERSION=2.0.0&outputFormat=application/geo%2Bjson` +
    `&typeNames=${typeName}&srsName=EPSG:4326`;
}

type Props = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function features(json: unknown): Array<{ id?: unknown; geometry?: unknown; properties?: unknown }> | null {
  const list = (json as { features?: unknown } | null)?.features;
  return Array.isArray(list) ? list : null;
}

/** "01.05.2026 bis 14.09.2026" as the days it spans; null for "gesperrt" or anything else. */
function parseSeason(text: string | null): { from: string; to: string } | null {
  const m = text?.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+bis\s+(\d{1,2}\.\d{1,2}\.\d{4})$/);
  return m ? { from: parseGermanDate(m[1]!), to: parseGermanDate(m[2]!) } : null;
}

/** The calendar day in Hamburg, as YYYY-MM-DD. */
function localDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const PLAIN_REMARK = /^keine Beanstandung\.?$/i;

/**
 * The quality from the health authority's own words: a bathing ban or a closed
 * spot is poor, a warning or many algae is a warning. The WFS has no colour
 * code like LAGeSo's, so its remark and algae fields are all there is.
 */
function hamburgQuality(closed: boolean, remark: string | null, algae: string | null, icon: string | null): BathingSpot['quality'] {
  if (closed || icon === 'baden_verboten' || /baden verboten/i.test(remark ?? '')) return 'poor';
  if (/warnung/i.test(remark ?? '') || algae === 'viel') return 'warning';
  return 'good';
}

/**
 * Hamburg's 17 spots (`badegewaesser`, points) joined by name with their
 * newest sample (`badegewaesser_proben`, no geometry). A spot without a sample
 * keeps the spot layer's own remark. The spot layer's EU class
 * (`eg_einstufung`, an integer) is left out: its codes are not documented.
 */
export function parseHamburgBathing(spotsJson: unknown, samplesJson: unknown, now: Date): BathingSpot[] | null {
  const spotFeatures = features(spotsJson);
  const sampleFeatures = features(samplesJson);
  if (!spotFeatures || !sampleFeatures) return null;

  const latest = new Map<string, Props>();
  for (const f of sampleFeatures) {
    const p = (f.properties ?? {}) as Props;
    const name = str(p.name);
    const date = str(p.datum);
    if (!name || !date || !/^\d{8}$/.test(date)) continue;
    const prev = latest.get(name);
    if (!prev || String(prev.datum) < date) latest.set(name, p);
  }

  const today = localDay(now);
  const spots: BathingSpot[] = [];
  for (const f of spotFeatures) {
    const p = (f.properties ?? {}) as Props;
    const name = str(p.name);
    const coords = (f.geometry as { type?: string; coordinates?: unknown } | null)?.coordinates;
    if (!name || !Array.isArray(coords)) continue;
    const [lon, lat] = coords as unknown[];
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const sample = latest.get(name);
    const seasonText = str(p.badesaison);
    const closed = seasonText?.toLowerCase() === 'gesperrt';
    const season = parseSeason(seasonText);
    const remark = sample ? str(sample.bemerkung_bsu) : str(p.bemerkung_bsu);
    const algae = sample ? str(sample.algen) : null;
    const date = sample ? String(sample.datum) : null;
    const link = str(p.link_zu_details);
    const comma = name.indexOf(',');

    spots.push({
      id: `bath-hh-${String(f.id ?? name).replace(/^APP_BADEGEWAESSER_/, '')}`,
      name,
      // No Bezirk in the data
      district: '',
      // "Eichbaumsee, Badestelle Ost": the lake; a pool's own name ("Sommerbad Volksdorf") says it already
      waterBody: comma > 0 ? name.slice(0, comma) : '',
      lat,
      lon,
      measuredAt: date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : '',
      waterTemp: sample ? parseNumeric(str(sample.temperatur)) : null,
      visibility: sample ? parseNumeric(str(sample.sichttiefe)) : null,
      quality: hamburgQuality(closed, remark, algae, sample ? str(sample.icon) : null),
      algae: algae === 'viel' ? 'Algen: viel' : null,
      advisory: closed ? 'Badestelle gesperrt' : (remark && !PLAIN_REMARK.test(remark) ? remark : null),
      classification: null,
      detailUrl: link ? link.replace(/^http:\/\//, 'https://') : '',
      inSeason: season ? season.from <= today && today <= season.to : isBathingSeason(now),
    });
  }
  return spots;
}

// ── Job ─────────────────────────────────────────────────────────

async function fetchOk(cityId: string, url: string): Promise<Response | null> {
  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });
  if (!response.ok) {
    log.warn(`${cityId}: bathing source returned ${response.status}`);
    return null;
  }
  return response;
}

/** The city's spots from its provider, or null when the source failed, so that the last good data stays. */
async function fetchSpots(cityId: string, source: BathingSource, now: Date): Promise<BathingSpot[] | null> {
  switch (source.provider) {
    case 'lageso': {
      const response = await fetchOk(cityId, source.url);
      return response ? parseLagesoCsv(await response.text(), now) : null;
    }
    case 'hamburg-wfs': {
      const [spotsRes, samplesRes] = await Promise.all([
        fetchOk(cityId, hamburgBathingUrl(source.url, 'badegewaesser')),
        fetchOk(cityId, hamburgBathingUrl(source.url, 'badegewaesser_proben')),
      ]);
      if (!spotsRes || !samplesRes) return null;
      const spots = parseHamburgBathing(await spotsRes.json(), await samplesRes.json(), now);
      if (!spots) log.warn(`${cityId}: bathing WFS answered without features`);
      return spots;
    }
  }
}

export function createBathingIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestBathing(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.bathing;
      if (!source) continue;
      try {
        const spots = await fetchSpots(city.id, source, new Date());
        if (spots === null) continue;

        cache.set(CK.bathingSpots(city.id), spots, BATHING_TTL_SECONDS);

        if (db) {
          try {
            await saveBathingSpots(db, city.id, spots);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }

        log.info(`${city.id}: ${spots.length} bathing spots updated`);
      } catch (err) {
        log.error(`${city.id} bathing ingestion failed`, err);
      }
    }
  };
}
