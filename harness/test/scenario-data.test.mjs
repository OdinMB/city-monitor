import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FROST_WARMEST, OUTAGE_AGE, SCENARIO_NAMES, SNAPSHOT, SNOW_FOR_RAIN } from '../lib/scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOUR = 3_600_000;

// What the API would serve after each scenario, on the real synthetic seed of
// one city (see helpers/scenario-data.mjs, which loads the product's TypeScript
// through tsx): Berlin with no city given, as a run without --city.
function scenarioData(...args) {
  // tsx keeps its cache in the temporary folder; give it its own and remove it
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  try {
    const stdout = execFileSync(process.execPath, [path.join(here, 'helpers', 'scenario-data.mjs'), ...args], {
      env: { PATH: process.env.PATH ?? '', HOME: tmp, TMPDIR: tmp },
      encoding: 'utf8',
      timeout: 90_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim().split('\n').pop());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

let out;
let hamburg;
before(() => {
  out = scenarioData();
  hamburg = scenarioData('hamburg');
});

const servedOf = (name, type) => out.scenarios[name].served[type].served;
const seedOf = (type) => out.seed[type].served;

describe('the scenarios on the synthetic seed', () => {
  it('run on Berlin when no city is given, leaving nothing out', () => {
    assert.equal(out.city, 'berlin');
    assert.deepEqual(out.place.types, Object.values(SNAPSHOT));
    for (const name of SCENARIO_NAMES) assert.deepEqual(out.scenarios[name].leftOut, [], name);
  });

  it('the seed itself holds every type, fresh and valid', () => {
    for (const type of Object.values(SNAPSHOT)) {
      const s = seedOf(type);
      assert.ok(s, type);
      assert.equal(s.ageMs, 0, type);
      assert.equal(s.valid, true, type);
    }
    assert.ok(seedOf(SNAPSHOT.transit).data.length > 0, 'the seed has transit disruptions');
    assert.ok(seedOf(SNAPSHOT.weather).data.alerts.length > 0, 'the seed has a weather warning');
    assert.ok(seedOf(SNAPSHOT.nina).data.length > 0, 'the seed has a civil-protection warning');
  });

  it('every scenario serves only data its loader accepts, and plans the same twice', () => {
    for (const name of SCENARIO_NAMES) {
      const scenario = out.scenarios[name];
      assert.equal(scenario.deterministic, true, name);
      for (const type of Object.values(SNAPSHOT)) {
        const s = scenario.served[type].served;
        if (s) assert.equal(s.valid, true, `${name} ${type}`);
      }
    }
  });

  it('every scenario leaves the types it does not name as seeded', () => {
    for (const name of SCENARIO_NAMES) {
      for (const type of Object.values(SNAPSHOT)) {
        if (out.scenarios[name].types.includes(type)) continue;
        assert.deepEqual(out.scenarios[name].served[type], out.seed[type], `${name} ${type}`);
      }
    }
  });

  it('default changes nothing', () => {
    assert.deepEqual(out.scenarios.default.types, []);
    assert.deepEqual(out.scenarios.default.changes, { deletes: [], updates: [], inserts: [] });
    assert.deepEqual(out.scenarios.default.served, out.seed);
  });

  it('quiet: no disruptions and no warnings, every one of them checked just now', () => {
    const transit = servedOf('quiet', SNAPSHOT.transit);
    assert.deepEqual(transit.data, []);
    assert.equal(transit.ageMs, 0);
    assert.equal(out.scenarios.quiet.served[SNAPSHOT.transit].rowCount, 1);

    const weather = servedOf('quiet', SNAPSHOT.weather);
    assert.deepEqual(weather.data.alerts, []);
    assert.ok(weather.ageMs < out.staleAfter.weather);
    assert.deepEqual({ ...weather.data, alerts: [] }, { ...seedOf(SNAPSHOT.weather).data, alerts: [] }, 'the forecast stays as seeded');

    const nina = servedOf('quiet', SNAPSHOT.nina);
    assert.deepEqual(nina.data, []);
    assert.equal(nina.ageMs, 0);
  });

  it('outage: transit and weather hours old and past the web app\'s stale limits, water levels missing', () => {
    const transit = servedOf('outage', SNAPSHOT.transit);
    assert.equal(transit.ageMs, OUTAGE_AGE.transit);
    assert.ok(transit.ageMs > out.staleAfter.transit + HOUR, 'transit reads as stale');
    assert.deepEqual(transit.data, seedOf(SNAPSHOT.transit).data, 'the disruptions are the seeded ones');

    const weather = servedOf('outage', SNAPSHOT.weather);
    assert.equal(weather.ageMs, OUTAGE_AGE.weather);
    assert.ok(weather.ageMs > out.staleAfter.weather + HOUR, 'weather reads as stale');
    assert.deepEqual(weather.data, seedOf(SNAPSHOT.weather).data, 'the newest weather row is the seeded forecast, not a history snapshot');
    const history = out.scenarios.outage.served[SNAPSHOT.weather].rowCount;
    assert.ok(history > 100 && history < out.seed[SNAPSHOT.weather].rowCount, 'the older history stays, the hours since the outage are gone');

    assert.equal(servedOf('outage', SNAPSHOT.waterLevels), null);
    assert.equal(out.scenarios.outage.served[SNAPSHOT.waterLevels].rowCount, 0, 'no water-level history either');
  });

  it('storm: DWD warnings at every level, one with no end, one ended an hour ago; a severe civil-protection warning', () => {
    const weather = servedOf('storm', SNAPSHOT.weather);
    assert.ok(weather.ageMs < out.staleAfter.weather);
    const { alerts } = weather.data;
    assert.ok(alerts.length >= 4);
    for (const level of ['moderate', 'severe', 'extreme']) {
      assert.ok(alerts.some((a) => a.severity === level && Date.parse(a.validUntil) > out.now), `an active ${level} warning`);
    }
    assert.equal(alerts.filter((a) => a.validUntil === '').length, 1, 'one with no end');
    const ended = alerts.filter((a) => a.validUntil !== '' && Date.parse(a.validUntil) <= out.now);
    assert.equal(ended.length, 1, 'one that ended');
    assert.equal(Date.parse(ended[0].validUntil), out.now - HOUR);
    for (const a of alerts) assert.match(a.headline, /^\[Synthetisch\] /);
    assert.deepEqual({ ...weather.data, alerts: [] }, { ...seedOf(SNAPSHOT.weather).data, alerts: [] }, 'the forecast stays as seeded');

    const nina = servedOf('storm', SNAPSHOT.nina);
    assert.equal(nina.ageMs, 0);
    assert.equal(nina.data.length, 1);
    const [warning] = nina.data;
    assert.equal(warning.severity, 'severe');
    assert.equal(warning.source, 'mowas');
    assert.ok(Date.parse(warning.startDate) < out.now && Date.parse(warning.expiresAt) > out.now);
    assert.equal(warning.area.geometry.type, 'Polygon');
    assert.match(warning.headline, /^\[Synthetisch\] /);
  });

  it('no-data: transit, weather and civil-protection warnings hold no row at all', () => {
    for (const type of [SNAPSHOT.transit, SNAPSHOT.weather, SNAPSHOT.nina]) {
      assert.equal(out.scenarios['no-data'].served[type].rowCount, 0, type);
      assert.equal(servedOf('no-data', type), null, type);
    }
  });
});

describe('nina-warnings and frost on the synthetic seed of each city', () => {
  const cities = () => [out, hamburg];
  const inBox = ({ north, south, east, west }) => ([lon, lat]) => lat > south && lat < north && lon > west && lon < east;

  it('nina-warnings: five warnings the loader accepts, fetched now, each area inside the city', () => {
    for (const result of cities()) {
      const { rowCount, served } = result.scenarios['nina-warnings'].served[SNAPSHOT.nina];
      assert.equal(rowCount, 1, result.city);
      assert.equal(served.ageMs, 0, result.city);
      assert.equal(served.valid, true, result.city);
      assert.equal(served.data.length, 5, result.city);
      assert.deepEqual(served.data.map((w) => w.severity), ['extreme', 'severe', 'severe', 'moderate', 'minor'], result.city);
      assert.deepEqual(served.data.map((w) => w.type), ['Alert', 'Alert', 'Cancel', 'Update', 'Alert'], result.city);
      for (const w of served.data) assert.ok(w.area.geometry.coordinates[0].every(inBox(result.boundingBox)), `${result.city} ${w.id}`);
      assert.deepEqual(result.scenarios['nina-warnings'].served[SNAPSHOT.weather], result.seed[SNAPSHOT.weather], 'weather as seeded');
    }
  });

  it('frost: the seeded forecast below zero everywhere, warmest at FROST_WARMEST, with no rain', () => {
    for (const result of cities()) {
      const seeded = result.seed[SNAPSHOT.weather].served.data;
      const frost = result.scenarios.frost.served[SNAPSHOT.weather].served;
      assert.equal(frost.valid, true, result.city);
      assert.ok(frost.ageMs < result.staleAfter.weather, result.city);
      const { current, hourly, daily } = frost.data;
      assert.equal(hourly.length, seeded.hourly.length, result.city);
      assert.equal(daily.length, seeded.daily.length, result.city);
      const temps = [current.temp, current.feelsLike, ...hourly.map((h) => h.temp), ...daily.flatMap((d) => [d.high, d.low])];
      assert.ok(temps.every((t) => t < 0), `${result.city}: ${temps.filter((t) => t >= 0).join(' ')}`);
      assert.equal(Math.max(...temps), FROST_WARMEST, result.city);
      assert.ok(Math.min(...temps) < -5, `${result.city}: a hard frost somewhere (${Math.min(...temps)})`);
      for (const code of [current.weatherCode, ...hourly.map((h) => h.weatherCode), ...daily.map((d) => d.weatherCode)]) {
        assert.ok(!(code in SNOW_FOR_RAIN), `${result.city}: rain code ${code} left`);
      }
      assert.deepEqual(hourly.map((h) => h.time), seeded.hourly.map((h) => h.time), result.city);
      assert.deepEqual(daily.map((d) => [d.date, d.sunrise, d.sunset, d.precip]), seeded.daily.map((d) => [d.date, d.sunrise, d.sunset, d.precip]), result.city);
      assert.deepEqual(frost.data.alerts, seeded.alerts, result.city);
      assert.equal(result.scenarios.frost.served[SNAPSHOT.weather].rowCount, result.seed[SNAPSHOT.weather].rowCount, 'the history stays');
    }
  });
});

describe('the statements a run sends for each scenario', () => {
  it('each names the snapshots table, the seeded city and the snapshot type', () => {
    for (const name of SCENARIO_NAMES) {
      const { sql, types } = out.scenarios[name];
      for (const { sql: text, params } of sql) {
        assert.match(text, /^(select .* from "snapshots"|delete from "snapshots"|update "snapshots"|insert into "snapshots")/, `${name}: ${text}`);
        assert.ok(params.includes(out.city), `${name}: ${text}`);
        assert.ok(params.some((p) => types.includes(p)), `${name}: ${text}`);
        if (!text.startsWith('insert')) assert.match(text, / where \("snapshots"\."city_id" = \$\d+ and "snapshots"\."type" = \$\d+/, `${name}: ${text}`);
      }
    }
  });

  it('a scenario with changes writes them; default sends nothing', () => {
    assert.deepEqual(out.scenarios.default.sql, []);
    for (const name of SCENARIO_NAMES.filter((n) => n !== 'default')) {
      const writes = out.scenarios[name].sql.filter(({ sql }) => !sql.startsWith('select'));
      assert.ok(writes.length > 0, name);
    }
  });
});

describe('the scenarios on a city with no transit source (Hamburg)', () => {
  const served = (name, type) => hamburg.scenarios[name].served[type].served;
  const held = [SNAPSHOT.weather, SNAPSHOT.nina, SNAPSHOT.waterLevels];
  const inBox = ([lon, lat]) => {
    const { north, south, east, west } = hamburg.boundingBox;
    return lat > south && lat < north && lon > west && lon < east;
  };

  it('the seed holds weather, civil-protection and water-level data, fresh and valid, and no transit at all', () => {
    assert.equal(hamburg.city, 'hamburg');
    assert.deepEqual(hamburg.place.types, held);
    for (const type of held) {
      assert.equal(hamburg.seed[type].served?.ageMs, 0, type);
      assert.equal(hamburg.seed[type].served.valid, true, type);
    }
    assert.deepEqual(hamburg.seed[SNAPSHOT.transit], { rowCount: 0, served: null });
    assert.ok(hamburg.seed[SNAPSHOT.weather].served.data.alerts.length > 0, 'the seed has a weather warning');
    assert.ok(hamburg.seed[SNAPSHOT.nina].served.data.length > 0, 'the seed has a civil-protection warning');
  });

  it('every scenario leaves transit out, serves none, and plans the same twice', () => {
    for (const name of SCENARIO_NAMES) {
      const scenario = hamburg.scenarios[name];
      assert.equal(scenario.deterministic, true, name);
      assert.ok(!scenario.types.includes(SNAPSHOT.transit), name);
      assert.deepEqual(scenario.served[SNAPSHOT.transit], { rowCount: 0, served: null }, name);
      for (const type of held) {
        const s = scenario.served[type].served;
        if (s) assert.equal(s.valid, true, `${name} ${type}`);
      }
    }
    for (const name of ['quiet', 'outage', 'no-data']) assert.deepEqual(hamburg.scenarios[name].leftOut, [SNAPSHOT.transit], name);
    for (const name of ['default', 'storm']) assert.deepEqual(hamburg.scenarios[name].leftOut, [], name);
  });

  it('the rest of each scenario applies as in Berlin', () => {
    assert.deepEqual(hamburg.scenarios.default.served, hamburg.seed);
    assert.deepEqual(served('quiet', SNAPSHOT.weather).data.alerts, []);
    assert.deepEqual(served('quiet', SNAPSHOT.nina).data, []);
    assert.equal(served('outage', SNAPSHOT.weather).ageMs, OUTAGE_AGE.weather);
    assert.ok(served('outage', SNAPSHOT.weather).ageMs > hamburg.staleAfter.weather + HOUR, 'weather reads as stale');
    assert.equal(served('outage', SNAPSHOT.waterLevels), null);
    assert.equal(served('storm', SNAPSHOT.weather).data.alerts.length, 5);
    for (const type of [SNAPSHOT.weather, SNAPSHOT.nina]) {
      assert.equal(hamburg.scenarios['no-data'].served[type].rowCount, 0, type);
    }
    for (const name of SCENARIO_NAMES) {
      for (const type of held) {
        if (hamburg.scenarios[name].types.includes(type)) continue;
        assert.deepEqual(hamburg.scenarios[name].served[type], hamburg.seed[type], `${name} ${type}`);
      }
    }
  });

  it('storm: the civil-protection warning covers central Hamburg, inside the city\'s bounding box', () => {
    const [warning] = served('storm', SNAPSHOT.nina).data;
    const [ring] = warning.area.geometry.coordinates;
    assert.ok(ring.every(inBox), JSON.stringify(ring));
    const lons = ring.map(([lon]) => lon);
    const lats = ring.map(([, lat]) => lat);
    const { lat, lon } = hamburg.place.center;
    assert.ok(Math.min(...lons) < lon && Math.max(...lons) > lon && Math.min(...lats) < lat && Math.max(...lats) > lat);
    const [berlinRing] = servedOf('storm', SNAPSHOT.nina).data[0].area.geometry.coordinates;
    assert.notDeepEqual(ring, berlinRing);
  });

  it('every statement names Hamburg and a type it holds; none names transit', () => {
    for (const name of SCENARIO_NAMES) {
      for (const { sql: text, params } of hamburg.scenarios[name].sql) {
        assert.ok(params.includes('hamburg'), `${name}: ${text}`);
        assert.ok(!params.includes('berlin'), `${name}: ${text}`);
        assert.ok(!params.includes(SNAPSHOT.transit), `${name}: ${text}`);
        assert.ok(params.some((p) => held.includes(p)), `${name}: ${text}`);
      }
    }
  });
});
