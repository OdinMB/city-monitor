import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  activeCitiesPlugin, CITY_CONFIG_FILES, CITY_ID_PATTERN, configuredCities, DEFAULT_CITY, registeredCities, withActiveCities,
} from '../lib/cities.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(file, 'utf8');
const registry = (body) => `import type { CityConfig } from '@city-monitor/shared';\n\nconst ALL_CITIES: Record<string, CityConfig> = {${body}};\n`;

function withTmp(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('registeredCities', () => {
  it('reads both packages\' registries: Berlin and Hamburg, Berlin the default', () => {
    assert.deepEqual(registeredCities(read(CITY_CONFIG_FILES.server)), ['berlin', 'hamburg']);
    assert.deepEqual(registeredCities(read(CITY_CONFIG_FILES.web)), ['berlin', 'hamburg']);
    assert.deepEqual(configuredCities(), ['berlin', 'hamburg']);
    assert.equal(DEFAULT_CITY, 'berlin');
  });

  it('reads shorthand, quoted and key: value entries, and skips comments', () => {
    const source = registry(`\n  berlin,\n  // hamburg,\n  'new-town': newTown,\n  "x": y, /* gone, */\n  bremen: bremenConfig,\n`);
    assert.deepEqual(registeredCities(source), ['berlin', 'new-town', 'x', 'bremen']);
  });

  it('refuses a registry it cannot read rather than guess', () => {
    for (const body of [' berlin: makeCity() ', ' ...others ', ' [key]: berlin ', ' Berlin ', " 'a b': x "]) {
      assert.throws(() => registeredCities(registry(body), 'test'), /test: cannot read the ALL_CITIES entry/, body);
    }
    assert.throws(() => registeredCities('export const cities = {};'), /found 0 ALL_CITIES objects/);
    assert.throws(() => registeredCities(registry(' berlin ') + registry(' hamburg ')), /found 2 ALL_CITIES objects/);
  });
});

describe('configuredCities', () => {
  it('holds the cities both packages register, in the server\'s order, with ids the API accepts', () => {
    withTmp((tmp) => {
      const files = { server: path.join(tmp, 'server.ts'), web: path.join(tmp, 'web.ts') };
      const long = 'a'.repeat(40);
      fs.writeFileSync(files.server, registry(` berlin, hamburg, teststadt, ${long} `));
      fs.writeFileSync(files.web, registry(` hamburg, berlin, ${long}, webonly `));
      assert.deepEqual(configuredCities(files), ['berlin', 'hamburg']);
      assert.equal(CITY_ID_PATTERN.test(long), false);
    });
  });
});

describe('withActiveCities', () => {
  const web = read(CITY_CONFIG_FILES.web);
  const active = (source) => source.split('\n').filter((line) => line.startsWith('const ACTIVE_CITY_IDS'));

  it('changes the web config\'s one ACTIVE_CITY_IDS line and nothing else', () => {
    const changed = withActiveCities(web, ['hamburg']);
    const before = web.split('\n');
    const after = changed.split('\n');
    assert.equal(after.length, before.length);
    const differing = after.filter((line, i) => line !== before[i]);
    assert.deepEqual(differing, ['const ACTIVE_CITY_IDS = new Set(["hamburg"]);']);
    assert.deepEqual(active(withActiveCities(web, ['berlin', 'hamburg'])), ['const ACTIVE_CITY_IDS = new Set(["berlin","hamburg"]);']);
  });

  it('refuses a source without exactly one such line', () => {
    assert.throws(() => withActiveCities('const OTHER = 1;\n', ['berlin']), /has 0 ACTIVE_CITY_IDS lines/);
    const twice = `${active(web)[0]}\n${active(web)[0]}\n`;
    assert.throws(() => withActiveCities(twice, ['berlin']), /has 2 ACTIVE_CITY_IDS lines/);
    assert.throws(() => withActiveCities('const ACTIVE_CITY_IDS = new Set(ids);\n', ['berlin']), /has 0/);
  });

  it('refuses ids the API would not accept', () => {
    for (const ids of [[], ['Berlin'], ['__proto__'], ["berlin']); evil(['x"], ['../web'], [''], [1], 'hamburg', undefined]) {
      assert.throws(() => withActiveCities(web, ids), /give one or more city ids/, JSON.stringify(ids));
    }
  });
});

describe('activeCitiesPlugin', () => {
  const web = read(CITY_CONFIG_FILES.web);

  it('rewrites the web config module only, wherever its id comes from', () => {
    const plugin = activeCitiesPlugin(['hamburg']);
    assert.equal(plugin.name, 'harness-active-cities');
    assert.equal(plugin.enforce, 'pre');
    assert.equal(plugin.transform('const x = 1;', path.join(here, 'args.test.mjs')), null);
    assert.equal(plugin.transform(web, 'index.ts'), null, 'a bare name is not the file');
    withTmp((tmp) => {
      const lookalike = path.join(tmp, 'index.ts');
      fs.writeFileSync(lookalike, web);
      assert.equal(plugin.transform(web, lookalike), null, 'another file of the same name');
    });
    assert.throws(() => plugin.buildEnd(), /never loaded/, 'nothing applied yet');
    for (const id of [CITY_CONFIG_FILES.web, `${CITY_CONFIG_FILES.web}?v=1`]) {
      const result = plugin.transform(web, id);
      assert.equal(result.code, withActiveCities(web, ['hamburg']), id);
    }
    plugin.buildEnd();
  });

  it('fails the build when the module never came through, but not over another failure', () => {
    const plugin = activeCitiesPlugin(['hamburg']);
    assert.throws(() => plugin.buildEnd(), /the build never loaded .*index\.ts, so the run cannot make hamburg its active cities/);
    assert.doesNotThrow(() => plugin.buildEnd(new Error('the build failed for its own reason')));
  });

  it('refuses bad ids when it is made, before any build starts', () => {
    for (const ids of [undefined, [], ['Hamburg'], ['x"]); y(["']]) assert.throws(() => activeCitiesPlugin(ids), /give one or more city ids/);
    assert.throws(() => activeCitiesPlugin(['hamburg'], path.join(here, 'no-such-config.ts')), /ENOENT/);
  });
});

describe('see.mjs --city', () => {
  it('exits non-zero with the list for an unknown city, before it starts or writes anything', () => {
    withTmp((tmp) => {
      const out = path.join(tmp, 'out');
      const result = spawnSync(process.execPath, [path.join(here, '..', 'see.mjs'), '--out', out, '--city', 'atlantis'], {
        env: { PATH: process.env.PATH ?? '', HOME: tmp, TMPDIR: tmp },
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /--city atlantis: use one of berlin, hamburg/);
      assert.doesNotMatch(result.stdout, /hermetic-guard|run folder/);
      assert.equal(fs.existsSync(out), false);
    });
  });
});
