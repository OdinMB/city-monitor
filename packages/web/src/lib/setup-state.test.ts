import { describe, it, expect } from 'vitest';
import { compactCustom, compactView, defaultView, parseCustom, parseView, shownSections, type SetupView } from './setup-state.js';
import { MAX_SECTIONS, MAX_SECTION_NAME, type CustomSetup } from './custom-setup.js';

const custom: CustomSetup = {
  sections: [
    { id: 'news', tiles: ['briefing', 'news'] },
    { id: 'c1', name: 'Mein Kiez – حيّي', tiles: ['weather', 'support'] },
  ],
  hidden: ['budget'],
};

const viaJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

describe('custom setup, compact', () => {
  it('round-trips sections, names and hidden tiles', () => {
    expect(parseCustom(viaJson(compactCustom(custom)))).toEqual(custom);
  });

  it('drops unknown and repeated tiles, and sections with a bad or repeated id', () => {
    const parsed = parseCustom({
      s: [
        { i: 'a', t: ['news', 'teleport', 'news', 4] },
        { i: 'a', t: ['weather'] },
        { i: '<script>', t: ['budget'] },
        { i: 'b', n: 42, t: ['news', 'support'] },
      ],
      h: ['support', 'feuerwehr', 'nope'],
    });
    expect(parsed).toEqual({
      sections: [{ id: 'a', tiles: ['news'] }, { id: 'b', tiles: ['support'] }],
      hidden: ['feuerwehr'],
    });
  });

  it('caps names and the number of sections', () => {
    const many = { s: Array.from({ length: MAX_SECTIONS + 5 }, (_, i) => ({ i: `c${i}`, n: 'x'.repeat(500), t: [] })) };
    const parsed = parseCustom(many)!;
    expect(parsed.sections).toHaveLength(MAX_SECTIONS);
    expect(parsed.sections[0].name).toHaveLength(MAX_SECTION_NAME);
  });

  it('is not a setup without a section, or when not one at all', () => {
    for (const raw of [{ s: [] }, { s: 'x' }, null, 'news', [1]]) expect(parseCustom(raw)).toBeNull();
  });
});

describe('shownSections', () => {
  it('shows My setup as it is, empty sections included, and a standard setup as the city resolves it', () => {
    const view: SetupView = { ...defaultView(), choice: 'custom', custom: { sections: [{ id: 'c9', tiles: [] }, ...custom.sections], hidden: [] } };
    expect(shownSections(view, 'berlin', ['weather', 'support']).map((s) => s.id)).toEqual(['c9', 'news', 'c1']);
    expect(shownSections({ ...view, choice: 'topics' }, 'berlin', ['weather', 'support']).map((s) => s.id)).toEqual(['weather', 'health']);
  });
});

describe('setup view, compact', () => {
  const view: SetupView = {
    choice: 'custom',
    custom,
    collapsed: { functional: ['background'], topics: [], custom: ['c1'] },
  };

  it('round-trips the choice, My setup and the collapsed sections of each setup', () => {
    expect(parseView(viaJson(compactView(view)))).toEqual(view);
    const topics: SetupView = { ...defaultView(), choice: 'topics' };
    expect(parseView(viaJson(compactView(topics)))).toEqual(topics);
  });

  it('falls back to Functional, collapsing nothing, for anything it cannot read', () => {
    expect(parseView(undefined)).toEqual(defaultView());
    expect(parseView({ s: 'q', x: { f: [1, 'news'] } })).toEqual({ ...defaultView(), collapsed: { functional: ['news'], topics: [], custom: [] } });
  });

  it('shows Functional when My setup is chosen but cannot be read', () => {
    expect(parseView({ s: 'c', c: { s: [] } }).choice).toBe('functional');
  });
});
