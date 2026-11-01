import type { SocialAtlasFeatureProps } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveSocialAtlas } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-social-atlas');

const FETCH_TIMEOUT_MS = 60_000;
const SOCIAL_ATLAS_TTL_SECONDS = 604800; // 7 days

interface WfsFeature {
  type: string;
  geometry: unknown;
  properties: Record<string, unknown>;
}

interface WfsResponse {
  type: string;
  features?: WfsFeature[];
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

/**
 * The two MSS layers of the edition the WFS URL names. Each edition is its own
 * service (`…/wfs/mss_2025`) whose layers carry the year (`mss_2025:mss2025_indexind_542`),
 * so a new edition only needs a new `wfsUrl` in the city config.
 */
export function mssLayerNames(wfsUrl: string): { indicators: string; indices: string } {
  const workspace = wfsUrl.replace(/\/+$/, '').split('/').pop() ?? '';
  const match = /^mss_(\d{4})$/.exec(workspace);
  if (!match) throw new Error(`social atlas wfsUrl must end in mss_<year>: ${wfsUrl}`);
  const year = match[1];
  return {
    indicators: `${workspace}:mss${year}_indexind_542`,
    indices: `${workspace}:mss${year}_indizes_542`,
  };
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
        await ingestCitySocialAtlas(city.id, city.dataSources.socialAtlas.wfsUrl, cache, db);
      } catch (err) {
        log.error(`${city.id} social atlas failed`, err);
      }
    }
  };
}

async function ingestCitySocialAtlas(cityId: string, wfsUrl: string, cache: Cache, db: Db | null): Promise<void> {
  // Fetch both WFS layers
  const layers = mssLayerNames(wfsUrl);
  const indicatorUrl = buildWfsUrl(wfsUrl, layers.indicators);
  const indicesUrl = buildWfsUrl(wfsUrl, layers.indices);

  const [indicatorRes, indicesRes] = await Promise.all([
    log.fetch(indicatorUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    log.fetch(indicesUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
  ]);

  if (!indicatorRes.ok) {
    log.warn(`${cityId}: WFS indicator layer returned ${indicatorRes.status}`);
    return;
  }
  if (!indicesRes.ok) {
    log.warn(`${cityId}: WFS indices layer returned ${indicesRes.status}`);
    return;
  }

  const indicatorData = await indicatorRes.json() as WfsResponse;
  const indicesData = await indicesRes.json() as WfsResponse;

  const indicatorFeatures = indicatorData.features ?? [];
  const indicesFeatures = indicesData.features ?? [];

  // Build lookup for composite indices by plr_id
  const indicesMap = new Map<string, { si_n: number; si_v: string }>();
  for (const f of indicesFeatures) {
    const plrId = f.properties.plr_id as string;
    if (plrId && f.properties.si_n != null) {
      indicesMap.set(plrId, {
        si_n: f.properties.si_n as number,
        si_v: f.properties.si_v as string,
      });
    }
  }

  // Join and transform: filter valid features, merge index data
  const features: GeoJsonFeature[] = [];
  for (const f of indicatorFeatures) {
    const props = f.properties;
    if (props.kom !== 'gültig') continue;

    const plrId = props.plr_id as string;
    const index = indicesMap.get(plrId);

    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        plrId,
        plrName: props.plr_name as string,
        bezId: props.bez_id as string,
        population: (props.ew as number) ?? 0,
        statusIndex: index?.si_n ?? 0,
        statusLabel: index?.si_v ?? '',
        unemployment: (props.s1 as number) ?? 0,
        singleParent: (props.s2 as number) ?? 0,
        welfare: (props.s3 as number) ?? 0,
        childPoverty: (props.s4 as number) ?? 0,
      },
    });
  }

  const geojson: GeoJsonFeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  cache.set(CK.socialAtlasGeojson(cityId), geojson, SOCIAL_ATLAS_TTL_SECONDS);

  if (db) {
    try {
      await saveSocialAtlas(db, cityId, geojson);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${features.length} social atlas areas updated`);
}

