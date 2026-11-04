import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  MAX_COOKIE_LENGTH, SETUP_COOKIE, cookieString, decodePrefs, encodePrefs, readPrefs, writePrefs, type CityPrefs, type SetupPrefs,
} from './setup-cookie.js';
import { encodeJson } from './compact-json.js';
import { defaultView } from './setup-state.js';
import { TILE_IDS } from './tile-setups.js';
import { CATEGORY_LAYERS, defaultMapState, type DataLayer } from '../hooks/useCommandCenter.js';
import { MAX_SECTIONS, MAX_SECTION_NAME } from './custom-setup.js';

const prefs = (): SetupPrefs => ({
  berlin: {
    view: { ...defaultView(), choice: 'custom', custom: { sections: [{ id: 'c1', name: 'Kiez', tiles: ['news', 'support'] }], hidden: ['budget'] } },
    map: { ...defaultMapState('berlin'), activeLayers: new Set<DataLayer>(['crime']) },
    touched: 200,
  },
  hamburg: { view: { ...defaultView(), choice: 'topics' }, touched: 100 },
});

/** A city entry as large as a setup can get: every section, every name at full length in 3-byte characters, every tile, every section collapsed, the whole map. */
const huge = (touched: number): CityPrefs => {
  const sections = Array.from({ length: MAX_SECTIONS }, (_, i) => ({
    id: `c${i + 10}`,
    name: '界'.repeat(MAX_SECTION_NAME),
    tiles: TILE_IDS.filter((_, n) => n % MAX_SECTIONS === i),
  }));
  const ids = sections.map((s) => s.id);
  return {
    view: { choice: 'custom', custom: { sections, hidden: [] }, collapsed: { functional: ['background', 'crises', 'disturbances', 'environment', 'news'], topics: ['news', 'weather', 'environment', 'traffic', 'health', 'cityHall', 'social'], custom: ids } },
    map: { ...defaultMapState('berlin'), activeLayers: new Set(Object.values(CATEGORY_LAYERS).flat()) },
    touched,
  };
};

describe('setup cookie value', () => {
  it('round-trips each city’s setup and map state', () => {
    expect(decodePrefs(encodePrefs(prefs())!)).toEqual(prefs());
  });

  it('reads nothing from a value it did not write, without throwing', () => {
    for (const value of [undefined, '', 'garbage!', encodeJson({ v: 2, c: {} }), encodeJson({ v: 1, c: [] }), encodeJson(null)]) {
      expect(decodePrefs(value)).toEqual({});
    }
  });

  it('skips a city entry it cannot read and keeps the others', () => {
    const value = encodeJson({ v: 1, c: { berlin: { s: 't', u: 5 }, 'Not a city!': { s: 't', u: 5 }, koeln: 'x' } });
    expect(Object.keys(decodePrefs(value))).toEqual(['berlin']);
  });

  it('reads nothing from a value over the size limit', () => {
    expect(decodePrefs('A'.repeat(MAX_COOKIE_LENGTH + 1))).toEqual({});
  });

  it('always has room for one city, however large its setup', () => {
    const value = encodePrefs({ berlin: huge(1) })!;
    expect(value).not.toBeNull();
    expect(decodePrefs(value)).toEqual({ berlin: huge(1) });
  });

  it('stays under the limit by dropping the cities touched longest ago', () => {
    const big: SetupPrefs = { berlin: huge(3), hamburg: huge(1), koeln: huge(4), muenchen: huge(2) };
    const value = encodePrefs(big)!;
    expect(`${SETUP_COOKIE}=${value}`.length).toBeLessThanOrEqual(MAX_COOKIE_LENGTH);
    const kept = Object.keys(decodePrefs(value));
    expect(kept).toContain('koeln');
    expect(kept).not.toContain('hamburg');
  });

  it('writes nothing when no city is left to store', () => {
    expect(encodePrefs({})).toBeNull();
  });
});

describe('setup cookie string', () => {
  it('is a first-party preference cookie for a year, Secure on https', () => {
    expect(cookieString('abc', false)).toBe(`${SETUP_COOKIE}=abc; path=/; max-age=31536000; SameSite=Lax`);
    expect(cookieString('abc', true)).toBe(`${SETUP_COOKIE}=abc; path=/; max-age=31536000; SameSite=Lax; Secure`);
  });

  it('deletes the cookie when there is nothing to store', () => {
    expect(cookieString(null, false)).toBe(`${SETUP_COOKIE}=; path=/; max-age=0; SameSite=Lax`);
  });
});

describe('reading and writing the cookie', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = cookieString(null, false);
  });

  it('reads back what it wrote, beside other cookies', () => {
    document.cookie = 'other=1; path=/';
    writePrefs(prefs());
    expect(readPrefs()).toEqual(prefs());
    document.cookie = 'other=; path=/; max-age=0';
  });

  it('reads nothing and writes nothing, without throwing, where the browser blocks cookies', () => {
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(readPrefs()).toEqual({});
    expect(() => writePrefs(prefs())).not.toThrow();
  });
});
