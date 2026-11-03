/**
 * Which station set a city's air-quality map and tile get (.context/air-quality-stations.md):
 * the official UBA stations while their data is fresh, otherwise WAQI as the fallback.
 * Decided here, on the server, so the browser receives one set and never both.
 */
import type { AirQualityGridPoint, AirQualityStation } from '@city-monitor/shared';
import type { Cache } from './cache.js';
import { CK } from './cache-keys.js';

/**
 * UBA's newest hour normally ends one to two hours ago (its readings arrive late),
 * so four hours means about two missed hours in a row.
 */
export const UBA_FRESH_MAX_AGE_MS = 4 * 3600_000;

/** Whether the city's UBA readings count as fresh: the newest one ended under UBA_FRESH_MAX_AGE_MS ago. */
export function ubaIsFresh(stations: readonly AirQualityStation[] | null | undefined, now = Date.now()): boolean {
  if (!stations?.length) return false;
  const newest = Math.max(...stations.map((s) => Date.parse(s.measuredAt)).filter(Number.isFinite));
  return Number.isFinite(newest) && now - newest < UBA_FRESH_MAX_AGE_MS;
}

/** The UBA stations to serve: all of them while fresh, null once stale (WAQI takes over). */
export function servedUbaStations(stations: AirQualityStation[] | null | undefined, now = Date.now()): AirQualityStation[] | null {
  return stations && ubaIsFresh(stations, now) ? stations : null;
}

/** Whether the cache holds fresh UBA readings for the city. */
export function ubaIsFreshInCache(cache: Cache, cityId: string, now = Date.now()): boolean {
  return ubaIsFresh(cache.get<AirQualityStation[]>(CK.airQualityStations(cityId)), now);
}

/** A WAQI point (it links to aqicn.org); Sensor.Community points link elsewhere. */
export function isWaqiPoint(point: Pick<AirQualityGridPoint, 'url'>): boolean {
  return /^https:\/\/aqicn\.org\//.test(point.url ?? '');
}

/** The grid to serve: without WAQI points while UBA is fresh, else whole. Sensor.Community points always stay. */
export function servedGrid(grid: AirQualityGridPoint[], ubaFresh: boolean): AirQualityGridPoint[] {
  return ubaFresh ? grid.filter((p) => !isWaqiPoint(p)) : grid;
}
