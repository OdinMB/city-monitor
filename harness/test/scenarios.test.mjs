import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  applyScenario, DEFAULT_SCENARIO, newestFirst, planScenario, SCENARIO_NAMES, SCENARIOS, scenarioTypes, SNAPSHOT,
  stormAlerts, stormNina,
} from '../lib/scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-27T07:30:00.000Z');

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
      assert.throws(() => planScenario(bad, {}, NOW), /unknown scenario/, bad);
    }
  });
});

describe('planScenario', () => {
  it('backdate moves the newest row back and drops every row fetched since then', () => {
    const rows = seedLikeRows();
    const { rows: after, changes } = planScenario('outage', rows, NOW);
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
    const { rows: after, changes } = planScenario('outage', rows, NOW);
    assert.equal(after[SNAPSHOT.transit][0].fetchedAt, NOW - 9 * HOUR);
    assert.deepEqual(changes.updates, []);
  });

  it('put replaces every row with one fetched now; patch-latest changes only the newest row\'s data', () => {
    const rows = seedLikeRows();
    const before = structuredClone(rows);
    const { rows: after, changes } = planScenario('quiet', rows, NOW);
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
    const { rows: after, changes } = planScenario('no-data', seedLikeRows(), NOW);
    for (const type of [SNAPSHOT.transit, SNAPSHOT.weather, SNAPSHOT.nina]) assert.deepEqual(after[type], [], type);
    assert.equal(changes.deletes.length, 11 + 1 + 1);
    assert.deepEqual(changes.updates, []);
    assert.deepEqual(changes.inserts, []);
  });

  it('refuses when the seed wrote no row to change, rather than showing the seed', () => {
    assert.throws(() => planScenario('outage', { [SNAPSHOT.weather]: seedLikeRows()[SNAPSHOT.weather] }, NOW), /no vbb-disruptions row/);
    assert.throws(() => planScenario('storm', {}, NOW), /no open-meteo row/);
  });

  it('the storm warnings depend on the time alone', () => {
    assert.deepEqual(stormAlerts(NOW), stormAlerts(NOW));
    assert.deepEqual(stormNina(NOW), stormNina(NOW));
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
      const changes = await applyScenario(store, name, new Date(NOW));
      assert.deepEqual(store.reads, scenarioTypes(name), name);
      assert.equal(store.writes.length, 1, name);
      const planned = planScenario(name, rows, NOW);
      assert.deepEqual(changes, planned.changes, name);
      for (const [type, list] of Object.entries(planned.rows)) {
        const written = [...store.state[type]].sort(newestFirst).map((row) => ({ ...row, id: row.id >= 1000 ? null : row.id }));
        assert.deepEqual(written, list, `${name} ${type}`);
      }
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
