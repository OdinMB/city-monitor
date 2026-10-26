/**
 * When a dashboard tile's data counts as stale (TileFooter then says "outdated").
 *
 * Rule: a tile is stale once its data is older than the feeding job's interval
 * plus half an interval of grace (at least 15 min), plus the longest the browser
 * may keep showing an older copy (the hook's refetch interval plus the route's
 * HTTP max-age), so "outdated" appears only after a scheduled run was missed.
 *
 * `job` follows the cron schedules in packages/server/src/app.ts, `httpMaxAge`
 * the cacheFor() values there, and `refetch` the tile's hook (its staleTime when
 * it doesn't poll). Update a row when any of them changes.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface FeedTiming {
  /** How often new data reaches the server cache on a healthy site. */
  job: number;
  /** How often the tile's hook fetches again. */
  refetch: number;
  /** Cache-Control max-age of the tile's API route. */
  httpMaxAge: number;
}

export const FEED_TIMINGS = {
  news:            { job: 10 * MIN,  refetch: 5 * MIN,  httpMaxAge: 5 * MIN },  // ingest-feeds */10
  // summarize-news runs every 6 h but keeps the previous briefing while the top
  // headlines are unchanged, so one run can pass without a new one.
  briefing:        { job: 12 * HOUR, refetch: HOUR,     httpMaxAge: 5 * MIN },
  weather:         { job: HOUR,      refetch: 15 * MIN, httpMaxAge: 5 * MIN },  // ingest-weather hourly
  airQuality:      { job: HOUR,      refetch: 30 * MIN, httpMaxAge: 10 * MIN }, // written by ingest-weather
  transit:         { job: 15 * MIN,  refetch: 5 * MIN,  httpMaxAge: 2 * MIN },  // ingest-transit */15
  waterLevels:     { job: 15 * MIN,  refetch: 15 * MIN, httpMaxAge: 5 * MIN },  // ingest-water-levels */15
  events:          { job: 6 * HOUR,  refetch: 30 * MIN, httpMaxAge: 30 * MIN }, // ingest-events every 6 h
  appointments:    { job: 12 * HOUR, refetch: 30 * MIN, httpMaxAge: HOUR },     // ingest-appointments every 12 h
  pollen:          { job: 6 * HOUR,  refetch: HOUR,     httpMaxAge: 12 * HOUR }, // ingest-pollen every 6 h
  councilMeetings: { job: 6 * HOUR,  refetch: HOUR,     httpMaxAge: HOUR },     // ingest-council-meetings every 6 h
  bathing:         { job: DAY,       refetch: DAY,      httpMaxAge: 12 * HOUR }, // ingest-bathing daily
  laborMarket:     { job: DAY,       refetch: HOUR,     httpMaxAge: HOUR },     // ingest-labor-market daily
  budget:          { job: DAY,       refetch: HOUR,     httpMaxAge: HOUR },     // ingest-budget daily
  feuerwehr:       { job: DAY,       refetch: DAY,      httpMaxAge: 12 * HOUR }, // ingest-feuerwehr daily
  wastewater:      { job: DAY,       refetch: DAY,      httpMaxAge: 12 * HOUR }, // ingest-wastewater daily
  political:       { job: 7 * DAY,   refetch: DAY,      httpMaxAge: HOUR },     // ingest-political weekly
  population:      { job: 31 * DAY,  refetch: 12 * HOUR, httpMaxAge: 12 * HOUR }, // ingest-population on the 1st of each month
} satisfies Record<string, FeedTiming>;

export type Feed = keyof typeof FEED_TIMINGS;

/** Max data age (ms) before the tile fed by `feed` counts as stale. */
export function staleAfter(feed: Feed): number {
  const { job, refetch, httpMaxAge } = FEED_TIMINGS[feed];
  return job + Math.max(job / 2, 15 * MIN) + refetch + httpMaxAge;
}
