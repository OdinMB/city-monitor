import type { ConstructionSite, RoadworksSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveConstructionSites } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import {
  koelnLayerUrl, muenchenUrl, parseHamburgRoadworks, parseKoelnRoadworks, parseMuenchenRoadworks, parseVizBerlin,
} from '../lib/roadworks-parsers.js';

const log = createLogger('ingest-construction');

export type { ConstructionSite };

const FETCH_TIMEOUT_MS = 15_000;
/** München's filtered WFS answer is about 1 MB and the server is slow. */
const SLOW_FETCH_TIMEOUT_MS = 45_000;

export function createConstructionIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestConstruction(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!city.dataSources.roadworks) continue;
      try {
        await ingestCityConstruction(city.id, city.dataSources.roadworks, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

/** The response's JSON, or null (logged) when the provider did not answer 2xx. */
async function fetchJson(cityId: string, url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown | null> {
  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });
  if (!response.ok) {
    log.warn(`${cityId}: roadworks source returned ${response.status}`);
    return null;
  }
  return response.json();
}

/**
 * The city's current sites from its provider, or null when the source failed,
 * so that the last good data stays.
 */
async function fetchSites(cityId: string, source: RoadworksSource, now: Date): Promise<ConstructionSite[] | null> {
  switch (source.provider) {
    case 'viz-berlin': {
      const data = await fetchJson(cityId, source.url);
      return data === null ? null : parseVizBerlin(data, (m) => log.warn(`${cityId}: ${m}`));
    }
    case 'hamburg-ogc': {
      const data = await fetchJson(cityId, source.url);
      return data === null ? null : parseHamburgRoadworks(data, now);
    }
    case 'koeln-wfs': {
      // One request per layer, in turn; a failed layer fails the run rather than drop its sites.
      const sites: ConstructionSite[] = [];
      for (const layer of source.layers) {
        const data = await fetchJson(cityId, koelnLayerUrl(source.url, layer));
        if (data === null) return null;
        sites.push(...parseKoelnRoadworks(data, layer, now));
      }
      return sites;
    }
    case 'muenchen-wfs': {
      const data = await fetchJson(cityId, muenchenUrl(source.url), SLOW_FETCH_TIMEOUT_MS);
      return data === null ? null : parseMuenchenRoadworks(data, now);
    }
  }
}

async function ingestCityConstruction(cityId: string, source: RoadworksSource, cache: Cache, db: Db | null): Promise<void> {
  const sites = await fetchSites(cityId, source, new Date());
  if (sites === null) return;

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
