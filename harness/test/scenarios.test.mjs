import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  applyScenario, DEFAULT_SCENARIO, leftOutTypes, newestFirst, planScenario, SCENARIO_NAMES, SCENARIOS, scenarioPlace,
  scenarioTypes, SNAPSHOT, stormAlerts, stormArea, stormNina,
} from '../lib/scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-27T07:30:00.000Z');
/** A city holding every type the scenarios change, centred where Berlin's config puts Berlin. */
const PLACE = scenarioPlace({ coordinates: { lat: 52.52, lon: 13.405 } }, ['weather', 'transit', 'nina', 'waterLevels', 'news']);
/** A city with no transit source, centred where Hamburg's config puts Hamburg. */
const NO_TRANSIT = scenarioPlace({ coordinates: { lat: 53.5511, lon: 9.9937 } }, ['weather', 'nina', 'waterLevels']);

/** Rows of every type the scenarios change, shaped like the seed's: a current row fetched now and older history. */
function seedLikeRows() {
  let id = 1;
  const history = (type, data, hours) => Array.from({ length: hours }, (_, i) => ({ id: id++, fetchedAt: NOW - (hours - i) * HOUR, data: data(i) }));
  return {
    [SNAPSHOT.weather]: [
      ...history(SNAPSHOT.weather, (i) => ({ current: { temp: i }, hourly: [], daily: [], alerts: [] }), 10),
      { id: id++, fetchedAt: NOW, data: { current: { temp: 20 }, hourly: [{ time: 'x' }], daily: [], alerts: [{ headline: 'seed', severity: 'moderate', description: '', validUntil: '' }] } },
    ],
    [SNAPSHOT.transit]: [{ id: id++, fetchedAt: NOW, data: [{ id: 'seeded-disruption' }] }],
    [SNAPSHOT.nina]: [{ id: id++, fetchedAt: NOW, data: [{ id: 'seeded-warning' }] }],
    [SNAPSHOT.waterLevels]: [
      ...history(SNAPSHOT.waterLevels, () => ({ stations: [] }), 3),
      { id: id++, fetchedAt: NOW, data: { stations: [{ uuid: 'g' }] } },
    ],
  };
}

/** The interface lib/snapshot-store.mjs offers, on an in-memory copy of `rows`. */
function memoryStore(rows) {
  const state = structuredClone(rows);
  const reads = [];
  const writes = [];
  let nextId = 1000;
  return {
    state,
    reads,
    writes,
    async rows(type) {
      reads.push(type);
      return structuredClone(state[type] ?? []).sort(newestFirst);
    },
    async write(changes) {
      writes.push(changes);
      for (const { type, id } of changes.deletes) state[type] = state[type].filter((row) => row.id !== id);
      for (const { type, id, data, fetchedAt } of changes.updates) {
        const row = state[type].find((r) => r.id === id);
        if (data !== undefined) row.data = data;
        if (fetchedAt !== undefined) row.fetchedAt = fetchedAt;
      }
      for (const { type, data, fetchedAt } of changes.inserts) (state[type] ??= []).push({ id: nextId++, data, fetchedAt });
    },
  };
}

describe('scenario names', () => {
  it('include the seed as generated and the quiet, outage, storm and no-data states', () => {
    assert.equal(DEFAULT_SCENARIO, 'default');
    for (const name of ['default', 'quiet', 'outage', 'storm', 'no-data']) assert.ok(SCENARIO_NAMES.includes(name), name);
    for (const name of SCENARIO_NAMES) assert.ok(SCENARIOS[name].summary.length > 10, name);
  });

  it('each scenario changes each snapshot type at most once, and only the four it knows', () => {
    for (const name of SCENARIO_NAMES) {
      const types = scenarioTypes(name);
      assert.equal(new Set(types).size, types.length, name);
      for (const type of types) assert.ok(Object.values(SNAPSHOT).includes(type), `${name} ${type}`);
    }
  });

  it('an unknown name is refused with the list', () => {
    for (const bad of ['nope', '__proto__', 'constructor', '']) {
      assert.throws(() => scenarioTypes(bad), (err) => SCENARIO_NAMES.every((n) => err.message.includes(n)), bad);
      assert.throws(() => planScenario(bad, {}, NOW, PLACE), /unknown scenario/, bad);
      assert.throws(() => planScenario(bad, {}, NOW), /unknown scenario/, `${bad}, before the place is checked`);
    }
  });
});

describe('planScenario', () => {
  it('backdate moves the newest row back and drops every row fetched since then', () => {
    const rows = seedLikeRows();
    const { rows: after, changes } = planScenario('outage', rows, NOW, PLACE);
    const weather = after[SNAPSHOT.weather];
    assert.equal(weather[0].fetchedAt, NOW - 6 * HOUR);
    assert.deepEqual(weather[0].data, rows[SNAPSHOT.weather].at(-1).data, 'the newest row is still the seeded forecast');
    assert.ok(weather.slice(1).every((row) => row.fetchedAt < NOW - 6 * HOUR));
    assert.equal(weather.length, 1 + 4, 'history 10 h to 7 h ago stays');
    const weatherDeletes = changes.deletes.filter((d) => d.type === SNAPSHOT.weather);
    assert.equal(weatherDeletes.length, 6, 'history 6 h to 1 h ago goes');
    assert.equal(after[SNAPSHOT.transit][0].fetchedAt, NOW - 4 * HOUR);
    assert.deepEqual(after[SNAPSHOT.waterLevels], []);
    assert.equal(changes.deletes.filter((d) => d.type === SNAPSHOT.waterLevels).length, 4);
    assert.deepEqual(changes.inserts, []);
  });

  it('backdate leaves a row that is already older alone', () => {
    const rows = { [SNAPSHOT.transit]: [{ id: 1, fetchedAt: NOW - 9 * HOUR, data: [] }], [SNAPSHOT.weather]: [{ id: 2, fetchedAt: NOW - 9 * HOUR, data: {} }] };
    const { rows: after, changes } = planScenario('outage', rows, NOW, PLACE);
    assert.equal(after[SNAPSHOT.transit][0].fetchedAt, NOW - 9 * HOUR);
    assert.deepEqual(changes.updates, []);
  });

  it('put replaces every row with one fetched now; patch-latest changes only the newest row\'s data', () => {
    const rows = seedLikeRows();
    const before = structuredClone(rows);
    const { rows: after, changes } = planScenario('quiet', rows, NOW, PLACE);
    assert.deepEqual(after[SNAPSHOT.transit], [{ id: null, fetchedAt: NOW, data: [] }]);
    assert.deepEqual(after[SNAPSHOT.nina], [{ id: null, fetchedAt: NOW, data: [] }]);
    assert.deepEqual(changes.inserts.map((i) => i.type).sort(), [SNAPSHOT.nina, SNAPSHOT.transit]);
    const weather = after[SNAPSHOT.weather];
    assert.deepEqual(weather[0].data.alerts, []);
    assert.equal(weather[0].fetchedAt, NOW);
    assert.equal(weather.length, rows[SNAPSHOT.weather].length);
    assert.deepEqual(changes.updates.map((u) => [u.type, Object.keys(u).sort()]), [[SNAPSHOT.weather, ['data', 'id', 'type']]]);
    assert.deepEqual(rows, before, 'the input rows are not changed');
  });

  it('remove drops every row of a type', () => {
    const { rows: after, changes } = planScenario('no-data', seedLikeRows(), NOW, PLACE);
    for (const type of [SNAPSHOT.transit, SNAPSHOT.weather, SNAPSHOT.nina]) assert.deepEqual(after[type], [], type);
    assert.equal(changes.deletes.length, 11 + 1 + 1);
    assert.deepEqual(changes.updates, []);
    assert.deepEqual(changes.inserts, []);
  });

  it('refuses when the seed wrote no row to change, rather than showing the seed', () => {
    assert.throws(() => planScenario('outage', { [SNAPSHOT.weather]: seedLikeRows()[SNAPSHOT.weather] }, NOW, PLACE), /no vbb-disruptions row/);
    assert.throws(() => planScenario('storm', {}, NOW, PLACE), /no open-meteo row/);
  });

  it('refuses without a place to run on', () => {
    for (const place of [undefined, null, {}, { center: PLACE.center }, { types: PLACE.types }]) {
      assert.throws(() => planScenario('storm', seedLikeRows(), NOW, place), /no place to run it on/);
    }
  });

  it('the storm warnings depend on the time and the place alone', () => {
    assert.deepEqual(stormAlerts(NOW), stormAlerts(NOW));
    assert.deepEqual(stormNina(NOW, PLACE.center), stormNina(NOW, PLACE.center));
    assert.notDeepEqual(stormNina(NOW, PLACE.center), stormNina(NOW, NO_TRANSIT.center));
    assert.notDeepEqual(stormAlerts(NOW), stormAlerts(NOW + HOUR));
    const rank = { moderate: 1, severe: 2, extreme: 3 };
    const ranks = stormAlerts(NOW).map((a) => rank[a.severity]);
    assert.notDeepEqual(ranks, [...ranks].sort((a, b) => a - b), 'not handed over mildest first');
    assert.notDeepEqual(ranks, [...ranks].sort((a, b) => b - a), 'not handed over most severe first');
  });
});

describe('applyScenario', () => {
  it('reads only the types the scenario changes and writes exactly what it planned', async () => {
    for (const name of SCENARIO_NAMES) {
      const rows = seedLikeRows();
      const store = memoryStore(rows);
      const changes = await applyScenario(store, name, new Date(NOW), PLACE);
      assert.deepEqual(store.reads, scenarioTypes(name), name);
      assert.equal(store.writes.length, 1, name);
      const planned = planScenario(name, rows, NOW, PLACE);
      assert.deepEqual(changes, planned.changes, name);
      for (const [type, list] of Object.entries(planned.rows)) {
        const written = [...store.state[type]].sort(newestFirst).map((row) => ({ ...row, id: row.id >= 1000 ? null : row.id }));
        assert.deepEqual(written, list, `${name} ${type}`);
      }
    }
  });
});

describe('a scenario on one city', () => {
  const touchedTypes = ({ deletes, updates, inserts }) => [...deletes, ...updates, ...inserts].map((change) => change.type);
  const withoutTransit = () => {
    const rows = seedLikeRows();
    delete rows[SNAPSHOT.transit];
    return rows;
  };

  it('its place holds the city centre and the snapshot types of the data sets the city is seeded with', () => {
    assert.deepEqual(PLACE.center, { lat: 52.52, lon: 13.405 });
    assert.deepEqual(PLACE.types, Object.values(SNAPSHOT));
    assert.deepEqual(NO_TRANSIT.types, [SNAPSHOT.weather, SNAPSHOT.nina, SNAPSHOT.waterLevels]);
    assert.deepEqual(scenarioPlace({ coordinates: { lat: 1, lon: 2 } }, []).types, []);
    assert.ok(Object.isFrozen(PLACE) && Object.isFrozen(PLACE.center) && Object.isFrozen(PLACE.types));
  });

  it('the storm area over Berlin is the rectangle over central Berlin it always was', () => {
    assert.deepEqual(stormArea(PLACE.center), [[13.33, 52.48], [13.48, 52.48], [13.48, 52.56], [13.33, 52.56], [13.33, 52.48]]);
  });

  it('the storm area over another city is a closed ring around its centre', () => {
    const ring = stormArea(NO_TRANSIT.center);
    assert.equal(ring.length, 5);
    assert.deepEqual(ring[0], ring[4]);
    const lons = ring.map(([lon]) => lon);
    const lats = ring.map(([, lat]) => lat);
    assert.ok(Math.abs((Math.min(...lons) + Math.max(...lons)) / 2 - NO_TRANSIT.center.lon) < 1e-4);
    assert.ok(Math.abs((Math.min(...lats) + Math.max(...lats)) / 2 - NO_TRANSIT.center.lat) < 1e-4);
    assert.ok(Math.max(...lons) - Math.min(...lons) < 0.2 && Math.max(...lats) - Math.min(...lats) < 0.1);
    assert.deepEqual(stormNina(NOW, NO_TRANSIT.center)[0].area.geometry.coordinates, [ring]);
  });

  it('what a scenario changes splits into what the city holds and what it leaves out', () => {
    for (const name of SCENARIO_NAMES) {
      assert.deepEqual(scenarioTypes(name, PLACE), scenarioTypes(name), name);
      assert.deepEqual(leftOutTypes(name, PLACE), [], name);
      assert.deepEqual(scenarioTypes(name, NO_TRANSIT), scenarioTypes(name).filter((type) => type !== SNAPSHOT.transit), name);
    }
    for (const name of ['quiet', 'outage', 'no-data']) assert.deepEqual(leftOutTypes(name, NO_TRANSIT), [SNAPSHOT.transit], name);
    for (const name of ['default', 'storm']) assert.deepEqual(leftOutTypes(name, NO_TRANSIT), [], name);
  });

  it('a type the city holds no data of is left out rather than refused, and nothing is planned for it', () => {
    for (const name of SCENARIO_NAMES) {
      const plan = planScenario(name, withoutTransit(), NOW, NO_TRANSIT);
      assert.deepEqual(plan.leftOut, leftOutTypes(name, NO_TRANSIT), name);
      assert.ok(!touchedTypes(plan.changes).includes(SNAPSHOT.transit), name);
      assert.equal(plan.rows[SNAPSHOT.transit], undefined, name);
    }
    const outage = planScenario('outage', withoutTransit(), NOW, NO_TRANSIT);
    assert.equal(outage.rows[SNAPSHOT.weather][0].fetchedAt, NOW - 6 * HOUR, 'the rest of the scenario still applies');
    assert.deepEqual(outage.rows[SNAPSHOT.waterLevels], []);
    assert.throws(() => planScenario('outage', withoutTransit(), NOW, PLACE), /no vbb-disruptions row/, 'a city that holds transit still needs its row');
  });

  it('applying it reads and writes none of the left-out types', async () => {
    for (const name of SCENARIO_NAMES) {
      const store = memoryStore(withoutTransit());
      const changes = await applyScenario(store, name, NOW, NO_TRANSIT);
      assert.deepEqual(store.reads, scenarioTypes(name, NO_TRANSIT), name);
      assert.ok(!touchedTypes(changes).includes(SNAPSHOT.transit), name);
      assert.equal(store.state[SNAPSHOT.transit], undefined, name);
    }
  });
});

describe('see.mjs --scenario', () => {
  it('exits non-zero with the list for an unknown name, before it starts or writes anything', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    try {
      const out = path.join(tmp, 'out');
      const result = spawnSync(process.execPath, [path.join(here, '..', 'see.mjs'), '--out', out, '--scenario', 'hurricane'], {
        env: { PATH: process.env.PATH ?? '', HOME: tmp, TMPDIR: tmp },
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /--scenario hurricane: use one of default, quiet, outage, storm, no-data/);
      assert.doesNotMatch(result.stdout, /hermetic-guard|run folder/);
      assert.equal(fs.existsSync(out), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
