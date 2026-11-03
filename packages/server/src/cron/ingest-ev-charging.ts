/**
 * Public charging stations per city from the Bundesnetzagentur's
 * Ladesäulenregister (CC BY 4.0, monthly; one national CSV read once per run
 * for every city with `dataSources.evCharging`), and the live status of
 * Hamburg's charge points from the Urban Data Platform (dl-de/by-2.0), which
 * the route merges onto the register. See .context/ev-charging.md.
 */
import type { CityConfig } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveEvChargingRegister } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import {
  BNETZA_REGISTER_PAGE, createCsvRecordReader, createRegisterCollector, findRegisterCsv,
  hamburgChargingStatusUrl, parseHamburgChargingStatus,
  type EvChargingStatus, type LiveStation, type RegisterTarget,
} from '../lib/ev-charging.js';

const log = createLogger('ingest-ev-charging');

const USER_AGENT = 'CityMonitor/1.0 (+https://citymonitor.app)';
const PAGE_TIMEOUT_MS = 30_000;
/** The CSV is about 55 MB; it took 45 s from this container in 2026-11. */
const CSV_TIMEOUT_MS = 300_000;
const STATUS_TIMEOUT_MS = 30_000;
/** Two weekly runs: one failed run keeps the stations, then the route falls back to the stored edition. */
export const EV_CHARGING_REGISTER_TTL_SECONDS = 14 * 86_400;
/** Three status runs (every 5 min): after that the map shows the stations without live status. */
export const EV_CHARGING_STATUS_TTL_SECONDS = 900;
/** The status query has about 2,540 charge points at 1,000 a page. */
const MAX_STATUS_PAGES = 6;

/** Stream the CSV through the record reader into the collector. */
async function readRegister(res: Response, collector: ReturnType<typeof createRegisterCollector>): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  const csv = createCsvRecordReader(';');
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const record of csv.push(decoder.decode(value, { stream: true }))) collector.add(record);
  }
  for (const record of csv.push(decoder.decode())) collector.add(record);
  for (const record of csv.end()) collector.add(record);
}

function target(city: CityConfig): RegisterTarget | null {
  const source = city.dataSources.evCharging;
  if (!source) return null;
  return { cityId: city.id, kreis: source.kreis, box: city.boundingBox, keepEvse: source.liveStatus !== undefined };
}

/** The register job: weekly, one download for every configured city. */
export function createEvChargingIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestEvCharging(): Promise<void> {
    const targets = getActiveCities().map(target).filter((t): t is RegisterTarget => t !== null);
    if (targets.length === 0) return;

    const page = await log.fetch(BNETZA_REGISTER_PAGE, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!page.ok) {
      log.warn(`register page returned ${page.status}`);
      return;
    }
    const csv = findRegisterCsv(await page.text());
    if (!csv) {
      // The page was relaunched or renamed the file: keep the stored edition
      log.warn('register page links no Ladesaeulenregister CSV');
      return;
    }

    const res = await log.fetch(csv.url, {
      signal: AbortSignal.timeout(CSV_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok || !res.body) {
      log.warn(`register CSV returned ${res.status}`);
      return;
    }
    const collector = createRegisterCollector(targets);
    await readRegister(res, collector);
    const byCity = collector.result();

    for (const t of targets) {
      const stations = byCity.get(t.cityId) ?? [];
      if (stations.length === 0) {
        // A renamed Kreis or a broken file, not a city without chargers: keep the last edition
        log.warn(`${t.cityId}: no charging stations for Kreis "${t.kreis}" in the ${csv.edition} register`);
        continue;
      }
      const data = { edition: csv.edition, stations };
      cache.set(CK.evChargingRegister(t.cityId), data, EV_CHARGING_REGISTER_TTL_SECONDS);
      if (db) {
        try {
          await saveEvChargingRegister(db, t.cityId, data);
        } catch (err) {
          log.error(`${t.cityId} DB write failed`, err);
        }
      }
      const points = stations.reduce((sum, s) => sum + s.points, 0);
      log.info(`${t.cityId}: ${stations.length} charging stations, ${points} charge points (register ${csv.edition})`);
    }
    log.info(`register ${csv.edition}: ${collector.rowCount()} rows read`);
  };
}

async function fetchHamburgStatus(city: CityConfig, baseUrl: string): Promise<EvChargingStatus | null> {
  const stations = new Map<string, LiveStation>();
  let url: string | null = hamburgChargingStatusUrl(baseUrl);
  for (let page = 0; url && page < MAX_STATUS_PAGES; page++) {
    const res = await log.fetch(url, {
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      log.warn(`${city.id}: live status returned ${res.status}`);
      return null;
    }
    const json = await res.json() as { '@iot.nextLink'?: unknown };
    if (!parseHamburgChargingStatus(json, city.boundingBox, stations)) {
      log.warn(`${city.id}: live status answer is not a SensorThings collection`);
      return null;
    }
    const next = json['@iot.nextLink'];
    url = typeof next === 'string' ? next : null;
  }
  return { stations: [...stations.values()], updated: new Date().toISOString() };
}

/**
 * The live status job: every 5 minutes, for cities with
 * `dataSources.evCharging.liveStatus`. Cache only: a stored status would be
 * shown as live after a restart, and the job runs on every start instead.
 */
export function createEvChargingStatusIngestion(cache: Cache) {
  return async function ingestEvChargingStatus(): Promise<void> {
    for (const city of getActiveCities()) {
      const live = city.dataSources.evCharging?.liveStatus;
      if (!live) continue;
      try {
        const status = await fetchHamburgStatus(city, live.url);
        if (!status) continue;
        if (status.stations.length === 0) {
          log.warn(`${city.id}: live status lists no charge points in the city`);
          continue;
        }
        cache.set(CK.evChargingStatus(city.id), status, EV_CHARGING_STATUS_TTL_SECONDS);
        const points = status.stations.flatMap((s) => s.points);
        const available = points.filter((p) => p.status === 'available').length;
        log.info(`${city.id}: live status of ${points.length} charge points at ${status.stations.length} stations, ${available} available`);
      } catch (err) {
        log.error(`${city.id} live charging status failed`, err);
      }
    }
  };
}
