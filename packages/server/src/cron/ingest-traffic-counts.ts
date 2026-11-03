/**
 * Live traffic counts per counting site, compared with the usual count for
 * that hour, per city from `dataSources.trafficCounts`: Hamburg's infrared car
 * and bicycle counters on the Urban Data Platform's SensorThings API, with the
 * sites' names from the Verkehrszählstellen WFS (both dl-de/by-2.0, Freie und
 * Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende). See
 * .context/traffic-counts.md.
 */
import type { CityConfig, TrafficCountData, TrafficCountMode, TrafficCountSite, TrafficCountSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveTrafficCounts } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import {
  aggregateSites, hamburgHoursUrl, hamburgLatestUrl, hamburgSitesUrl, parseHamburgCounters, parseHamburgHours,
  parseHamburgSiteNames, pickCountHour, referenceHours,
} from '../lib/traffic-count-parsers.js';

const log = createLogger('ingest-traffic-counts');

/** The windowed query took 11 s for 829 counters on 2026-11-03. */
const FETCH_TIMEOUT_MS = 60_000;
/** Two job runs (every 15 min): a missed run keeps the counts. */
export const TRAFFIC_COUNTS_TTL_SECONDS = 1800;
/** The site names change with a new counting site only: read the 1.5 MB of site lists once a day. */
export const SITE_NAMES_MAX_AGE_MS = 24 * 3_600_000;

const MODES: readonly TrafficCountMode[] = ['car', 'bike'];

async function getJson(cityId: string, url: string): Promise<unknown | null> {
  const res = await log.fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)', Accept: 'application/json' },
  });
  if (!res.ok) {
    log.warn(`${cityId}: ${new URL(url).hostname} returned ${res.status}`);
    return null;
  }
  return res.json();
}

type SiteNames = Record<TrafficCountMode, Map<string, string>>;

/** A mode's own site list first, then the other one: some car sites are only on the bicycle list. */
function namesFor(names: SiteNames, mode: TrafficCountMode): Map<string, string> {
  const other = mode === 'car' ? names.bike : names.car;
  return new Map([...other, ...names[mode]]);
}

async function fetchMode(
  city: CityConfig,
  source: TrafficCountSource,
  mode: TrafficCountMode,
  names: SiteNames,
  now: number,
): Promise<TrafficCountSite[] | null> {
  const latest = await getJson(city.id, hamburgLatestUrl(source.url, mode));
  if (latest === null) return null;
  const counters = parseHamburgCounters(latest, city.boundingBox);
  if (!counters) {
    log.warn(`${city.id}: ${mode} counters answer is not a SensorThings collection`);
    return null;
  }
  const hour = pickCountHour(counters.map((c) => c.latest), now);
  if (hour === null) {
    log.warn(`${city.id}: no ${mode} counter has reported in the last hours`);
    return null;
  }
  const references = referenceHours(hour);
  const windowed = await getJson(city.id, hamburgHoursUrl(source.url, mode, [hour, ...references]));
  if (windowed === null) return null;
  const hours = parseHamburgHours(windowed, hour, references);
  if (!hours) {
    log.warn(`${city.id}: ${mode} hourly counts answer is not a SensorThings collection`);
    return null;
  }
  return aggregateSites(mode, counters, hours, namesFor(names, mode), hour);
}

/** `now` is for tests, which step through the day the site names are kept. */
export function createTrafficCountIngestion(cache: Cache, db: Db | null = null, now: () => number = Date.now) {
  const siteNames = new Map<string, { names: SiteNames; fetchedAt: number }>();
  /** The hours of the last stored row per city: a row is stored when a new hour comes in. */
  const lastSaved = new Map<string, string>();

  async function namesOf(city: CityConfig, source: TrafficCountSource, t: number): Promise<SiteNames> {
    const kept = siteNames.get(city.id);
    if (kept && t - kept.fetchedAt < SITE_NAMES_MAX_AGE_MS) return kept.names;
    const names: SiteNames = { car: new Map(), bike: new Map() };
    let complete = true;
    for (const mode of MODES) {
      try {
        const json = await getJson(city.id, hamburgSitesUrl(source.sitesWfsUrl, mode));
        if (json === null) complete = false;
        else names[mode] = parseHamburgSiteNames(json);
      } catch (err) {
        complete = false;
        log.warn(`${city.id}: ${mode} site names failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // A failed list keeps yesterday's names and is asked for again next run
    if (!complete && kept) return kept.names;
    if (complete) siteNames.set(city.id, { names, fetchedAt: t });
    return names;
  }

  return async function ingestTrafficCounts(): Promise<void> {
    for (const city of getActiveCities()) {
      const source = city.dataSources.trafficCounts;
      if (!source) continue;
      try {
        const t = now();
        const names = await namesOf(city, source, t);
        const previous = cache.get<TrafficCountData>(CK.trafficCounts(city.id));
        const sites: TrafficCountSite[] = [];
        for (const mode of source.modes) {
          let modeSites: TrafficCountSite[] | null = null;
          try {
            modeSites = await fetchMode(city, source, mode, names, t);
          } catch (err) {
            log.error(`${city.id} ${mode} counts failed`, err);
          }
          if (modeSites && modeSites.length > 0) sites.push(...modeSites);
          // A mode that failed keeps its last sites while they are cached
          else sites.push(...(previous?.sites.filter((s) => s.mode === mode) ?? []));
        }
        if (sites.length === 0) {
          log.warn(`${city.id}: no traffic counts`);
          continue;
        }
        const data: TrafficCountData = { sites, updated: new Date(t).toISOString() };
        cache.set(CK.trafficCounts(city.id), data, TRAFFIC_COUNTS_TTL_SECONDS);

        const hoursKey = source.modes.map((m) => sites.find((s) => s.mode === m)?.hour ?? '').join('|');
        if (db && lastSaved.get(city.id) !== hoursKey) {
          try {
            await saveTrafficCounts(db, city.id, data);
            lastSaved.set(city.id, hoursKey);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        const summary = source.modes.map((m) => `${sites.filter((s) => s.mode === m).length} ${m}`).join(', ');
        log.info(`${city.id}: traffic counts at ${summary} sites`);
      } catch (err) {
        log.error(`${city.id} traffic counts failed`, err);
      }
    }
  };
}
