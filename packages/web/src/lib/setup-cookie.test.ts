import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  MAX_COOKIE_LENGTH, SETUP_COOKIE, cookieString, decodePrefs, encodePrefs, readPrefs, writePrefs, type CityPrefs, type SetupPrefs,
} from './setup-cookie.js';
import { encodeJson } from './compact-json.js';
import { MAX_CUSTOM_SETUPS, MAX_SETUP_NAME, defaultView, type NamedSetup } from './setup-state.js';
import { STANDARD_SECTION_KEYS, TILE_IDS } from './tile-setups.js';
import { CATEGORY_LAYERS, GROUP_CATEGORIES, defaultMapState, type DataLayer, type MapCategory } from '../hooks/useCommandCenter.js';
import { MAX_SECTIONS, MAX_SECTION_NAME } from './custom-setup.js';

const prefs = (): SetupPrefs => ({
  berlin: {
    view: {
      choice: 'm1',
      customSetups: [{ id: 'm1', name: 'Kiez', sections: [{ id: 'c1', name: 'Draußen', tiles: ['news', 'support'] }], hidden: ['budget'] }],
      collapsed: { m1: ['c1'] },
    },
    map: { ...defaultMapState('berlin'), activeLayers: new Set<DataLayer>(['crime']) },
    touched: 200,
  },
  hamburg: { view: { ...defaultView(), choice: 'topics' }, touched: 100 },
});

/**
 * A city entry as large as the visitor can make it: MAX_CUSTOM_SETUPS setups,
 * each with every section at its longest id, every name at full length in
 * 2-byte characters (Arabic, Turkish, German; emoji count two characters of
 * four bytes), every tile, every section of every setup collapsed, and the
 * whole map.
 */
const huge = (touched: number): CityPrefs => {
  const ids = [...STANDARD_SECTION_KEYS].sort((a, b) => b.length - a.length).slice(0, MAX_SECTIONS);
  const name = (length: number) => 'ع'.repeat(length);
  const customSetups: NamedSetup[] = Array.from({ length: MAX_CUSTOM_SETUPS }, (_, n) => ({
    id: `m${n + 1}`,
    name: name(MAX_SETUP_NAME),
    sections: ids.map((id, i) => ({ id, name: name(MAX_SECTION_NAME), tiles: TILE_IDS.filter((_, t) => t % MAX_SECTIONS === i) })),
    hidden: [],
  }));
  return {
    view: {
      choice: 'm1',
      customSetups,
      collapsed: {
        functional: ['background', 'crises', 'disturbances', 'environment', 'news'],
        topics: ['news', 'weather', 'environment', 'traffic', 'health', 'cityHall', 'social'],
        ...Object.fromEntries(customSetups.map((s) => [s.id, ids])),
      },
    },
    map: {
      ...defaultMapState('berlin'),
      activeLayers: new Set(Object.values(CATEGORY_LAYERS).flat()),
      openEmpty: new Set<MapCategory>(GROUP_CATEGORIES),
      trafficSubLayers: new Set(['public-transport', 'incidents', 'congestion', 'roadworks', 'car-counts', 'bike-counts', 'telraam']),
      politicalLayer: 'landesparlament',
      socialLayer: 'single-parent',
    },
    touched,
  };
};

describe('setup cookie value', () => {
  it('round-trips each city’s setups and map state', () => {
    expect(decodePrefs(encodePrefs(prefs())!)).toEqual(prefs());
  });

  it('reads nothing from a value it did not write, an earlier version’s included, without throwing', () => {
    const v1 = encodeJson({ v: 1, c: { berlin: { s: 'c', c: { s: [{ i: 'c1', t: ['news'] }] }, u: 5 } } });
    for (const value of [undefined, '', 'garbage!', v1, encodeJson({ v: 3, c: {} }), encodeJson({ v: 2, c: [] }), encodeJson(null)]) {
      expect(decodePrefs(value)).toEqual({});
    }
  });

  it('skips a city entry it cannot read and keeps the others', () => {
    const value = encodeJson({ v: 2, c: { berlin: { s: 't', u: 5 }, 'Not a city!': { s: 't', u: 5 }, koeln: 'x' } });
    expect(Object.keys(decodePrefs(value))).toEqual(['berlin']);
  });

  it('reads nothing from a value over the size limit', () => {
    expect(decodePrefs('A'.repeat(MAX_COOKIE_LENGTH + 1))).toEqual({});
  });

  it('always has room for one city, however large its setups', () => {
    const value = encodePrefs({ berlin: huge(1) })!;
    expect(value).not.toBeNull();
    expect(decodePrefs(value)).toEqual({ berlin: huge(1) });
  });

  it('stays under the limit by dropping the cities touched longest ago', () => {
    const big: SetupPrefs = { berlin: huge(3), hamburg: huge(1), koeln: huge(4), muenchen: huge(2) };
    const value = encodePrefs(big)!;
    expect(`${SETUP_COOKIE}=${value}`.length).toBeLessThanOrEqual(MAX_COOKIE_LENGTH);
    expect(Object.keys(decodePrefs(value))).toEqual(['koeln']);
  });

  it('has no value when no city is left to store', () => {
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

  it('keeps the cookie as it was rather than lose it, should a city ever not fit on its own', () => {
    writePrefs(prefs());
    const tooLong = huge(300);
    tooLong.view.customSetups[0].name = 'x'.repeat(MAX_COOKIE_LENGTH);
    writePrefs({ ...prefs(), berlin: tooLong });
    expect(readPrefs()).toEqual(prefs());
  });

  it('reads nothing and writes nothing, without throwing, where the browser blocks cookies', () => {
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(readPrefs()).toEqual({});
    expect(() => writePrefs(prefs())).not.toThrow();
  });
});
