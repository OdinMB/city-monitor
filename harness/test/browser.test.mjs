import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  combinations,
  decideRoute,
  formatCounts,
  isAllowedUrl,
  isTouchViewport,
  newBlockingContext,
  pathSlug,
  playwrightCandidates,
  probeBrowserNetwork,
  screenshotName,
  sumCounts,
} from '../lib/browser.mjs';
import { PLANTED } from '../lib/guard.mjs';
import { MAP_STYLE_NAMES, STYLE_FAILURE_STATUS } from '../lib/map-style.mjs';

const OWN = 'http://127.0.0.1:4321';
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

/** Off-port requests a page on the map can make, the base map's style aside. */
const OFF_PORT = [
  'https://tiles.basemaps.cartocdn.com/vectortiles/carto.streets/v1/12/2200/1343.mvt',
  'https://tiles.basemaps.cartocdn.com/fonts/Open Sans Regular/0-255.pbf',
  'https://basemaps.cartocdn.com/gl/positron-gl-style/sprite.json',
  'http://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
  'https://gdi.berlin.de/services/wms/wohnlagenadr2024?service=WMS&request=GetMap',
  'https://scripts.simpleanalyticscdn.com/latest.js',
  PLANTED.networkUrl,
  'http://127.0.0.1:3001/api/health',
  'http://localhost:4321/',
];

/** A route as Playwright hands it to a handler, recording what the handler did. */
function fakeRoute(url) {
  const calls = [];
  return {
    calls,
    request: () => ({ url: () => url }),
    continue: async () => { calls.push({ action: 'continue' }); },
    fulfill: async (response) => { calls.push({ action: 'fulfill', response }); },
    abort: async (reason) => { calls.push({ action: 'abort', reason }); },
  };
}

/**
 * Enough of a Playwright browser for newBlockingContext: a page's goto sends
 * its URL through the context's route handler and fails when it is aborted,
 * as Chromium's does. Nothing is launched.
 */
function fakeBrowser() {
  const contexts = [];
  return {
    contexts,
    async newContext(options) {
      const context = {
        options,
        handlers: [],
        closed: false,
        async route(pattern, handler) { this.handlers.push({ pattern, handler }); },
        async routeWebSocket() {},
        async close() { this.closed = true; },
        async newPage() {
          return {
            goto: async (url) => {
              const route = fakeRoute(url);
              await context.handlers[0].handler(route);
              if (route.calls[0].action === 'abort') throw new Error(`net::ERR_BLOCKED_BY_CLIENT at ${url}`);
              return {};
            },
          };
        },
      };
      contexts.push(context);
      return context;
    },
  };
}

describe('isAllowedUrl', () => {
  const own = ['http://127.0.0.1:4321'];
  it('lets through only the run\'s own origin and inline data', () => {
    assert.equal(isAllowedUrl('http://127.0.0.1:4321/berlin', own), true);
    assert.equal(isAllowedUrl('http://127.0.0.1:4321/api/berlin/bootstrap', own), true);
    assert.equal(isAllowedUrl('data:image/png;base64,AAAA', own), true);
    assert.equal(isAllowedUrl('blob:http://127.0.0.1:4321/abc', own), true);
  });
  it('blocks every other host and port, loopback ones included', () => {
    for (const url of [
      'https://basemaps.cartocdn.com/gl/positron/style.json',
      'https://scripts.simpleanalyticscdn.com/latest.js',
      'https://example.com/',
      'http://127.0.0.1:3001/api/health',
      'http://127.0.0.1:5173/',
      'http://localhost:4321/',
      'https://127.0.0.1:4321/',
      'ws://127.0.0.1:4321/',
      'not a url',
    ]) assert.equal(isAllowedUrl(url, own), false, url);
  });
});

describe('decideRoute', () => {
  it('lets the run\'s own origin through', () => {
    assert.deepEqual(decideRoute(`${OWN}/berlin`, [OWN]), { action: 'continue' });
  });

  it('answers the base map\'s style from memory', () => {
    for (const url of [LIGHT_STYLE, DARK_STYLE]) {
      const decision = decideRoute(url, [OWN]);
      assert.equal(decision.action, 'fulfil', url);
      assert.equal(decision.key, url.replace('https://', ''));
      assert.equal(JSON.parse(decision.response.body).version, 8);
    }
  });

  it('aborts every other request off the run\'s port', () => {
    for (const url of OFF_PORT) assert.equal(decideRoute(url, [OWN]).action, 'abort', url);
    assert.equal(decideRoute(PLANTED.networkUrl, []).host, 'example.com');
  });
});

describe('newBlockingContext', () => {
  it('never sends a request off the run\'s port: each is answered locally or aborted', async () => {
    const browser = fakeBrowser();
    const blocked = {};
    const served = {};
    await newBlockingContext(browser, { allowedOrigins: [OWN], blocked, served });
    const [context] = browser.contexts;
    assert.equal(context.options.serviceWorkers, 'block');
    assert.equal(context.handlers.length, 1);
    assert.equal(context.handlers[0].pattern, '**/*');

    const routes = [LIGHT_STYLE, DARK_STYLE, LIGHT_STYLE, ...OFF_PORT].map(fakeRoute);
    for (const route of routes) await context.handlers[0].handler(route);
    for (const route of routes) {
      assert.equal(route.calls.length, 1);
      assert.notEqual(route.calls[0].action, 'continue', route.request().url());
    }
    assert.deepEqual(routes.slice(0, 3).map((r) => r.calls[0].action), ['fulfill', 'fulfill', 'fulfill']);
    assert.deepEqual(JSON.parse(routes[1].calls[0].response.body).layers.map((l) => l.id), ['background']);
    for (const route of routes.slice(3)) assert.deepEqual(route.calls[0], { action: 'abort', reason: 'blockedbyclient' });

    assert.deepEqual(served, {
      'basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json': 2,
      'basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json': 1,
    });
    assert.equal(blocked['tiles.basemaps.cartocdn.com'], 2);
    assert.equal(blocked['basemaps.cartocdn.com'], 2);
    assert.equal(blocked['example.com'], 1);
    assert.equal(blocked['127.0.0.1:3001'], 1);

    const own = fakeRoute(`${OWN}/api/berlin/bootstrap`);
    await context.handlers[0].handler(own);
    assert.deepEqual(own.calls, [{ action: 'continue' }]);
  });
});

describe('the base map\'s style under --map-style', () => {
  const statusOf = (route) => route.calls[0].response.status;
  async function contextWith(mapStyle) {
    const browser = fakeBrowser();
    const blocked = {};
    const served = {};
    await newBlockingContext(browser, { allowedOrigins: [OWN], blocked, served, mapStyle });
    return { handler: browser.contexts[0].handlers[0].handler, blocked, served };
  }

  it('in every mode, sends nothing off the run\'s port: each request is answered locally or aborted', async () => {
    for (const mapStyle of MAP_STYLE_NAMES) {
      const { handler, blocked } = await contextWith(mapStyle);
      const routes = [LIGHT_STYLE, ...OFF_PORT, DARK_STYLE, LIGHT_STYLE].map(fakeRoute);
      for (const route of routes) await handler(route);
      for (const route of routes) {
        assert.equal(route.calls.length, 1, mapStyle);
        assert.notEqual(route.calls[0].action, 'continue', `${mapStyle} ${route.request().url()}`);
      }
      for (const route of routes.slice(1, -2)) assert.deepEqual(route.calls[0], { action: 'abort', reason: 'blockedbyclient' }, mapStyle);
      assert.equal(blocked['example.com'], 1, mapStyle);
      for (const url of OFF_PORT) assert.equal(decideRoute(url, [OWN], { failStyle: true }).action, 'abort', url);
      const own = fakeRoute(`${OWN}/api/berlin/nina`);
      await handler(own);
      assert.deepEqual(own.calls, [{ action: 'continue' }], mapStyle);
    }
  });

  it('local answers every style request with the stand-in', async () => {
    const { handler, served } = await contextWith('local');
    const routes = [LIGHT_STYLE, LIGHT_STYLE, DARK_STYLE].map(fakeRoute);
    for (const route of routes) await handler(route);
    assert.deepEqual(routes.map(statusOf), [200, 200, 200]);
    assert.deepEqual(Object.keys(served).sort(), [
      'basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      'basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
    ]);
  });

  it('fail answers every style request with an error and no style, counted as failed', async () => {
    const { handler, served } = await contextWith('fail');
    const routes = [LIGHT_STYLE, LIGHT_STYLE, DARK_STYLE].map(fakeRoute);
    for (const route of routes) await handler(route);
    assert.deepEqual(routes.map(statusOf), [STYLE_FAILURE_STATUS, STYLE_FAILURE_STATUS, STYLE_FAILURE_STATUS]);
    for (const route of routes) assert.throws(() => JSON.parse(route.calls[0].response.body));
    assert.deepEqual(served, {
      [`basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json as ${STYLE_FAILURE_STATUS}`]: 2,
      [`basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json as ${STYLE_FAILURE_STATUS}`]: 1,
    });
  });

  it('fail-once fails the first style request of each context, then answers with the stand-in, so a retry loads', async () => {
    for (let page = 0; page < 2; page += 1) {
      const { handler, served } = await contextWith('fail-once');
      const tile = fakeRoute(OFF_PORT[0]);
      await handler(tile);
      const routes = [LIGHT_STYLE, LIGHT_STYLE, DARK_STYLE].map(fakeRoute);
      for (const route of routes) await handler(route);
      assert.deepEqual(routes.map(statusOf), [STYLE_FAILURE_STATUS, 200, 200], 'a blocked tile first does not use up the failure');
      assert.equal(JSON.parse(routes[1].calls[0].response.body).version, 8);
      assert.deepEqual(Object.values(served), [1, 1, 1]);
    }
  });

  it('an unknown mode is refused before a context is made', async () => {
    const browser = fakeBrowser();
    await assert.rejects(newBlockingContext(browser, { allowedOrigins: [OWN], blocked: {}, mapStyle: 'offline' }), /unknown map style offline/);
    assert.equal(browser.contexts.length, 0);
  });
});

describe('probeBrowserNetwork (the network case, browser side)', () => {
  it('reports the planted GET as blocked, with the base map\'s stand-in in place', async () => {
    const browser = fakeBrowser();
    assert.equal(await probeBrowserNetwork({ browser, url: PLANTED.networkUrl }), true);
    assert.equal(browser.contexts[0].closed, true);
  });

  it('would report a GET that got an answer as not blocked', async () => {
    // The control: the stand-in is answered, so the probe does tell the two apart.
    assert.equal(await probeBrowserNetwork({ browser: fakeBrowser(), url: LIGHT_STYLE }), false);
  });
});

describe('counts', () => {
  it('adds up per-page counts and prints them', () => {
    const total = sumCounts([{ a: 1, b: 2 }, { a: 3 }, undefined]);
    assert.deepEqual(total, { a: 4, b: 2 });
    assert.equal(formatCounts(total), 'a (4), b (2)');
    assert.equal(formatCounts({}), 'none');
  });
});

describe('screenshot names', () => {
  it('name the path, viewport, language, theme and step', () => {
    const base = { pagePath: '/berlin', viewport: { width: 390, height: 844 }, lang: 'de', theme: 'dark' };
    assert.equal(screenshotName(base), 'berlin__390x844__de__dark.png');
    assert.equal(screenshotName({ ...base, stepIndex: 2, stepName: 'popover' }), 'berlin__390x844__de__dark__03-popover.png');
    assert.equal(pathSlug('/'), 'root');
    assert.equal(pathSlug('/berlin/sources?tab=1'), 'berlin-sources-tab-1');
  });
});

describe('combinations', () => {
  it('crosses paths, viewports, languages and themes', () => {
    const combos = combinations({
      paths: ['/berlin', '/berlin/sources'],
      viewports: [{ width: 390, height: 844 }, { width: 1440, height: 900 }],
      langs: ['de', 'ar'],
      themes: ['light'],
    });
    assert.equal(combos.length, 8);
    assert.deepEqual(combos[0], { pagePath: '/berlin', viewport: { width: 390, height: 844 }, lang: 'de', theme: 'light' });
  });
  it('gives phone widths touch emulation', () => {
    assert.equal(isTouchViewport({ width: 390, height: 844 }), true);
    assert.equal(isTouchViewport({ width: 1440, height: 900 }), false);
  });
});

describe('playwrightCandidates', () => {
  it('tries --playwright alone when given', () => {
    assert.deepEqual(playwrightCandidates({ explicit: '/pw', repoRoot: '/r' }), [path.resolve('/pw')]);
  });
  it('tries the checkout, NODE_PATH and the global folder of the running Node', () => {
    const list = playwrightCandidates({ repoRoot: '/r', nodePath: '/np', execPath: '/opt/node22/bin/node', platform: 'linux' });
    assert.deepEqual(list, [path.join('/r', 'node_modules', 'playwright'), path.join('/np', 'playwright'), path.join('/opt/node22', 'lib', 'node_modules', 'playwright')]);
  });
});
