import type { CityConfig, CityFeature } from '@city-monitor/shared';
import { groupsStateMembersByBezirk, hasDistrictMayors, hasParliamentConfig } from '../cron/ingest-political.js';

/**
 * Berlin's own sources. Each of their jobs fetches for Berlin alone and stores
 * under `berlin` (BERLIN_ONLY_JOBS in app.ts, the `getCityConfig('berlin')`
 * check in each job).
 */
const BERLIN_OWN_SOURCES: readonly CityFeature[] = ['bathing', 'wastewater', 'laborMarket', 'population', 'feuerwehr'];

/**
 * Each feature the server ingests, with the condition its job checks before
 * fetching for a city (packages/server/src/cron/ingest-*.ts).
 */
const INGESTED: ReadonlyArray<[CityFeature, (city: CityConfig) => boolean]> = [
  ['news', (c) => c.feeds.length > 0],
  ['police', (c) => c.dataSources.police !== undefined],
  ['nina', (c) => c.country === 'DE' && c.dataSources.nina !== undefined],
  ['pollen', (c) => c.dataSources.pollen !== undefined],
  ['waterLevels', (c) => (c.dataSources.waterLevels?.stations.length ?? 0) > 0],
  ['transit', (c) => (c.dataSources.transit?.stations?.length ?? 0) > 0],
  ['events', (c) => (c.dataSources.events?.length ?? 0) > 0],
  ['appointments', (c) => c.dataSources.appointments !== undefined],
  ['budget', (c) => c.dataSources.budget !== undefined],
  ['roadworks', (c) => c.dataSources.roadworks !== undefined],
  ['socialAtlas', (c) => c.dataSources.socialAtlas !== undefined],
  ['noiseSensors', (c) => c.dataSources.noiseSensors !== undefined],
  ['councilMeetings', (c) => c.dataSources.councilMeetings !== undefined],
  ['political', hasParliamentConfig],
  ['districtMayors', hasDistrictMayors],
  ['stateByDistrict', (c) => hasParliamentConfig(c) && groupsStateMembersByBezirk(c)],
  ...BERLIN_OWN_SOURCES.map((f): [CityFeature, (city: CityConfig) => boolean] => [f, (c) => c.id === 'berlin']),
];

/**
 * The features the server ingests data for in `city`. The web config of the
 * same city must list exactly these, plus the web app's own features
 * (packages/web/src/config/index.test.ts checks).
 */
export function cityFeatures(city: CityConfig): CityFeature[] {
  return INGESTED.filter(([, ingests]) => ingests(city)).map(([feature]) => feature);
}
