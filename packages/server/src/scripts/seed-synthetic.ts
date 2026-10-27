/**
 * CLI script to fill the local dev database with synthetic data: applies the
 * migrations, empties every app table without asking and writes one made-up
 * data set for one configured city (Berlin unless --city names another),
 * dated relative to now. Refuses any database that is not city_monitor_dev on
 * this machine, and never reads .env or DATABASE_URL.
 *
 * Usage (from the repo root, with `docker compose up -d db` running):
 *   npm run db:seed
 *   npm run db:seed -- --seed 7       # a different, equally reproducible data set
 *   npm run db:seed -- --city hamburg # another city in config/index.ts; serve it with dev:synthetic --city hamburg
 *
 * SYNTHETIC_DATABASE_URL overrides the docker-compose database; it must still
 * name localhost or 127.0.0.1, and a database other than city_monitor_dev
 * also needs SYNTHETIC_ALLOW_DATABASE_NAME.
 */

import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getCityConfig } from '../config/index.js';
import { syntheticDatabaseUrl } from '../synthetic/local-guard.js';
import { generateSyntheticCityData } from '../synthetic/generate.js';
import { openLocalDatabase, seedDatabase, wipeDatabase, type LocalDatabase } from '../synthetic/seed.js';

const seedArg = process.argv.indexOf('--seed');
const seed = seedArg === -1 ? 1 : Number(process.argv[seedArg + 1]);
if (!Number.isInteger(seed)) {
  console.error('--seed needs an integer, e.g. --seed 7');
  process.exit(1);
}

const cityArg = process.argv.indexOf('--city');
const cityId = cityArg === -1 ? 'berlin' : String(process.argv[cityArg + 1]);
// The config serves active cities only: this one, set here as dev-synthetic.ts does, whatever the shell says
process.env.ACTIVE_CITIES = cityId;
const city = getCityConfig(cityId);
if (city?.id !== cityId) {
  console.error(`--city ${cityId}: not a city in packages/server/src/config/index.ts, e.g. --city berlin`);
  process.exit(1);
}

let local: LocalDatabase;
try {
  local = openLocalDatabase(syntheticDatabaseUrl());
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

/** The Postgres or socket error code, also when Drizzle wraps the error. */
function errorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

try {
  console.log(`Wiping ${local.target} and seeding synthetic data for ${city.name} (seed ${seed})...`);
  await migrate(local.db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  await wipeDatabase(local);
  await seedDatabase(local, generateSyntheticCityData({ now: new Date(), seed, city }));
  console.log(`Done. Start the API with \`npm run dev:synthetic${city.id === 'berlin' ? '' : ` -- --city ${city.id}`}\`.`);
} catch (err) {
  console.error('Error:', err);
  const code = errorCode(err);
  if (code === 'ECONNREFUSED') {
    console.error('Is the database running? Start it with `docker compose up -d db`.');
  } else if (code === '42P07') {
    // duplicate_table: tables without a migrations journal, e.g. from db:push
    console.error('The database has tables the migrations did not create. Reset it with `docker compose down -v`, then seed again.');
  }
  process.exitCode = 1;
} finally {
  await local.close();
}
