import { beforeEach, describe, expect, it } from 'vitest';
import { useTileSetup } from './useTileSetup.js';
import { defaultMapState, type DataLayer, type MapState } from './useCommandCenter.js';
import { MAX_CUSTOM_SETUPS, defaultView, previewView, shownCustom, type NamedSetup, type SetupView } from '../lib/setup-state.js';
import { presetMap } from '../lib/setup-maps.js';
import { removeTile } from '../lib/custom-setup.js';
import type { ResolvedSection } from '../lib/tile-setups.js';
import { berlin } from '../config/cities/berlin.js';

const initial = useTileSetup.getState();
const state = () => useTileSetup.getState();
const shown = () => shownCustom(state().view);

const everyday: ResolvedSection[] = [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'crises', tiles: ['support'] }];
const commute: ResolvedSection[] = [{ id: 'conditions', tiles: ['weather'] }, { id: 'news', tiles: ['news', 'support'] }];
const kiez: NamedSetup = { id: 'm1', name: 'Kiez', sections: [{ id: 'c1', tiles: ['weather', 'support'] }], hidden: [] };
const mine: SetupView = { ...defaultView(), choice: 'm1', customSetups: [kiez] };
const everydayMap = () => defaultMapState('berlin');
const withLayers = (map: MapState, ...layers: DataLayer[]): MapState => ({ ...map, activeLayers: new Set([...map.activeLayers, ...layers]) });

describe('useTileSetup', () => {
  beforeEach(() => {
    useTileSetup.setState(initial, true);
    state().load(berlin, defaultView());
  });

  it('shows the setup chosen, and keeps it as the visitor’s own', () => {
    state().choose('commute');
    expect(state().view.choice).toBe('commute');
    expect(state().own).toBe(state().view);
  });

  it('makes a new setup from the one shown, named, with the map shown, and opens setup mode on it', () => {
    state().newSetup(everyday, 'My setup', withLayers(everydayMap(), 'parking'));
    expect(state().editing).toBe(true);
    expect(shown()).toMatchObject({ id: 'm1', name: 'My setup', sections: everyday });
    expect([...shown()!.map!.activeLayers!]).toContain('parking');
    state().editCustom((c) => removeTile(c, 'news'));
    expect(everyday[0].tiles).toEqual(['briefing', 'news']);
    expect(shown()!.hidden).toContain('news');
  });

  it('keeps no map for a new setup made on Everyday’s map', () => {
    state().newSetup(everyday, 'My setup', everydayMap());
    expect(shown()!.map).toBeUndefined();
  });

  it('hides the city’s tiles a preset leaves out in a setup copied from it', () => {
    state().choose('commute');
    state().newSetup(commute, 'Mine', presetMap('commute', berlin));
    expect(shown()!.hidden).toEqual(expect.arrayContaining(['briefing', 'budget', 'transit']));
    expect(shown()!.hidden).not.toContain('support');
  });

  it('makes no setup past the limit', () => {
    for (let i = 0; i <= MAX_CUSTOM_SETUPS; i++) state().newSetup(everyday, `S${i}`, everydayMap());
    expect(state().own.customSetups).toHaveLength(MAX_CUSTOM_SETUPS);
  });

  it('opens setup mode on a setup of the visitor’s without changing what the cookie keeps', () => {
    state().load(berlin, { ...mine, choice: 'everyday' });
    const before = state().own;
    state().choose('m1');
    const chosen = state().own;
    state().startEditing('m1');
    expect(state().editing).toBe(true);
    expect(state().own).toBe(chosen);
    expect(chosen).not.toBe(before);
  });

  it('renames the setup shown', () => {
    state().load(berlin, mine);
    state().renameCustom('Mein Kiez');
    expect(state().own.customSetups[0].name).toBe('Mein Kiez');
  });

  it('leaves the state alone for an edit that changes nothing', () => {
    state().load(berlin, mine);
    const before = state().own;
    state().editCustom((c) => removeTile(c, 'support'));
    expect(state().own).toBe(before);
  });

  it('starts the setup shown afresh from a preset on reset, its map kept', () => {
    state().load(berlin, { ...mine, customSetups: [{ ...kiez, map: { crimeLayer: 'kiez' } }] });
    state().startEditing('m1');
    state().resetCustom(commute);
    expect(shown()!.sections).toEqual(commute);
    expect(shown()!.hidden).toContain('transit');
    expect(shown()!.name).toBe('Kiez');
    expect(shown()!.map).toEqual({ crimeLayer: 'kiez' });
  });

  it('deletes a setup, leaving setup mode when it was the one edited', () => {
    state().load(berlin, mine);
    state().startEditing('m1');
    state().deleteSetup('m1');
    expect(state().own.customSetups).toEqual([]);
    expect(state().view.choice).toBe('everyday');
    expect(state().editing).toBe(false);
  });

  it('remembers collapsed sections per setup', () => {
    state().toggleCollapsed('news');
    state().choose('commute');
    state().toggleCollapsed('conditions');
    expect(state().own.collapsed).toEqual({ everyday: ['news'], commute: ['conditions'] });
  });

  it('leaves setup mode when another setup is chosen', () => {
    state().newSetup(everyday, 'My setup', everydayMap());
    state().choose('storm');
    expect(state().editing).toBe(false);
  });

  describe('the map', () => {
    it('is kept as the visitor’s change of the preset shown', () => {
      state().choose('commute');
      state().recordMap(withLayers(presetMap('commute', berlin), 'crime'));
      expect([...state().own.presetMaps.commute!.map.activeLayers!]).toContain('crime');
      expect(state().own.presetMaps.commute!.map.trafficSubLayers).toBeUndefined();
    });

    it('is kept with the visitor’s setup shown', () => {
      state().load(berlin, mine);
      state().recordMap({ ...everydayMap(), crimeLayer: 'robbery' });
      expect(shown()!.map).toEqual({ crimeLayer: 'robbery' });
    });

    it('leaves the state alone when it is what the setup keeps already', () => {
      const before = state().own;
      state().recordMap(everydayMap());
      expect(state().own).toBe(before);
    });

    it('forgets the change once the map is the preset’s own again, or on reset', () => {
      state().choose('health');
      state().recordMap(withLayers(presetMap('health', berlin), 'crime'));
      state().recordMap(presetMap('health', berlin));
      expect(state().own.presetMaps).toEqual({});
      state().recordMap(withLayers(presetMap('health', berlin), 'crime'));
      state().resetPresetMap('health');
      expect(state().own.presetMaps).toEqual({});
    });
  });

  describe('a shared setup', () => {
    const shared = { name: 'Geteilt', sections: [{ id: 'c1', tiles: ['weather' as const, 'support' as const] }], hidden: [] };

    beforeEach(() => {
      state().load(berlin, mine, previewView(mine, shared));
    });

    it('is shown while the visitor’s own stays as it was', () => {
      expect(state().shared).toBe(true);
      expect(shown()!.name).toBe('Geteilt');
      expect(state().own).toBe(mine);
    });

    it('collapses its sections for the visit only', () => {
      state().toggleCollapsed('c1');
      expect(state().view.collapsed.m0).toEqual(['c1']);
      expect(state().shared).toBe(true);
      expect(state().own).toBe(mine);
    });

    it('keeps no map change while previewed', () => {
      state().recordMap(withLayers(everydayMap(), 'crime'));
      state().resetPresetMap('commute');
      expect(state().own).toBe(mine);
      expect(state().shared).toBe(true);
    });

    it('goes back to the visitor’s own', () => {
      state().backToOwn();
      expect(state().shared).toBe(false);
      expect(state().view).toBe(mine);
    });

    it('becomes a new setup of the visitor’s when kept, with the map shown', () => {
      expect(state().keepShared(withLayers(everydayMap(), 'crime'))).toBe(true);
      expect(state().shared).toBe(false);
      expect(state().own.customSetups.map((s) => s.name)).toEqual(['Kiez', 'Geteilt']);
      expect(state().view.choice).toBe('m2');
      expect([...shown()!.map!.activeLayers!]).toContain('crime');
    });

    it('asks which setup to replace once the visitor has the most they can keep', () => {
      const full: SetupView = { ...mine, customSetups: [kiez, { ...kiez, id: 'm2' }, { ...kiez, id: 'm3', name: 'Drei' }] };
      state().load(berlin, full, previewView(full, shared));
      expect(state().keepShared(everydayMap())).toBe(false);
      expect(state().shared).toBe(true);
      expect(state().keepShared(everydayMap(), 'm3')).toBe(true);
      expect(state().own.customSetups.map((s) => s.name)).toEqual(['Kiez', 'Kiez', 'Geteilt']);
    });
  });
});
