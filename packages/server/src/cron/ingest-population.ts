import * as XLSX from 'xlsx';
import type { PopulationFeatureProps, PopulationSummary } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { savePopulation } from '../db/writes.js';
import { loadPopulationSummary } from '../db/reads.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-population');

// Hardcoded URL for the latest verified XLSX (Dec 2025 data).
// Must be updated manually each semester when a new file is published.
const XLSX_URL = 'https://download.statistik-berlin-brandenburg.de/1df9da7ea6dbfa3a/f6ac408f14cd/SB_A01-16-00_2025h02_BE.xlsx';
const FETCH_TIMEOUT_MS = 60_000;
const POPULATION_TTL_SECONDS = 2592000; // 30 days

interface PlrData {
  plrId: string;
  total: number;
  youth: number;   // under 18
  elderly: number;  // 65+
  foreign: number;
}

/** Parse a cell value that may have space thousands separators (e.g. " 3 469") */
function parseSpaceNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return 0;
  const cleaned = val.replace(/\s/g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Compute geodetic polygon area in km² using the Shoelace formula with latitude correction.
 *  coordinates[0] is the exterior ring; coordinates[1..n] are holes (subtracted). */
export function polygonAreaKm2(coordinates: number[][][]): number {
  const R = 6371;
  const factor = R * R * (Math.PI / 180);

  function ringArea(ring: number[][]): number {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [lon1, lat1] = ring[i];
      const [lon2, lat2] = ring[i + 1];
      area += (lon2 - lon1) * Math.sin(((lat1 + lat2) / 2) * (Math.PI / 180));
    }
    return Math.abs(area) * factor;
  }

  const outer = ringArea(coordinates[0]);
  const holes = coordinates.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0);
  return outer - holes;
}

function parseT2Sheet(sheet: XLSX.WorkSheet): PlrData[] {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown as unknown[][];
  const results: PlrData[] = [];

  // Find the header row containing 'Insgesamt' (may be hyphenated as 'Ins-\ngesamt')
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Array.isArray(row) && row.some((c) => typeof c === 'string' && c.replace(/[\s-]/g, '').includes('Insgesamt'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return results;

  // Column indices (0-based): BEZ=0, PGR=1, BZR=2, PLR=3, Insgesamt=4,
  // unter6=5, 6-15=6, 15-18=7, 18-27=8, 27-45=9, 45-55=10, 55-65=11, 65+=12,
  // weiblich=13, Ausländer=14
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 15) continue;

    const bez = row[0];
    const pgr = row[1];
    const bzr = row[2];
    const plr = row[3];

    // Only PLR-level rows: all 4 geo columns must be filled non-empty values
    if (!bez || !pgr || !bzr || !plr) continue;
    // Skip if PLR value is not a valid ID (8-digit or non-empty string)
    const plrStr = String(plr).trim();
    if (plrStr.length === 0) continue;

    const total = parseSpaceNumber(row[4]);
    if (total === 0) continue; // Skip empty rows

    const under6 = parseSpaceNumber(row[5]);
    const age6to15 = parseSpaceNumber(row[6]);
    const age15to18 = parseSpaceNumber(row[7]);
    const elderly = parseSpaceNumber(row[12]);
    const foreign = parseSpaceNumber(row[14]);

    // Build 8-digit composite PLR ID: BEZ(2) + PGR(2) + BZR(2) + PLR(2)
    const compositeId = `${String(bez).trim().padStart(2, '0')}${String(pgr).trim().padStart(2, '0')}${String(bzr).trim().padStart(2, '0')}${plrStr.padStart(2, '0')}`;

    results.push({
      plrId: compositeId,
      total,
      youth: under6 + age6to15 + age15to18,
      elderly,
      foreign,
    });
  }

  return results;
}

function parseSchluessel(sheet: XLSX.WorkSheet): Map<string, string> {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown as unknown[][];
  const lookup = new Map<string, string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 5) continue;
    const bez = String(row[0] ?? '').trim();
    const pgr = String(row[1] ?? '').trim();
    const bzr = String(row[2] ?? '').trim();
    const plr = String(row[3] ?? '').trim();
    const name = String(row[4] ?? '').trim();
    // Only PLR-level rows: all 4 geo columns and name must be filled
    if (!bez || !pgr || !bzr || !plr || !name) continue;
    // Skip header rows (non-numeric values)
    if (!/^\d+$/.test(bez)) continue;
    const compositeId = `${bez.padStart(2, '0')}${pgr.padStart(2, '0')}${bzr.padStart(2, '0')}${plr.padStart(2, '0')}`;
    lookup.set(compositeId, name);
  }

  return lookup;
}

function extractGeometry(
  geojson: { features?: Array<{ geometry: unknown; properties?: { plrId?: string } }> },
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!geojson?.features) return map;
  for (const f of geojson.features) {
    const plrId = f.properties?.plrId;
    if (plrId && f.geometry) {
      map.set(plrId, f.geometry);
    }
  }
  return map;
}

const GERMAN_MONTHS: Record<string, string> = {
  'Januar': '01', 'Februar': '02', 'März': '03', 'April': '04',
  'Mai': '05', 'Juni': '06', 'Juli': '07', 'August': '08',
  'September': '09', 'Oktober': '10', 'November': '11', 'Dezember': '12',
};

function extractSnapshotDate(sheet: XLSX.WorkSheet): string {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown as unknown[][];
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      // Try "31.12.2025" format
      const numMatch = cell.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
      if (numMatch) {
        return `${numMatch[3]}-${numMatch[2]}-${numMatch[1].padStart(2, '0')}`;
      }
      // Try "31. Dezember 2025" format
      const deMatch = cell.match(/(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/);
      if (deMatch) {
        const month = GERMAN_MONTHS[deMatch[2]];
        return `${deMatch[3]}-${month}-${deMatch[1].padStart(2, '0')}`;
      }
    }
  }
  return new Date().toISOString().slice(0, 10);
}

export function createPopulationIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestPopulation(): Promise<void> {
    try {
      const res = await log.fetch(XLSX_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        log.warn(`XLSX fetch returned ${res.status}`);
        return;
      }

      const buffer = await res.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

      const t2Sheet = wb.Sheets['T2'];
      const schluesselSheet = wb.Sheets['Schlüssel'];

      if (!t2Sheet) {
        log.warn('No T2 sheet found in XLSX');
        return;
      }

      const plrDataList = parseT2Sheet(t2Sheet);
      if (plrDataList.length === 0) {
        log.warn('No PLR data rows found in T2 sheet');
        return;
      }

      const nameMap = schluesselSheet ? parseSchluessel(schluesselSheet) : new Map<string, string>();
      const snapshotDate = extractSnapshotDate(t2Sheet);

      // Get PLR geometry from social atlas cache
      const socialAtlasGeojson = cache.get<{ features?: Array<{ geometry: unknown; properties?: { plrId?: string } }> }>(
        CK.socialAtlasGeojson('berlin'),
      );
      const geometryMap = socialAtlasGeojson ? extractGeometry(socialAtlasGeojson) : new Map<string, unknown>();

      // Build GeoJSON features and accumulate total area for city-wide density
      const features: Array<{
        type: 'Feature';
        geometry: unknown;
        properties: PopulationFeatureProps;
      }> = [];
      let totalAreaKm2 = 0;

      for (const plr of plrDataList) {
        const geometry = geometryMap.get(plr.plrId);
        if (!geometry) continue; // Skip PLRs without geometry

        // Compute area for density (handles both Polygon and MultiPolygon)
        let areaKm2 = 1; // fallback
        const geom = geometry as { type?: string; coordinates?: number[][][] | number[][][][] };
        if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
          const computed = polygonAreaKm2(geom.coordinates as number[][][]);
          if (computed > 0) {
            areaKm2 = computed;
            totalAreaKm2 += computed;
          }
        } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
          let multi = 0;
          for (const poly of geom.coordinates as number[][][][]) {
            multi += polygonAreaKm2(poly);
          }
          if (multi > 0) {
            areaKm2 = multi;
            totalAreaKm2 += multi;
          }
        }

        features.push({
          type: 'Feature',
          geometry,
          properties: {
            plrId: plr.plrId,
            plrName: nameMap.get(plr.plrId) ?? plr.plrId,
            population: plr.total,
            density: Math.round(plr.total / areaKm2),
            foreignPct: plr.total > 0 ? (plr.foreign / plr.total) * 100 : 0,
            elderlyPct: plr.total > 0 ? (plr.elderly / plr.total) * 100 : 0,
            youthPct: plr.total > 0 ? (plr.youth / plr.total) * 100 : 0,
          },
        });
      }

      // Aggregate city-wide summary (does not require geometry)
      const totalPop = plrDataList.reduce((s, p) => s + p.total, 0);
      const totalForeign = plrDataList.reduce((s, p) => s + p.foreign, 0);
      const totalYouth = plrDataList.reduce((s, p) => s + p.youth, 0);
      const totalElderly = plrDataList.reduce((s, p) => s + p.elderly, 0);
      const totalWorkingAge = totalPop - totalYouth - totalElderly;

      // Compare with previous snapshot for change calculation
      let changeAbsolute = 0;
      let changePct = 0;
      if (db) {
        try {
          const prevResult = await loadPopulationSummary(db, 'berlin');
          if (prevResult && prevResult.data.total > 0) {
            changeAbsolute = totalPop - prevResult.data.total;
            changePct = (changeAbsolute / prevResult.data.total) * 100;
          }
        } catch {
          // Ignore — first run or DB unavailable
        }
      }

      const summary: PopulationSummary = {
        total: totalPop,
        density: totalAreaKm2 > 0 ? Math.round(totalPop / totalAreaKm2) : 0,
        foreignTotal: totalForeign,
        foreignPct: totalPop > 0 ? (totalForeign / totalPop) * 100 : 0,
        elderlyPct: totalPop > 0 ? (totalElderly / totalPop) * 100 : 0,
        youthPct: totalPop > 0 ? (totalYouth / totalPop) * 100 : 0,
        workingAgePct: totalPop > 0 ? (totalWorkingAge / totalPop) * 100 : 0,
        changeAbsolute,
        changePct,
        snapshotDate,
      };

      // Always cache the summary (tile data) — it doesn't need geometry
      cache.set(CK.populationSummary('berlin'), summary, POPULATION_TTL_SECONDS);

      // Cache GeoJSON only if geometry was available (from social atlas)
      const geojson = { type: 'FeatureCollection' as const, features };
      if (features.length > 0) {
        cache.set(CK.populationGeojson('berlin'), geojson, POPULATION_TTL_SECONDS);
      } else {
        log.warn('No PLR geometry available (social atlas not cached?) — summary cached, GeoJSON skipped');
      }

      if (db && features.length > 0) {
        try {
          await savePopulation(db, 'berlin', geojson, summary);
        } catch (err) {
          log.error('DB write failed', err);
        }
      }

      log.info(`Berlin: ${features.length} PLR areas, ${totalPop} total population (${snapshotDate})`);
    } catch (err) {
      log.error('population ingestion failed', err);
    }
  };
}
