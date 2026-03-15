import type { ConstructionSite } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveConstructionSites } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-construction');

export type { ConstructionSite };

const FETCH_TIMEOUT_MS = 15_000;

/** Map VIZ German subtype strings to normalized values */
const SUBTYPE_MAP: Record<string, ConstructionSite['subtype'] | null> = {
  Baustelle: 'construction',
  Bauarbeiten: 'construction',
  Sperrung: 'closure',
  Fahrstreifensperrung: 'closure',
  Storung: 'disruption',
  Störung: 'disruption',
  Gefahr: 'disruption',
  Unfall: null, // filtered out
};

interface VizFeature {
  type: string;
  geometry: { type: string; coordinates: unknown };
  properties: {
    id: string;
    subtype: string;
    street: string;
    section?: string | null;
    content: string;
    direction?: string | null;
    icon: string;
    is_future: boolean;
    validity?: { from?: string | null; to?: string | null };
  };
}

interface VizGeoJSON {
  type: string;
  features?: VizFeature[];
}

export function createConstructionIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestConstruction(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.roadworks) continue;
      try {
        await ingestCityConstruction(city.id, city.dataSources.roadworks.url, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityConstruction(cityId: string, url: string, cache: Cache, db: Db | null): Promise<void> {
  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) {
    log.warn(`${cityId}: VIZ returned ${response.status}`);
    return;
  }

  const data = await response.json() as VizGeoJSON;
  const raw = data?.features ?? [];

  const sites: ConstructionSite[] = [];
  for (const feature of raw) {
    const props = feature.properties;
    const mapped = SUBTYPE_MAP[props.subtype];
    if (mapped === undefined) {
      log.warn(`${cityId}: unknown VIZ subtype "${props.subtype}"`);
      continue;
    }
    if (!mapped) continue; // filter out accidents (Unfall)

    sites.push({
      id: String(props.id),
      subtype: mapped,
      street: props.street || '',
      section: props.section ?? undefined,
      description: props.content || '',
      direction: props.direction ?? undefined,
      validFrom: props.validity?.from ?? undefined,
      validUntil: props.validity?.to ?? undefined,
      isFuture: props.is_future ?? false,
      geometry: feature.geometry as ConstructionSite['geometry'],
    });
  }

  cache.set(CK.constructionSites(cityId), sites, 1800);

  if (db) {
    try {
      await saveConstructionSites(db, cityId, sites);
    } catch (err) {
      log.error(`${cityId} DB write failed`, err);
    }
  }

  log.info(`${cityId}: ${sites.length} construction sites updated`);
}
