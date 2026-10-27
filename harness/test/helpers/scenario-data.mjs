// Test helper for scenario-data.test.mjs. It starts nothing and connects to
// nothing: it registers tsx and the shared-source hook as the harness's server
// processes do, builds the synthetic seed's snapshot rows for the types the
// scenarios change (the seed's generator and the product's write functions,
// on a stand-in database that records the rows), applies every scenario at a
// fixed time, and prints as JSON what the API would then serve for each type,
// checked against the shared schemas, the web app's stale limits, and the SQL
// the run's snapshot store would send for each scenario (built on drizzle.mock).
import { register } from 'node:module';

const { register: registerTsx } = await import('tsx/esm/api');
registerTsx();
register('../../lib/shared-source-hook.mjs', import.meta.url);

const repo = (p) => new URL(`../../../${p}`, import.meta.url).href;
const { generateSyntheticData } = await import(repo('packages/server/src/synthetic/generate.ts'));
const writes = await import(repo('packages/server/src/db/writes.ts'));
const schema = await import(repo('packages/server/src/db/schema.ts'));
const { staleAfter } = await import(repo('packages/web/src/lib/freshness.ts'));
const shared = await import('@city-monitor/shared/schemas.js');
const { and, desc, eq, inArray } = await import('drizzle-orm');
const { drizzle } = await import('drizzle-orm/postgres-js');
const { SCENARIO_NAMES, SNAPSHOT, newestFirst, planScenario, scenarioTypes } = await import('../../lib/scenarios.mjs');
const { snapshotStore } = await import('../../lib/snapshot-store.mjs');

const NOW = Date.parse('2026-10-27T07:30:00.000Z');
const CITY = 'berlin';
const HOUR = 3_600_000;

// The rows seedDatabase (packages/server/src/synthetic/seed.ts) writes for these
// types: the history snapshots with their own fetched_at first, then one row per
// save function, fetched now. Ids count up in that order, as a serial column does.
const data = generateSyntheticData({ now: new Date(NOW), seed: 1 });
const rows = Object.fromEntries(Object.values(SNAPSHOT).map((type) => [type, []]));
let nextId = 1;
for (const s of data.history) {
  if (s.type in rows) rows[s.type].push({ id: nextId++, fetchedAt: s.fetchedAt.getTime(), data: s.data });
}
const recorder = {
  insert: () => ({
    values: async (values) => {
      for (const row of [values].flat()) if (row.type in rows) rows[row.type].push({ id: nextId++, fetchedAt: NOW, data: row.data });
    },
  }),
};
await writes.saveWeather(recorder, CITY, data.weather);
await writes.saveTransitAlerts(recorder, CITY, data.transit);
await writes.saveNinaWarnings(recorder, CITY, data.nina);
await writes.saveWaterLevels(recorder, CITY, data.waterLevels);

// How the API reads each type (packages/server/src/db/reads.ts): the newest row,
// none for NINA once it is over 3 h old, and nothing when the data fails its schema.
const every = (itemSchema) => (d) => Array.isArray(d) && d.every((item) => itemSchema.safeParse(item).success);
const LOADERS = {
  [SNAPSHOT.weather]: { valid: (d) => shared.WeatherDataSchema.safeParse(d).success },
  [SNAPSHOT.transit]: { valid: every(shared.TransitAlertSchema) },
  [SNAPSHOT.nina]: { valid: every(shared.NinaWarningSchema), maxAgeMs: 3 * HOUR },
  [SNAPSHOT.waterLevels]: { valid: (d) => shared.WaterLevelDataSchema.safeParse({ stations: d?.stations, fetchedAt: '' }).success },
};

function served(byType) {
  const out = {};
  for (const [type, { valid, maxAgeMs }] of Object.entries(LOADERS)) {
    const list = [...(byType[type] ?? [])].sort(newestFirst);
    const newest = list[0];
    const ageMs = newest ? NOW - newest.fetchedAt : null;
    out[type] = {
      rowCount: list.length,
      served: newest && !(maxAgeMs && ageMs > maxAgeMs) ? { ageMs, valid: valid(newest.data), data: newest.data } : null,
    };
  }
  return out;
}

const mock = drizzle.mock({ schema });
const store = snapshotStore(mock, { table: schema.snapshots, and, desc, eq, inArray }, CITY);

const scenarios = {};
for (const name of SCENARIO_NAMES) {
  const touched = Object.fromEntries(scenarioTypes(name).map((type) => [type, rows[type]]));
  const first = planScenario(name, touched, NOW);
  const again = planScenario(name, structuredClone(touched), new Date(NOW));
  scenarios[name] = {
    types: scenarioTypes(name),
    served: served({ ...rows, ...first.rows }),
    changes: first.changes,
    deterministic: JSON.stringify(first) === JSON.stringify(again),
    sql: [
      ...scenarioTypes(name).map((type) => store.readQuery(type).toSQL()),
      ...store.writeQueries(mock, first.changes).map((query) => query.toSQL()),
    ],
  };
}

console.log(JSON.stringify({
  now: NOW,
  city: CITY,
  staleAfter: { weather: staleAfter('weather'), transit: staleAfter('transit'), waterLevels: staleAfter('waterLevels') },
  seed: served(rows),
  scenarios,
}));
