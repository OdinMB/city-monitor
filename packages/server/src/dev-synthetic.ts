/**
 * Dev entry for synthetic mode: the API on the local database that
 * `npm run db:seed` filled, with no cron jobs, no startup ingestion and no
 * outbound requests, so it needs no API keys and no .env. Production starts
 * from index.ts and never loads this file.
 *
 * Usage (from the repo root): npm run dev:synthetic
 *   npm run dev:synthetic -- --city hamburg   # the city `db:seed -- --city hamburg` seeded
 */

import { CK } from './lib/cache-keys.js';
import { createLogger } from './lib/logger.js';
import { assertLocalDatabaseUrl, blockExternalFetch, syntheticDatabaseUrl } from './synthetic/local-guard.js';

const log = createLogger('synthetic');
const cityArg = process.argv.indexOf('--city');
const CITY = cityArg === -1 ? 'berlin' : String(process.argv[cityArg + 1]);

process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection — exiting', reason);
  process.exit(1);
});

try {
  // Set here, so neither a DATABASE_URL in the shell nor one in .env can point this mode elsewhere
  const url = syntheticDatabaseUrl();
  assertLocalDatabaseUrl(url);
  process.env.DATABASE_URL = url;
  process.env.ACTIVE_CITIES = CITY;
  blockExternalFetch();

  // Imported only now, so no module of the app sees the environment or fetch from before
  const { getCityConfig } = await import('./config/index.js');
  if (getCityConfig(CITY)?.id !== CITY) throw new Error(`--city ${CITY}: not a city in config/index.ts`);
  const { createApp } = await import('./app.js');
  const { generateSyntheticAirQuality, seedFromModel } = await import('./synthetic/generate.js');
  const { app, cache } = await createApp({ synthetic: true });

  // Production keeps current air quality in the cache only, so the seed cannot store it.
  // The briefing's model names the seed, so the values match the seeded data set.
  const seed = seedFromModel(cache.get<{ model?: string }>(CK.newsSummary(CITY))?.model) ?? 1;
  cache.set(CK.airQuality(CITY), generateSyntheticAirQuality({ now: new Date(), seed }), 7 * 86_400);

  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => {
    const { host, pathname } = new URL(url);
    log.info(`synthetic mode on port ${port}: ${CITY}, database ${host}${pathname} (seed ${seed}), no ingestion, outbound requests blocked`);
  });
} catch (err) {
  log.error('startup failed', err);
  process.exit(1);
}
