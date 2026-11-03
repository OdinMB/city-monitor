/**
 * The heat-relief layer's lists per city from `dataSources.heatRelief`: cool
 * places (Berlin, Köln), drinking fountains (all four cities) and public
 * toilets (Berlin, Köln, München), from each city's open WFS or list
 * (dl-de/zero-2.0 or dl-de/by-2.0). The lists change a few times a year, so
 * the job runs weekly. See .context/heat-relief.md.
 */
import type { CityConfig, HeatReliefData, HeatReliefPlace, HeatReliefSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveHeatRelief } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { heatReliefRequests, parseHeatRelief } from '../lib/heat-relief-parsers.js';

const log = createLogger('ingest-heat-relief');

const FETCH_TIMEOUT_MS = 30_000;
/** A day past the weekly run, so a slow or failed run does not empty the layer before the next. */
export const HEAT_RELIEF_TTL_SECONDS = 8 * 86_400;

/** The places of one source, or null when a request failed, was not in the expected format or gave none. */
async function fetchSource(city: CityConfig, source: HeatReliefSource): Promise<HeatReliefPlace[] | null> {
  const places: HeatReliefPlace[] = [];
  for (const { url, layer } of heatReliefRequests(source)) {
    const res = await log.fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)' },
    });
    if (!res.ok) {
      log.warn(`${city.id}: ${source.provider} returned ${res.status}`);
      return null;
    }
    const parsed = parseHeatRelief(source, await res.text(), layer);
    if (!parsed) {
      log.warn(`${city.id}: ${source.provider} answer is not in the expected format`);
      return null;
    }
    places.push(...parsed);
  }
  if (places.length === 0) {
    log.warn(`${city.id}: ${source.provider} lists no places`);
    return null;
  }
  return places;
}

function inBox(p: HeatReliefPlace, box: CityConfig['boundingBox']): boolean {
  return p.lat >= box.south && p.lat <= box.north && p.lon >= box.west && p.lon <= box.east;
}

export function createHeatReliefIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestHeatRelief(): Promise<void> {
    for (const city of getActiveCities()) {
      const sources = city.dataSources.heatRelief;
      if (!sources || sources.length === 0) continue;
      try {
        const previous = cache.get<HeatReliefData>(CK.heatRelief(city.id));
        const places: HeatReliefPlace[] = [];
        const counts: string[] = [];
        let fresh = 0;
        for (const source of sources) {
          let got: HeatReliefPlace[] | null = null;
          try {
            got = await fetchSource(city, source);
          } catch (err) {
            log.error(`${city.id}: ${source.provider} failed`, err);
          }
          if (got) {
            fresh++;
            const kept = got.filter((p) => inBox(p, city.boundingBox));
            places.push(...kept);
            counts.push(`${kept.length} ${source.kind}`);
          } else {
            // A failed list keeps last week's places of its kind, so one broken service empties nothing
            places.push(...(previous?.places.filter((p) => p.kind === source.kind) ?? []));
          }
        }
        if (fresh === 0) {
          log.warn(`${city.id}: no heat-relief list could be read, keeping the previous data`);
          continue;
        }
        const data: HeatReliefData = { places };
        cache.set(CK.heatRelief(city.id), data, HEAT_RELIEF_TTL_SECONDS);
        if (db) {
          try {
            await saveHeatRelief(db, city.id, data);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        log.info(`${city.id}: heat relief ${counts.join(', ')}${fresh < sources.length ? ` (${sources.length - fresh} list(s) kept from before)` : ''}`);
      } catch (err) {
        log.error(`${city.id} heat relief failed`, err);
      }
    }
  };
}
