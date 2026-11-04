import { beforeEach, describe, expect, it } from 'vitest';
import { useTileSetup } from './useTileSetup.js';
import { defaultView, type SetupView } from '../lib/setup-state.js';
import { removeTile } from '../lib/custom-setup.js';
import type { ResolvedSection } from '../lib/tile-setups.js';

const initial = useTileSetup.getState();
const state = () => useTileSetup.getState();

const functional: ResolvedSection[] = [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'crises', tiles: ['support'] }];
const topics: ResolvedSection[] = [{ id: 'weather', tiles: ['weather'] }, { id: 'health', tiles: ['support'] }];
const mine: SetupView = {
  ...defaultView(),
  choice: 'custom',
  custom: { sections: [{ id: 'c1', name: 'Mine', tiles: ['weather', 'support'] }], hidden: [] },
};

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

  it('offers My setup only once there is one', () => {
    state().choose('custom');
    expect(state().view.choice).toBe('functional');
  });

  it('copies a standard setup into My setup to customize it, leaving the standard one alone', () => {
    state().customize(functional);
    expect(state().editing).toBe(true);
    expect(state().view.choice).toBe('custom');
    expect(state().view.custom!.sections).toEqual(functional);
    state().editCustom((c) => removeTile(c, 'news'));
    expect(functional[0].tiles).toEqual(['briefing', 'news']);
    expect(state().view.custom!.hidden).toEqual(['news']);
  });

  it('edits My setup in place when customizing from it', () => {
    state().load('berlin', mine);
    const before = state().own;
    state().customize(functional);
    expect(state().view.custom).toEqual(mine.custom);
    // Opening setup mode alone changes nothing the cookie keeps
    expect(state().own).toBe(before);
  });

  it('leaves the state alone for an edit that changes nothing', () => {
    state().load('berlin', mine);
    const before = state().own;
    state().editCustom((c) => removeTile(c, 'support'));
    expect(state().own).toBe(before);
  });

  it('replaces My setup with a fresh copy on reset', () => {
    state().load('berlin', mine);
    state().customize(functional);
    state().resetCustom(topics);
    expect(state().view.custom!.sections).toEqual(topics);
  });

  it('remembers collapsed sections per setup', () => {
    state().toggleCollapsed('news');
    state().choose('topics');
    expect(state().view.collapsed.topics).toEqual([]);
    state().toggleCollapsed('weather');
    state().choose('functional');
    expect(state().view.collapsed).toEqual({ functional: ['news'], topics: ['weather'], custom: [] });
    state().toggleCollapsed('news');
    expect(state().view.collapsed.functional).toEqual([]);
  });

  it('forgets a deleted section’s collapse, so a new section with its id opens', () => {
    state().load('berlin', { ...mine, custom: { sections: [...mine.custom!.sections, { id: 'c2', tiles: [] }], hidden: [] } });
    state().toggleCollapsed('c2');
    state().editCustom((c) => ({ ...c, sections: c.sections.filter((s) => s.id !== 'c2') }));
    expect(state().view.collapsed.custom).toEqual([]);
  });

  it('leaves setup mode when a standard setup is chosen', () => {
    state().customize(functional);
    state().choose('topics');
    expect(state().editing).toBe(false);
  });

  describe('a shared setup', () => {
    const shared: SetupView = { ...defaultView(), choice: 'topics' };

    beforeEach(() => {
      state().load('berlin', mine, shared);
    });

    it('is shown while the visitor’s own stays as it was', () => {
      expect(state().shared).toBe(true);
      expect(state().view).toEqual(shared);
      expect(state().own).toEqual(mine);
    });

    it('goes back to the visitor’s own', () => {
      state().backToOwn();
      expect(state().shared).toBe(false);
      expect(state().view).toEqual(mine);
    });

    it('becomes the visitor’s own when kept', () => {
      state().keepShared();
      expect(state().shared).toBe(false);
      expect(state().own).toEqual(shared);
    });

    it('becomes the visitor’s own with any edit', () => {
      state().toggleCollapsed('weather');
      expect(state().shared).toBe(false);
      expect(state().own.choice).toBe('topics');
    });
  });
});
