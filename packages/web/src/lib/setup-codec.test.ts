import { describe, it, expect } from 'vitest';
import { SECTION_CODES, TILE_CODES, compactCustom, compactNamed, compactView, parseCustom, parseNamed, parseView } from './setup-codec.js';
import { defaultView, type NamedSetup, type SetupView } from './setup-state.js';
import { MAX_SECTIONS, MAX_SECTION_NAME, type CustomSetup } from './custom-setup.js';
import { STANDARD_SECTION_KEYS, TILE_IDS } from './tile-setups.js';

const custom: CustomSetup = {
  sections: [
    { id: 'news', tiles: ['briefing', 'news'] },
    { id: 'c1', name: 'Mein Kiez – حيّي', tiles: ['weather', 'support'] },
  ],
  hidden: ['budget', 'feuerwehr'],
};
const kiez: NamedSetup = { id: 'm1', name: 'Kiez', ...custom };
const commute: NamedSetup = { id: 'm3', name: '', sections: [{ id: 'c1', tiles: ['transit', 'support'] }], hidden: [] };

const viaJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

describe('codes', () => {
  it('give every tile one character of its own', () => {
    const codes = TILE_IDS.map((id) => TILE_CODES[id]);
    expect(codes.every((c) => /^[A-Za-z0-9]$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(TILE_IDS.length);
  });

  it('give every standard section a capital letter of its own, never a visitor’s section id', () => {
    const codes = STANDARD_SECTION_KEYS.map((key) => SECTION_CODES[key]);
    expect(codes.every((c) => /^[A-Z]$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(STANDARD_SECTION_KEYS.length);
  });
});

describe('a custom setup, compact', () => {
  it('round-trips sections, names and hidden tiles, a tile a character', () => {
    const compact = compactCustom(custom);
    expect(compact).toEqual({ s: [['N', 'bn'], ['c1', 'ws', 'Mein Kiez – حيّي']], h: 'dh' });
    expect(parseCustom(viaJson(compact))).toEqual(custom);
  });

  it('drops unknown and repeated tiles, and sections with a bad or repeated id', () => {
    const parsed = parseCustom({
      s: [['a', 'n?n'], ['a', 'w'], ['<script>', 'd'], ['b', 'ns', 42], 'x', ['c', ['news']]],
      h: 'sh!',
    });
    expect(parsed).toEqual({
      sections: [{ id: 'a', tiles: ['news'] }, { id: 'b', tiles: ['support'] }, { id: 'c', tiles: [] }],
      hidden: ['feuerwehr'],
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
    expect(parseNamed({ s: [['c1', 's']] })).toEqual({ name: '', sections: [{ id: 'c1', tiles: ['support'] }], hidden: [] });
  });
});

describe('a setup view, compact', () => {
  const view: SetupView = {
    choice: 'm3',
    customSetups: [kiez, commute],
    collapsed: { functional: ['background'], m1: ['c1'] },
  };

  it('round-trips the choice, the visitor’s setups and the collapsed sections of each setup', () => {
    expect(parseView(viaJson(compactView(view)))).toEqual(view);
    const topics: SetupView = { ...defaultView(), choice: 'topics' };
    expect(parseView(viaJson(compactView(topics)))).toEqual(topics);
    expect(compactView(defaultView())).toEqual({ s: 'f' });
    expect(compactView(view).x).toEqual({ f: ['B'], m1: ['c1'] });
  });

  it('falls back to Functional, collapsing nothing, for anything it cannot read', () => {
    expect(parseView(undefined)).toEqual(defaultView());
    expect(parseView({ s: 'q', x: { f: [1, 'news'], m7: ['c1'], zz: ['news'] } })).toEqual({ ...defaultView(), collapsed: { functional: ['news'] } });
  });

  it('shows Functional when the setup chosen cannot be read', () => {
    expect(parseView({ s: 'm1', c: [{ i: 'm1', n: 'x', s: [] }] }).choice).toBe('functional');
  });

  it('keeps no more than three setups, each id once, never the preview’s', () => {
    const entry = (i: string) => ({ i, n: i, s: [['c1', 's']] });
    const parsed = parseView({ s: 'm1', c: [entry('m0'), entry('m1'), entry('m1'), entry('m2'), entry('m4'), entry('m5'), entry('x')] });
    expect(parsed.customSetups.map((s) => s.id)).toEqual(['m1', 'm2', 'm4']);
  });
});
