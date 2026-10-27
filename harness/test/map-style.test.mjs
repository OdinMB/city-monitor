import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  BACKGROUND, baseMapStyleName, DEFAULT_MAP_STYLE, localMapStyle, localResponse, MAP_STYLE_NAMES, MAP_STYLES, STYLE_FAILURE_STATUS, styleFails, styleTheme,
} from '../lib/map-style.mjs';
import { REPO } from '../lib/paths.mjs';

/** The base-map style URLs the app requests, read from its map constants. */
function appStyleUrls() {
  const text = fs.readFileSync(path.join(REPO.web, 'src', 'components', 'map', 'constants.ts'), 'utf8');
  const urls = {};
  for (const m of text.matchAll(/export const (DARK|LIGHT)_STYLE = '([^']+)'/g)) urls[m[1].toLowerCase()] = m[2];
  return urls;
}

/** Every string anywhere in a JSON value. */
function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

// The style spec the app's MapLibre validates styles against.
const styleSpec = createRequire(path.join(REPO.web, 'package.json'))('@maplibre/maplibre-gl-style-spec');

describe('baseMapStyleName', () => {
  it('recognises both style URLs the app requests, with the right theme', () => {
    const urls = appStyleUrls();
    assert.ok(urls.light && urls.dark, 'found LIGHT_STYLE and DARK_STYLE in the app\'s map constants');
    assert.equal(styleTheme(baseMapStyleName(urls.light)), 'light');
    assert.equal(styleTheme(baseMapStyleName(urls.dark)), 'dark');
  });

  it('recognises nothing else, tiles, fonts and sprites on the same hosts included', () => {
    for (const url of [
      'https://tiles.basemaps.cartocdn.com/vectortiles/carto.streets/v1/12/2200/1343.mvt',
      'https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/tiles.json',
      'https://tiles.basemaps.cartocdn.com/fonts/Montserrat Regular,Open Sans Regular/0-255.pbf',
      'https://basemaps.cartocdn.com/gl/positron-gl-style/sprite.json',
      'https://basemaps.cartocdn.com/gl/positron-gl-style/sprite@2x.png',
      'https://basemaps.cartocdn.com/gl/positron-gl-style/',
      'https://basemaps.cartocdn.com/gl/../style.json',
      'http://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
      'https://basemaps.cartocdn.com:8443/gl/positron-nolabels-gl-style/style.json',
      'https://user@basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
      'https://basemaps.cartocdn.com.example.com/gl/positron-nolabels-gl-style/style.json',
      'https://example.com/gl/positron-nolabels-gl-style/style.json',
      'https://example.com/',
      'not a url',
    ]) assert.equal(baseMapStyleName(url), null, url);
  });
});

describe('the local map style', () => {
  for (const name of ['positron-nolabels-gl-style', 'dark-matter-nolabels-gl-style']) {
    it(`for ${name} is valid and makes MapLibre request nothing`, () => {
      const style = localMapStyle(name);
      assert.deepEqual(styleSpec.validateStyleMin(style), []);
      assert.deepEqual(style.sources, {}, 'no sources, so no tiles');
      assert.equal(style.glyphs, undefined, 'no glyphs URL: MapLibre draws label text from local fonts');
      assert.equal(style.sprite, undefined, 'no sprite: the app adds its own marker images');
      assert.deepEqual(strings(style).filter((s) => s.includes('://') || s.startsWith('//')), [], 'no URL anywhere');
    });
  }

  it('is checked by a validator that does refuse a broken style', () => {
    const broken = { ...localMapStyle('positron-nolabels-gl-style'), layers: [{ id: 'background', type: 'no-such-type' }] };
    assert.notDeepEqual(styleSpec.validateStyleMin(broken), []);
  });

  it('keeps the layer id the app leaves visible and takes the theme\'s colour', () => {
    const light = localMapStyle('positron-nolabels-gl-style');
    const dark = localMapStyle('dark-matter-nolabels-gl-style');
    assert.deepEqual(light.layers.map((l) => [l.id, l.type]), [['background', 'background']]);
    assert.equal(light.layers[0].paint['background-color'], BACKGROUND.light);
    assert.equal(dark.layers[0].paint['background-color'], BACKGROUND.dark);
  });

  it('still validates once the app adds its district labels, which need no glyphs URL', () => {
    const style = localMapStyle('positron-nolabels-gl-style');
    style.sources.districts = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
    style.layers.push({
      id: 'district-label',
      type: 'symbol',
      source: 'districts',
      layout: { 'text-field': ['get', 'name'], 'text-size': 14, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'] },
    });
    assert.deepEqual(styleSpec.validateStyleMin(style), []);
  });
});

describe('localResponse', () => {
  it('answers the app\'s style URLs with the local style, readable from the app\'s origin', () => {
    const urls = appStyleUrls();
    for (const [theme, url] of Object.entries(urls)) {
      const local = localResponse(url);
      assert.ok(local, url);
      assert.equal(local.key, new URL(url).host + new URL(url).pathname);
      assert.equal(local.fulfil.status, 200);
      assert.match(local.fulfil.contentType, /^application\/json/);
      assert.equal(local.fulfil.headers['access-control-allow-origin'], '*');
      const style = JSON.parse(local.fulfil.body);
      assert.equal(style.layers[0].paint['background-color'], BACKGROUND[theme]);
    }
  });

  it('has no answer for anything else', () => {
    assert.equal(localResponse('https://example.com/'), null);
    assert.equal(localResponse('https://tiles.basemaps.cartocdn.com/fonts/Open Sans Regular/0-255.pbf'), null);
  });

  it('answers a failing style with an error status and no style, readable from the app\'s origin, under a key of its own', () => {
    for (const url of Object.values(appStyleUrls())) {
      const failed = localResponse(url, { fail: true });
      assert.equal(failed.fulfil.status, STYLE_FAILURE_STATUS);
      assert.ok(failed.fulfil.status >= 500);
      assert.equal(failed.fulfil.headers['access-control-allow-origin'], '*');
      assert.throws(() => JSON.parse(failed.fulfil.body), 'the body is not a style');
      assert.equal(failed.key, `${localResponse(url).key} as ${STYLE_FAILURE_STATUS}`);
      assert.deepEqual(localResponse(url, { fail: false }), localResponse(url));
    }
  });

  it('still has no answer for anything else when failing', () => {
    assert.equal(localResponse('https://example.com/', { fail: true }), null);
    assert.equal(localResponse('https://tiles.basemaps.cartocdn.com/vectortiles/carto.streets/v1/12/2200/1343.mvt', { fail: true }), null);
  });
});

describe('the map style modes (--map-style)', () => {
  it('are local (the default), fail and fail-once, each described', () => {
    assert.deepEqual(MAP_STYLE_NAMES, ['local', 'fail', 'fail-once']);
    assert.equal(DEFAULT_MAP_STYLE, 'local');
    for (const name of MAP_STYLE_NAMES) assert.ok(MAP_STYLES[name].length > 10, name);
  });

  it('local never fails, fail always does, fail-once only the first style request', () => {
    for (const answered of [0, 1, 2, 5]) {
      assert.equal(styleFails('local', answered), false);
      assert.equal(styleFails('fail', answered), true);
      assert.equal(styleFails('fail-once', answered), answered === 0);
    }
  });

  it('refuses an unknown mode with the list', () => {
    for (const bad of ['offline', 'Fail', '__proto__', 'constructor', '', undefined]) {
      assert.throws(() => styleFails(bad, 0), (err) => MAP_STYLE_NAMES.every((n) => err.message.includes(n)), String(bad));
    }
  });

  it('see.mjs exits 1 with the list for an unknown mode, before it starts or writes anything', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    try {
      const out = path.join(tmp, 'out');
      const result = spawnSync(process.execPath, [path.join(REPO.harness, 'see.mjs'), '--out', out, '--map-style', 'offline'], {
        env: { PATH: process.env.PATH ?? '', HOME: tmp, TMPDIR: tmp },
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /--map-style offline: use one of local, fail, fail-once/);
      assert.doesNotMatch(result.stdout, /hermetic-guard|run folder/);
      assert.equal(fs.existsSync(out), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
