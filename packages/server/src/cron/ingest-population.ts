import type { CityConfig, PopulationFeatureProps, PopulationSource, PopulationSummary } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { savePopulation } from '../db/writes.js';
import { loadPopulationSummary } from '../db/reads.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { loadAreaOutlines } from '../lib/area-outlines.js';
import { readSheets } from '../lib/xlsx.js';
import {
  extractEwrSnapshotDate, hamburgStadtteileUrl, parseEwrSchluessel, parseEwrT2Sheet, parseHamburgStadtteile,
  parseKoelnPopulation, parseMuenchenPopulation, type PopulationData,
} from '../lib/population-parsers.js';
import { fetchIndikatorCsv } from '../lib/muenchen-indikatorenatlas.js';

const log = createLogger('ingest-population');

const FETCH_TIMEOUT_MS = 60_000;
/**
 * 37.2 days: the longest gap between monthly runs (31 days) × 1.2, so an entry
 * lasts until the next run. Data retention keeps the newest `afstat-population`
 * row, so with a database the routes' DB fallback can also refill an expired
 * entry; without one the cache is the only copy.
 */
export const POPULATION_TTL_SECONDS = 3214080;

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

/** Area of a Polygon or MultiPolygon in km², 0 for anything else. */
function geometryAreaKm2(geometry: unknown): number {
  const geom = geometry as { type?: string; coordinates?: unknown };
  if (!Array.isArray(geom?.coordinates)) return 0;
  if (geom.type === 'Polygon') return polygonAreaKm2(geom.coordinates as number[][][]);
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][]).reduce((sum, poly) => sum + polygonAreaKm2(poly), 0);
  }
  return 0;
}

interface AreaShape {
  geometry: unknown;
  name?: string;
  areaKm2?: number;
}

/** Berlin's planning areas: the polygons of the social atlas (the MSS WFS), which the job runs after. */
function socialAtlasShapes(cache: Cache, cityId: string): Map<string, AreaShape> {
  const geojson = cache.get<{ features?: Array<{ geometry: unknown; properties?: { plrId?: string } }> }>(
    CK.socialAtlasGeojson(cityId),
  );
  const map = new Map<string, AreaShape>();
  for (const f of geojson?.features ?? []) {
    const plrId = f.properties?.plrId;
    if (plrId && f.geometry) map.set(plrId, { geometry: f.geometry });
  }
  return map;
}

async function fetchOk(cityId: string, url: string): Promise<Response | null> {
  const res = await log.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    log.warn(`${cityId}: population source returned ${res.status}`);
    return null;
  }
  return res;
}

/** The city's counts and the polygons to draw them on; null when the fetch failed (logged). */
async function fetchPopulation(
  city: CityConfig,
  source: PopulationSource,
  cache: Cache,
): Promise<{ data: PopulationData; shapes: Map<string, AreaShape> } | null> {
  switch (source.provider) {
    case 'afstat-ewr-xlsx': {
      const res = await fetchOk(city.id, source.xlsxUrl);
      if (!res) return null;
      const { sheets } = await readSheets(await res.arrayBuffer(), (name) => name === 'T2' || name === 'Schlüssel');
      const t2Rows = sheets.get('T2');
      if (!t2Rows) {
        log.warn(`${city.id}: no T2 sheet in the EWR XLSX`);
        return null;
      }
      const schluesselRows = sheets.get('Schlüssel');
      const names = schluesselRows ? parseEwrSchluessel(schluesselRows) : new Map<string, string>();
      const areas = parseEwrT2Sheet(t2Rows).map((a) => ({ ...a, name: names.get(a.id) }));
      return { data: { areas, snapshotDate: extractEwrSnapshotDate(t2Rows) }, shapes: socialAtlasShapes(cache, city.id) };
    }
    case 'koeln-datenkatalog': {
      const res = await fetchOk(city.id, source.csvUrl);
      if (!res) return null;
      return { data: parseKoelnPopulation(await res.text()), shapes: await loadAreaOutlines(source.outlines) };
    }
    case 'hh-stadtteile': {
      const res = await fetchOk(city.id, hamburgStadtteileUrl(source.itemsUrl));
      if (!res) return null;
      return { data: parseHamburgStadtteile(await res.json()), shapes: await loadAreaOutlines(source.outlines) };
    }
    case 'muenchen-indikatorenatlas': {
      const get = (url: string) => fetchOk(city.id, url);
      const [ages, foreign] = await Promise.all([
        fetchIndikatorCsv(source.ckanApi, source.datasets.ageGroups, get),
        fetchIndikatorCsv(source.ckanApi, source.datasets.foreign, get),
      ]);
      if (ages === null || foreign === null) return null;
      return { data: parseMuenchenPopulation(ages, foreign), shapes: await loadAreaOutlines(source.outlines) };
    }
  }
}

export function createPopulationIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestPopulation(): Promise<void> {
    for (const city of getActiveCities()) {
      if (!city.dataSources.population) continue;
      try {
        await ingestCityPopulation(city, city.dataSources.population, cache, db);
      } catch (err) {
        log.error(`${city.id} population ingestion failed`, err);
      }
    }
  };
}

async function ingestCityPopulation(city: CityConfig, source: PopulationSource, cache: Cache, db: Db | null): Promise<void> {
  const cityId = city.id;
  const fetched = await fetchPopulation(city, source, cache);
  if (!fetched) return;
  const { data, shapes } = fetched;
  if (data.areas.length === 0) {
    log.warn(`${cityId}: no population rows in the source`);
    return;
  }

  // Build GeoJSON features and accumulate total area for city-wide density
  const features: Array<{ type: 'Feature'; geometry: unknown; properties: PopulationFeatureProps }> = [];
  let totalAreaKm2 = 0;
  let mappedPop = 0;

  for (const area of data.areas) {
    const shape = shapes.get(area.id);
    if (!shape) continue; // Skip areas without geometry

    const areaKm2 = area.areaKm2 ?? shape.areaKm2 ?? geometryAreaKm2(shape.geometry);
    if (areaKm2 > 0) {
      totalAreaKm2 += areaKm2;
      mappedPop += area.total;
    }

    features.push({
      type: 'Feature',
      geometry: shape.geometry,
      properties: {
        plrId: area.id,
        plrName: area.name ?? shape.name ?? area.id,
        population: area.total,
        density: Math.round(area.total / (areaKm2 > 0 ? areaKm2 : 1)),
        foreignPct: area.total > 0 ? (area.foreign / area.total) * 100 : 0,
        elderlyPct: area.total > 0 ? (area.elderly / area.total) * 100 : 0,
        youthPct: area.total > 0 ? (area.youth / area.total) * 100 : 0,
      },
    });
  }

  // Aggregate city-wide summary (does not require geometry)
  const totalPop = data.areas.reduce((s, p) => s + p.total, 0);
  const totalForeign = data.areas.reduce((s, p) => s + p.foreign, 0);
  const totalYouth = data.areas.reduce((s, p) => s + p.youth, 0);
  const totalElderly = data.areas.reduce((s, p) => s + p.elderly, 0);
  const totalWorkingAge = totalPop - totalYouth - totalElderly;

  const change = await changeSincePrevious(cityId, data, totalPop, db);

  const summary: PopulationSummary = {
    total: totalPop,
    // Residents of the areas with a known size over that size, so an area
    // without an outline doesn't inflate the density.
    density: totalAreaKm2 > 0 ? Math.round(mappedPop / totalAreaKm2) : 0,
    foreignTotal: totalForeign,
    foreignPct: totalPop > 0 ? (totalForeign / totalPop) * 100 : 0,
    elderlyPct: totalPop > 0 ? (totalElderly / totalPop) * 100 : 0,
    youthPct: totalPop > 0 ? (totalYouth / totalPop) * 100 : 0,
    workingAgePct: totalPop > 0 ? (totalWorkingAge / totalPop) * 100 : 0,
    changeAbsolute: change.absolute,
    changePct: change.pct,
    snapshotDate: data.snapshotDate,
    changePeriod: data.previousTotal !== undefined ? 'year' : 'half-year',
  };

  // Always cache the summary (tile data) — it doesn't need geometry
  cache.set(CK.populationSummary(cityId), summary, POPULATION_TTL_SECONDS);

  const geojson = { type: 'FeatureCollection' as const, features };
  if (features.length > 0) {
    cache.set(CK.populationGeojson(cityId), geojson, POPULATION_TTL_SECONDS);
  } else {
    log.warn(`${cityId}: no area geometry available (social atlas not cached?) — summary cached, GeoJSON skipped`);
  }
  if (features.length < data.areas.length) {
    log.warn(`${cityId}: ${data.areas.length - features.length} of ${data.areas.length} areas have no outline`);
  }

  if (db && features.length > 0) {
    try {
      await savePopulation(db, cityId, geojson, summary);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${features.length} areas, ${totalPop} total population (${data.snapshotDate})`);
}

/**
 * The change against the previous count: from the source where it carries the
 * year before (Köln, Hamburg, München), else against the previous database snapshot
 * (Berlin). A rerun on the same count keeps the change that snapshot recorded
 * rather than comparing the count with itself.
 */
async function changeSincePrevious(
  cityId: string,
  data: PopulationData,
  totalPop: number,
  db: Db | null,
): Promise<{ absolute: number; pct: number }> {
  const pctOf = (absolute: number, base: number) => (base > 0 ? (absolute / base) * 100 : 0);
  if (data.previousTotal !== undefined) {
    const absolute = totalPop - data.previousTotal;
    return { absolute, pct: pctOf(absolute, data.previousTotal) };
  }
  if (!db) return { absolute: 0, pct: 0 };
  try {
    const prev = await loadPopulationSummary(db, cityId);
    if (!prev || prev.data.total <= 0) return { absolute: 0, pct: 0 };
    if (prev.data.snapshotDate === data.snapshotDate) {
      return { absolute: prev.data.changeAbsolute, pct: prev.data.changePct };
    }
    const absolute = totalPop - prev.data.total;
    return { absolute, pct: pctOf(absolute, prev.data.total) };
  } catch {
    return { absolute: 0, pct: 0 }; // first run or DB unavailable
  }
}
