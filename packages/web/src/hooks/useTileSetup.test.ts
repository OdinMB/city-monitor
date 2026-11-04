import { beforeEach, describe, expect, it } from 'vitest';
import { useTileSetup } from './useTileSetup.js';
import { MAX_CUSTOM_SETUPS, defaultView, previewView, shownCustom, type NamedSetup, type SetupView } from '../lib/setup-state.js';
import { removeTile } from '../lib/custom-setup.js';
import type { ResolvedSection } from '../lib/tile-setups.js';

const initial = useTileSetup.getState();
const state = () => useTileSetup.getState();
const shown = () => shownCustom(state().view);

const functional: ResolvedSection[] = [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'crises', tiles: ['support'] }];
const topics: ResolvedSection[] = [{ id: 'weather', tiles: ['weather'] }, { id: 'health', tiles: ['support'] }];
const kiez: NamedSetup = { id: 'm1', name: 'Kiez', sections: [{ id: 'c1', tiles: ['weather', 'support'] }], hidden: [] };
const mine: SetupView = { ...defaultView(), choice: 'm1', customSetups: [kiez] };

describe('useTileSetup', () => {
  beforeEach(() => {
    useTileSetup.setState(initial, true);
    state().load('berlin', defaultView());
  });

  it('shows the setup chosen, and keeps it as the visitor’s own', () => {
    state().choose('topics');
    expect(state().view.choice).toBe('topics');
    expect(state().own).toBe(state().view);
  });

  it('makes a new setup from the one shown, named, and opens setup mode on it', () => {
    state().newSetup(functional, 'My setup');
    expect(state().editing).toBe(true);
    expect(shown()).toMatchObject({ id: 'm1', name: 'My setup', sections: functional });
    state().editCustom((c) => removeTile(c, 'news'));
    expect(functional[0].tiles).toEqual(['briefing', 'news']);
    expect(shown()!.hidden).toEqual(['news']);
  });

  it('makes no setup past the limit', () => {
    for (let i = 0; i <= MAX_CUSTOM_SETUPS; i++) state().newSetup(functional, `S${i}`);
    expect(state().own.customSetups).toHaveLength(MAX_CUSTOM_SETUPS);
  });

  it('opens setup mode on a setup of the visitor’s without changing what the cookie keeps', () => {
    state().load('berlin', { ...mine, choice: 'functional' });
    const before = state().own;
    state().choose('m1');
    const chosen = state().own;
    state().startEditing('m1');
    expect(state().editing).toBe(true);
    expect(state().own).toBe(chosen);
    expect(chosen).not.toBe(before);
  });

  it('renames the setup shown', () => {
    state().load('berlin', mine);
    state().renameCustom('Mein Kiez');
    expect(state().own.customSetups[0].name).toBe('Mein Kiez');
  });

  it('leaves the state alone for an edit that changes nothing', () => {
    state().load('berlin', mine);
    const before = state().own;
    state().editCustom((c) => removeTile(c, 'support'));
    expect(state().own).toBe(before);
  });

  it('starts the setup shown afresh from a standard setup on reset', () => {
    state().load('berlin', mine);
    state().startEditing('m1');
    state().resetCustom(topics);
    expect(shown()!.sections).toEqual(topics);
    expect(shown()!.name).toBe('Kiez');
  });

  it('deletes a setup, leaving setup mode when it was the one edited', () => {
    state().load('berlin', mine);
    state().startEditing('m1');
    state().deleteSetup('m1');
    expect(state().own.customSetups).toEqual([]);
    expect(state().view.choice).toBe('functional');
    expect(state().editing).toBe(false);
  });

  it('remembers collapsed sections per setup', () => {
    state().toggleCollapsed('news');
    state().choose('topics');
    state().toggleCollapsed('weather');
    expect(state().own.collapsed).toEqual({ functional: ['news'], topics: ['weather'] });
  });

  it('leaves setup mode when another setup is chosen', () => {
    state().newSetup(functional, 'My setup');
    state().choose('topics');
    expect(state().editing).toBe(false);
  });

  describe('a shared setup', () => {
    const shared = { name: 'Geteilt', sections: [{ id: 'c1', tiles: ['weather' as const, 'support' as const] }], hidden: [] };

    beforeEach(() => {
      state().load('berlin', mine, previewView(mine, shared));
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

    it('goes back to the visitor’s own', () => {
      state().backToOwn();
      expect(state().shared).toBe(false);
      expect(state().view).toBe(mine);
    });

    it('becomes a new setup of the visitor’s when kept', () => {
      expect(state().keepShared()).toBe(true);
      expect(state().shared).toBe(false);
      expect(state().own.customSetups.map((s) => s.name)).toEqual(['Kiez', 'Geteilt']);
      expect(state().view.choice).toBe('m2');
    });

    it('asks which setup to replace once the visitor has the most they can keep', () => {
      const full: SetupView = { ...mine, customSetups: [kiez, { ...kiez, id: 'm2' }, { ...kiez, id: 'm3', name: 'Drei' }] };
      state().load('berlin', full, previewView(full, shared));
      expect(state().keepShared()).toBe(false);
      expect(state().shared).toBe(true);
      expect(state().keepShared('m3')).toBe(true);
      expect(state().own.customSetups.map((s) => s.name)).toEqual(['Kiez', 'Kiez', 'Geteilt']);
    });
  });
});
