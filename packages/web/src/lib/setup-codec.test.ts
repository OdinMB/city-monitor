import { describe, it, expect } from 'vitest';
import {
  PRESET_CODES, RETIRED_PRESET_CODES, RETIRED_SECTION_CODES, RETIRED_TILE_CODES, SECTION_CODES, TILE_CODES, compactCustom, compactNamed, compactView, parseCustom,
  parseNamed, parseView,
} from './setup-codec.js';
import { defaultView, type NamedSetup, type SetupView } from './setup-state.js';
import { MAX_SECTIONS, MAX_SECTION_NAME, type CustomSetup } from './custom-setup.js';
import { PRESET_IDS, STANDARD_SECTION_KEYS, TILE_IDS } from './tile-setups.js';
import type { DataLayer } from '../hooks/useCommandCenter.js';

const custom: CustomSetup = {
  sections: [
    { id: 'news', tiles: ['briefing', 'news'] },
    { id: 'c1', name: 'Mein Kiez – حيّي', tiles: ['weather', 'crisis'] },
  ],
  hidden: ['budget', 'feuerwehr'],
};
const kiez: NamedSetup = { id: 'm1', name: 'Kiez', ...custom };
const commute: NamedSetup = { id: 'm3', name: '', sections: [{ id: 'c1', tiles: ['transit', 'crisis'] }], hidden: [] };

const viaJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

describe('codes', () => {
  it('give every tile one character of its own, never a retired code', () => {
    const codes = TILE_IDS.map((id) => TILE_CODES[id]);
    expect(codes.every((c) => /^[A-Za-z0-9]$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(TILE_IDS.length);
    expect(codes.filter((c) => RETIRED_TILE_CODES.includes(c))).toEqual([]);
    // The support tile's, now the strip every setup shows
    expect(RETIRED_TILE_CODES).toContain('s');
  });

  it('give every preset section a letter of its own, never a visitor’s section id nor a retired code', () => {
    const codes = STANDARD_SECTION_KEYS.map((key) => SECTION_CODES[key]);
    expect(codes.every((c) => /^[A-Za-z]$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(STANDARD_SECTION_KEYS.length);
    expect(codes.filter((c) => RETIRED_SECTION_CODES.includes(c))).toEqual([]);
  });

  it('give every preset a letter of its own, never a retired code', () => {
    const codes = PRESET_IDS.map((id) => PRESET_CODES[id]);
    expect(codes.every((c) => /^[a-z]$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(PRESET_IDS.length);
    expect(codes.filter((c) => RETIRED_PRESET_CODES.includes(c))).toEqual([]);
  });
});

describe('a custom setup, compact', () => {
  it('round-trips sections, names and hidden tiles, a tile a character', () => {
    const compact = compactCustom(custom);
    expect(compact).toEqual({ s: [['N', 'bn'], ['c1', 'wc', 'Mein Kiez – حيّي']], h: 'dh' });
    expect(parseCustom(viaJson(compact))).toEqual(custom);
  });

  it('drops unknown and repeated tiles, and sections with a bad or repeated id', () => {
    const parsed = parseCustom({
      s: [['a', 'n?n'], ['a', 'w'], ['<script>', 'd'], ['b', 'nc', 42], 'x', ['c', ['news']]],
      h: 'ch!',
    });
    expect(parsed).toEqual({
      sections: [{ id: 'a', tiles: ['news'] }, { id: 'b', tiles: ['crisis'] }, { id: 'c', tiles: [] }],
      hidden: ['feuerwehr'],
    });
  });

  it('loads a setup stored with the support tile (code s) without it, wherever it stood', () => {
    expect(parseCustom({ s: [['N', 'bsn'], ['C', 's'], ['c1', 'ws', 'Mine']], h: 'sd' })).toEqual({
      sections: [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'crises', tiles: [] }, { id: 'c1', name: 'Mine', tiles: ['weather'] }],
      hidden: ['budget'],
    });
  });

  it('caps names and the number of sections', () => {
    const parsed = parseCustom({ s: Array.from({ length: MAX_SECTIONS + 5 }, (_, i) => [`c${i}`, '', 'x'.repeat(500)]) })!;
    expect(parsed.sections).toHaveLength(MAX_SECTIONS);
    expect(parsed.sections[0].name).toHaveLength(MAX_SECTION_NAME);
  });

  it('is not a setup without a section, or when not one at all', () => {
    for (const raw of [{ s: [] }, { s: 'x' }, null, 'news', [1]]) expect(parseCustom(raw)).toBeNull();
  });

  it('carries its name in a link', () => {
    const { id: _id, ...shared } = kiez;
    expect(parseNamed(viaJson(compactNamed(shared)))).toEqual(shared);
    expect(parseNamed({ s: [['c1', 'w']] })).toEqual({ name: '', sections: [{ id: 'c1', tiles: ['weather'] }], hidden: [] });
  });
});

describe('a setup view, compact', () => {
  const view: SetupView = {
    choice: 'm3',
    customSetups: [{ ...kiez, map: { crimeLayer: 'kiez' } }, commute],
    collapsed: { everyday: ['background'], heatwave: ['coolingOff'], m1: ['c1'] },
    presetMaps: { commute: { map: { activeLayers: new Set<DataLayer>(['parking']) }, touched: 42 } },
  };

  it('round-trips the choice, the visitor’s setups, the collapsed sections and the map of each setup', () => {
    expect(parseView(viaJson(compactView(view)))).toEqual(view);
    const storm: SetupView = { ...defaultView(), choice: 'storm' };
    expect(parseView(viaJson(compactView(storm)))).toEqual(storm);
    expect(compactView(defaultView())).toEqual({ s: 'f' });
    expect(compactView(view).x).toEqual({ f: ['B'], w: ['k'], m1: ['c1'] });
    expect(compactView(view).p).toEqual({ c: { m: { a: 'p' }, u: 42 } });
    expect((compactView(view).c as { m?: unknown }[]).map((s) => s.m)).toEqual([{ cr: 'z' }, undefined]);
  });

  it('falls back to Everyday, collapsing nothing, for anything it cannot read', () => {
    expect(parseView(undefined)).toEqual(defaultView());
    expect(parseView({ s: 'q', x: { f: [1, 'news'], m7: ['c1'], zz: ['news'] } })).toEqual({ ...defaultView(), collapsed: { everyday: ['news'] } });
  });

  it('shows Everyday when the setup chosen cannot be read, a retired one included', () => {
    expect(parseView({ s: 'm1', c: [{ i: 'm1', n: 'x', s: [] }] }).choice).toBe('everyday');
    expect(parseView({ s: 't' }).choice).toBe('everyday');
  });

  it('skips a map change it cannot read, or one that changes nothing', () => {
    const parsed = parseView({
      s: 'f',
      c: [{ i: 'm1', n: 'x', s: [['c1', 'w']], m: 'zz' }, { i: 'm2', n: 'y', s: [['c1', 'w']], m: {} }],
      p: { c: { m: { a: 'p' } }, h: { m: {}, u: 3 }, q: { m: { a: 'p' }, u: 3 }, s: 'x', w: { m: { a: 'p' }, u: -1 } },
    });
    expect(parsed.customSetups.map((s) => s.map)).toEqual([undefined, undefined]);
    expect(parsed.presetMaps).toEqual({});
  });

  it('keeps no more than three setups, each id once, never the preview’s', () => {
    const entry = (i: string) => ({ i, n: i, s: [['c1', 'w']] });
    const parsed = parseView({ s: 'm1', c: [entry('m0'), entry('m1'), entry('m1'), entry('m2'), entry('m4'), entry('m5'), entry('x')] });
    expect(parsed.customSetups.map((s) => s.id)).toEqual(['m1', 'm2', 'm4']);
  });
});
