import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  MAX_COOKIE_LENGTH, SETUP_COOKIE, cookieString, decodePrefs, encodePrefs, readPrefs, writePrefs, type CityPrefs, type SetupPrefs,
} from './setup-cookie.js';
import { encodeJson } from './compact-json.js';
import { MAP_VALUE_CODES } from './map-state.js';
import { MAX_CUSTOM_SETUPS, MAX_SETUP_NAME, defaultView, type NamedSetup, type SetupView } from './setup-state.js';
import { PRESET_IDS, PRESET_SECTIONS, TILE_IDS } from './tile-setups.js';
import { GROUP_CATEGORIES, type DataLayer, type MapState } from '../hooks/useCommandCenter.js';
import { MAX_SECTIONS, MAX_SECTION_NAME } from './custom-setup.js';

const prefs = (): SetupPrefs => ({
  berlin: {
    view: {
      choice: 'm1',
      customSetups: [{ id: 'm1', name: 'Kiez', sections: [{ id: 'c1', name: 'Draußen', tiles: ['news', 'crisis'] }], hidden: ['budget'], map: { crimeLayer: 'kiez' } }],
      collapsed: { m1: ['c1'] },
      presetMaps: { commute: { map: { activeLayers: new Set<DataLayer>(['traffic', 'parking']) }, touched: 150 } },
    },
    touched: 200,
  },
  hamburg: { view: { ...defaultView(), choice: 'storm' }, touched: 100 },
});

const all = <T extends string>(codes: Record<T, string>) => new Set(Object.keys(codes) as T[]);

/** A map change as large as it gets: every field, every set full. */
const fullMap = (): MapState => ({
  singleView: true,
  activeLayers: all(MAP_VALUE_CODES.activeLayers),
  openEmpty: new Set(GROUP_CATEGORIES),
  politicalLayer: 'landesparlament',
  socialLayer: 'single-parent',
  populationLayer: 'pop-foreign',
  noiseLayer: 'rail',
  noiseLiveData: false,
  newsSubLayers: all(MAP_VALUE_CODES.newsSubLayers),
  emergencySubLayers: all(MAP_VALUE_CODES.emergencySubLayers),
  waterSubLayers: all(MAP_VALUE_CODES.waterSubLayers),
  trafficSubLayers: all(MAP_VALUE_CODES.trafficSubLayers),
  accidentFilter: 'pedestrian',
  crimeLayer: 'burglary',
  heatReliefSubLayers: all(MAP_VALUE_CODES.heatReliefSubLayers),
  reportStatuses: all(MAP_VALUE_CODES.reportStatuses),
});

/**
 * A city entry as large as the visitor can make it with their own setups:
 * MAX_CUSTOM_SETUPS setups, each with MAX_SECTIONS sections of their own
 * (three-character ids), every name at full length in 2-byte characters
 * (Arabic, Turkish, German; emoji count two characters of four bytes), every
 * tile, every section of every setup and every preset collapsed, and a map
 * change in every field.
 */
const huge = (touched: number): CityPrefs => {
  const ids = Array.from({ length: MAX_SECTIONS }, (_, i) => `c${i + 10}`);
  const name = (length: number) => 'ع'.repeat(length);
  const customSetups: NamedSetup[] = Array.from({ length: MAX_CUSTOM_SETUPS }, (_, n) => ({
    id: `m${n + 1}`,
    name: name(MAX_SETUP_NAME),
    sections: ids.map((id, i) => ({ id, name: name(MAX_SECTION_NAME), tiles: TILE_IDS.filter((_, t) => t % MAX_SECTIONS === i) })),
    hidden: [],
    map: fullMap(),
  }));
  return {
    view: {
      choice: 'm1',
      customSetups,
      collapsed: {
        ...Object.fromEntries(PRESET_IDS.map((p) => [p, PRESET_SECTIONS[p].map((s) => s.key)])),
        ...Object.fromEntries(customSetups.map((s) => [s.id, ids])),
      },
      presetMaps: {},
    },
    touched,
  };
};

/** A change to every preset's map, the later in the menu the newer. */
const presetMapsOf = (map: () => Partial<MapState>, touched: number): SetupView['presetMaps'] =>
  Object.fromEntries(PRESET_IDS.map((p, i) => [p, { map: map(), touched: touched * 100 + i }]));

/** A change to a preset's map as visitors usually make one: a layer or two on or off, a choice made. */
const usualMap = (): Partial<MapState> => ({ activeLayers: new Set<DataLayer>(['traffic', 'parking', 'weather']), crimeLayer: 'kiez' });

/** `huge`, with a change to every preset's map besides, each in every field. */
const hugeWithPresetMaps = (touched: number): CityPrefs => {
  const entry = huge(touched);
  return { ...entry, view: { ...entry.view, presetMaps: presetMapsOf(fullMap, touched) } };
};

/** The newest changes to the presets' maps, as many as fit, the oldest gone. */
const newestKept = (presets: string[]) => expect(presets).toEqual(PRESET_IDS.slice(PRESET_IDS.length - presets.length));

const fits = (value: string | null) => value !== null && `${SETUP_COOKIE}=${value}`.length <= MAX_COOKIE_LENGTH;

describe('setup cookie value', () => {
  it('round-trips each city’s setups, their maps and the presets’ map changes', () => {
    expect(decodePrefs(encodePrefs(prefs())!)).toEqual(prefs());
  });

  it('reads nothing from a value it did not write, an earlier version’s included, without throwing', () => {
    const v2 = encodeJson({ v: 2, c: { berlin: { s: 't', u: 5 } } });
    for (const value of [undefined, '', 'garbage!', v2, encodeJson({ v: 4, c: {} }), encodeJson({ v: 3, c: [] }), encodeJson(null)]) {
      expect(decodePrefs(value)).toEqual({});
    }
  });

  it('reads a value written while the support tile was a tile, the setups without it', () => {
    const old = encodeJson({ v: 3, c: { berlin: { s: 'm1', c: [{ i: 'm1', n: 'Kiez', s: [['c1', 'nsc', 'Draußen']], h: 'sd' }], u: 5 } } });
    expect(decodePrefs(old).berlin.view.customSetups).toEqual([
      { id: 'm1', name: 'Kiez', sections: [{ id: 'c1', name: 'Draußen', tiles: ['news', 'crisis'] }], hidden: ['budget'] },
    ]);
    expect(decodePrefs(old).berlin.view.choice).toBe('m1');
  });

  it('skips a city entry it cannot read and keeps the others', () => {
    const value = encodeJson({ v: 3, c: { berlin: { s: 'c', u: 5 }, 'Not a city!': { s: 'c', u: 5 }, koeln: 'x' } });
    expect(Object.keys(decodePrefs(value))).toEqual(['berlin']);
  });

  it('reads nothing from a value over the size limit', () => {
    expect(decodePrefs('A'.repeat(MAX_COOKIE_LENGTH + 1))).toEqual({});
  });

  it('always has room for a city’s three setups, however large, with their maps', () => {
    const value = encodePrefs({ berlin: huge(1) });
    expect(fits(value)).toBe(true);
    expect(decodePrefs(value!)).toEqual({ berlin: huge(1) });
  });

  it('drops the changes to the presets’ maps, oldest first, never a setup, when everything is at its largest', () => {
    const value = encodePrefs({ berlin: hugeWithPresetMaps(1) });
    expect(fits(value)).toBe(true);
    const kept = decodePrefs(value!).berlin.view;
    expect(kept.customSetups).toEqual(huge(1).view.customSetups);
    expect(kept.collapsed).toEqual(huge(1).view.collapsed);
    expect(Object.keys(kept.presetMaps).length).toBeLessThan(PRESET_IDS.length);
    newestKept(Object.keys(kept.presetMaps));
  });

  it('keeps the newest changes of the usual size that fit beside setups at their largest', () => {
    const entry = huge(1);
    const value = encodePrefs({ berlin: { ...entry, view: { ...entry.view, presetMaps: presetMapsOf(usualMap, 1) } } });
    const presets = Object.keys(decodePrefs(value!).berlin.view.presetMaps);
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.length).toBeLessThan(PRESET_IDS.length);
    newestKept(presets);
  });

  it('keeps a change to every preset’s map beside three setups of the usual size', () => {
    const setups: NamedSetup[] = [1, 2, 3].map((n) => ({
      id: `m${n}`,
      name: `Mein Kiez ${n}`,
      sections: PRESET_SECTIONS.everyday.map((s) => ({ id: s.key, tiles: [...s.tiles] })),
      hidden: [],
      map: usualMap(),
    }));
    const collapsed = Object.fromEntries(PRESET_IDS.map((p) => [p, PRESET_SECTIONS[p].map((s) => s.key)]));
    const usual: CityPrefs = { touched: 1, view: { choice: 'm1', customSetups: setups, collapsed, presetMaps: presetMapsOf(usualMap, 1) } };
    expect(decodePrefs(encodePrefs({ berlin: usual })!)).toEqual({ berlin: usual });
  });

  it('drops the presets’ map changes of every city, oldest first, before it drops a city', () => {
    const big: SetupPrefs = { berlin: hugeWithPresetMaps(3), hamburg: { ...prefs().hamburg, touched: 1 } };
    const kept = decodePrefs(encodePrefs(big)!);
    expect(Object.keys(kept).sort()).toEqual(['berlin', 'hamburg']);
    expect(Object.keys(kept.berlin.view.presetMaps).length).toBeLessThan(PRESET_IDS.length);
  });

  it('stays under the limit by dropping the cities touched longest ago once no preset map change is left', () => {
    const big: SetupPrefs = { berlin: huge(3), hamburg: huge(1), koeln: hugeWithPresetMaps(4), muenchen: huge(2) };
    const value = encodePrefs(big);
    expect(fits(value)).toBe(true);
    const kept = decodePrefs(value!);
    expect(Object.keys(kept)).toEqual(['koeln']);
    expect(kept.koeln.view.customSetups).toHaveLength(MAX_CUSTOM_SETUPS);
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
