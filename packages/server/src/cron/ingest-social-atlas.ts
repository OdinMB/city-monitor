import type { SocialAtlasFeatureProps, SocialAtlasSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveSocialAtlas } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { loadAreaOutlines } from '../lib/area-outlines.js';
import { readSheets } from '../lib/xlsx.js';
import { fetchIndikatorCsv } from '../lib/muenchen-indikatorenatlas.js';
import {
  mssLayerNames, parseHamburgSozialmonitoring, parseKoelnSocialAtlas, parseMss, parseMuenchenSocialAtlas,
  SOCIAL_ATLAS_METRICS, type MuenchenSocialCsvs, type SocialAtlasArea,
} from '../lib/social-atlas-parsers.js';

export { mssLayerNames } from '../lib/social-atlas-parsers.js';

const log = createLogger('ingest-social-atlas');

const FETCH_TIMEOUT_MS = 60_000;
const SOCIAL_ATLAS_TTL_SECONDS = 604800; // 7 days

interface WfsResponse {
  type: string;
  features?: Array<{ geometry: unknown; properties: Record<string, unknown> }>;
}

interface GeoJsonFeature {
  type: 'Feature';
  geometry: unknown;
  properties: SocialAtlasFeatureProps;
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

function buildWfsUrl(baseUrl: string, layerName: string): string {
  return `${baseUrl}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${layerName}&outputFormat=application/json&srsName=EPSG:4326`;
}

export function createSocialAtlasIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestSocialAtlas(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.socialAtlas) continue;
      try {
        await ingestCitySocialAtlas(city.id, city.dataSources.socialAtlas, cache, db);
      } catch (err) {
        log.error(`${city.id} social atlas failed`, err);
      }
    }
  };
}

async function fetchOk(cityId: string, url: string, what: string): Promise<Response | null> {
  const res = await log.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    log.warn(`${cityId}: ${what} returned ${res.status}`);
    return null;
  }
  return res;
}

/** The areas of the city's source, null when a fetch failed (logged). */
async function fetchAreas(cityId: string, source: SocialAtlasSource): Promise<SocialAtlasArea[] | null> {
  switch (source.provider) {
    case 'mss-wfs': {
      const layers = mssLayerNames(source.wfsUrl);
      const [indicatorRes, indicesRes] = await Promise.all([
        fetchOk(cityId, buildWfsUrl(source.wfsUrl, layers.indicators), 'WFS indicator layer'),
        fetchOk(cityId, buildWfsUrl(source.wfsUrl, layers.indices), 'WFS indices layer'),
      ]);
      if (!indicatorRes || !indicesRes) return null;
      const indicatorData = await indicatorRes.json() as WfsResponse;
      const indicesData = await indicesRes.json() as WfsResponse;
      return parseMss(indicatorData.features ?? [], indicesData.features ?? []);
    }
    case 'koeln-datenkatalog': {
      const res = await fetchOk(cityId, source.csvUrl, 'Datenkatalog CSV');
      if (!res) return null;
      return parseKoelnSocialAtlas(await res.text(), source.year);
    }
    case 'hh-sozialmonitoring': {
      const res = await fetchOk(cityId, source.xlsxUrl, 'Sozialmonitoring XLSX');
      if (!res) return null;
      const { sheets } = await readSheets(await res.arrayBuffer(), (name) => name === 'I_Indizes' || name === 'II_Indikatoren');
      const indexSheet = sheets.get('I_Indizes');
      const indicatorSheet = sheets.get('II_Indikatoren');
      if (!indexSheet || !indicatorSheet) throw new Error('Sozialmonitoring XLSX lacks I_Indizes or II_Indikatoren');
      return parseHamburgSozialmonitoring(indexSheet, indicatorSheet);
    }
    case 'muenchen-indikatorenatlas': {
      // One dataset per indicator; a failed one fails the run, so no slot silently goes blank.
      const metrics = SOCIAL_ATLAS_METRICS[source.provider];
      const texts = await Promise.all(metrics.map((m) =>
        fetchIndikatorCsv(source.ckanApi, source.datasets[m], (url) => fetchOk(cityId, url, `Indikatorenatlas ${m}`))));
      if (texts.some((t) => t === null)) return null;
      const csvs = Object.fromEntries(metrics.map((m, i) => [m, texts[i]!])) as MuenchenSocialCsvs;
      return parseMuenchenSocialAtlas(csvs, source.year);
    }
  }
}

/**
 * Give each area its polygon: the source's own (MSS) or the one of the same ID
 * in the city's outline file. An area without one is dropped and counted in
 * the log, since an outline file older than the data would otherwise hide it.
 */
async function withGeometry(cityId: string, source: SocialAtlasSource, areas: SocialAtlasArea[]): Promise<GeoJsonFeature[]> {
  if (!('outlines' in source)) {
    return areas.map((a) => ({ type: 'Feature', geometry: a.geometry, properties: a.props }));
  }
  const outlines = await loadAreaOutlines(source.outlines);
  const features: GeoJsonFeature[] = [];
  let missing = 0;
  for (const area of areas) {
    const outline = outlines.get(area.props.plrId);
    if (!outline) {
      missing++;
      continue;
    }
    features.push({
      type: 'Feature',
      geometry: outline.geometry,
      properties: { ...area.props, bezId: area.props.bezId || outline.district || '' },
    });
  }
  if (missing > 0) log.warn(`${cityId}: ${missing} areas have no outline in ${source.outlines}`);
  return features;
}

async function ingestCitySocialAtlas(cityId: string, source: SocialAtlasSource, cache: Cache, db: Db | null): Promise<void> {
  const areas = await fetchAreas(cityId, source);
  if (!areas) return;
  if (areas.length === 0) {
    log.warn(`${cityId}: social atlas source returned no areas`);
    return;
  }

  const geojson: GeoJsonFeatureCollection = {
    type: 'FeatureCollection',
    features: await withGeometry(cityId, source, areas),
  };

  cache.set(CK.socialAtlasGeojson(cityId), geojson, SOCIAL_ATLAS_TTL_SECONDS);

  if (db) {
    try {
      await saveSocialAtlas(db, cityId, geojson);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${geojson.features.length} social atlas areas updated`);
}
