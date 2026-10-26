import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEED_TIMINGS, staleAfter, type Feed } from './freshness';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// How often each feeding job is scheduled in packages/server/src/app.ts.
// A tile that calls its data "outdated" before the next run is even due is
// the bug these tests guard against.
const CRON_INTERVAL: Record<Feed, number> = {
  news: 10 * MIN,         // ingest-feeds          */10 * * * *
  briefing: 6 * HOUR,     // summarize-news        5 */6 * * *
  weather: HOUR,          // ingest-weather        0 * * * *
  airQuality: HOUR,       // ingest-weather        0 * * * *
  transit: 15 * MIN,      // ingest-transit        */15 * * * *
  waterLevels: 15 * MIN,  // ingest-water-levels   */15 * * * *
  events: 6 * HOUR,       // ingest-events         0 */6 * * *
  appointments: 2 * HOUR, // ingest-appointments   0 */2 * * *
  pollen: 6 * HOUR,       // ingest-pollen         0 */6 * * *
  councilMeetings: 6 * HOUR, // ingest-council-meetings 0 */6 * * *
  bathing: DAY,           // ingest-bathing        0 6 * * *
  laborMarket: DAY,       // ingest-labor-market   0 7 * * *
  budget: DAY,            // ingest-budget         0 6 * * *
  feuerwehr: DAY,         // ingest-feuerwehr      0 8 * * *
  wastewater: DAY,        // ingest-wastewater     0 6 * * *
  political: 7 * DAY,     // ingest-political      0 4 * * 1
  population: 31 * DAY,   // ingest-population     0 6 1 * *
};

describe('staleAfter', () => {
  it.each(Object.keys(CRON_INTERVAL) as Feed[])('%s: only after a scheduled run was missed', (feed) => {
    const { job, refetch, httpMaxAge } = FEED_TIMINGS[feed];
    const browserLag = refetch + httpMaxAge;
    expect(job).toBeGreaterThanOrEqual(CRON_INTERVAL[feed]);
    expect(staleAfter(feed)).toBeGreaterThanOrEqual(1.5 * CRON_INTERVAL[feed] + browserLag);
    expect(staleAfter(feed)).toBeGreaterThanOrEqual(CRON_INTERVAL[feed] + 15 * MIN + browserLag);
  });

  it('gives the 6-hourly briefing more than 6 hours before it is outdated', () => {
    expect(staleAfter('briefing')).toBeGreaterThan(6 * HOUR);
  });

  it('is where every strip that shows freshness takes its threshold from', () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../components/strips');
    const strips = readdirSync(dir).filter((f) => f.endsWith('Strip.tsx'));
    let checked = 0;
    for (const file of strips) {
      const src = readFileSync(resolve(dir, file), 'utf8');
      if (!src.includes('useFreshness(')) continue;
      checked++;
      expect(src, file).toMatch(/const FRESH_MAX_AGE = staleAfter\('\w+'\);/);
      expect(src, file).toContain('useFreshness(fetchedAt, FRESH_MAX_AGE)');
    }
    expect(checked).toBeGreaterThan(0);
  });
});
