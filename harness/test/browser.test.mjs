import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  combinations,
  isAllowedUrl,
  isTouchViewport,
  pathSlug,
  playwrightCandidates,
  screenshotName,
} from '../lib/browser.mjs';

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
