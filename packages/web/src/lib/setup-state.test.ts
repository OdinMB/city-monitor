import { describe, it, expect } from 'vitest';
import {
  MAX_CUSTOM_SETUPS, MAX_SETUP_NAME, PREVIEW_ID, addSetup, canAddSetup, chooseSetup, defaultView, deleteSetup, editSetup, keepPreview,
  nextSetupName, previewView, renameSetup, setupMapDiff, sharedOf, shownCustom, shownSections, toggleCollapsed, withSetupMap,
  type NamedSetup, type SetupView,
} from './setup-state.js';
import { removeTile } from './custom-setup.js';
import type { ResolvedSection, TileId } from './tile-setups.js';
import type { DataLayer } from '../hooks/useCommandCenter.js';

const kiez: NamedSetup = {
  id: 'm1',
  name: 'Mein Kiez',
  sections: [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'c1', name: 'Draußen', tiles: ['weather', 'support'] }],
  hidden: ['budget'],
};
const commute: NamedSetup = { id: 'm2', name: 'Pendeln', sections: [{ id: 'c1', tiles: ['transit', 'support'] }], hidden: [] };
const withSetups = (...customSetups: NamedSetup[]): SetupView => ({ ...defaultView(), customSetups });
const everyday: ResolvedSection[] = [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'crises', tiles: ['support'] }];
const AVAILABLE: TileId[] = ['briefing', 'news', 'weather', 'transit', 'budget', 'support'];

describe('the setup shown', () => {
  it('is Everyday to begin with', () => {
    expect(defaultView()).toEqual({ choice: 'everyday', customSetups: [], collapsed: {}, presetMaps: {} });
  });

  it('is a visitor’s setup as it is, or a preset as the city resolves it', () => {
    const view = chooseSetup(withSetups(kiez), 'm1');
    expect(shownCustom(view)).toBe(kiez);
    expect(shownSections(view, 'berlin', ['weather', 'support'])).toBe(kiez.sections);
    expect(shownSections(chooseSetup(view, 'commute'), 'berlin', ['weather', 'support']).map((s) => s.id)).toEqual(['conditions']);
  });

  it('cannot be a setup the visitor does not have', () => {
    const view = withSetups(kiez);
    expect(chooseSetup(view, 'm2')).toBe(view);
  });

  it('is shared as a preset’s id, or a visitor’s setup without its id or map', () => {
    expect(sharedOf(chooseSetup(withSetups(kiez), 'health'))).toBe('health');
    const mapped = { ...kiez, map: { crimeLayer: 'kiez' as const } };
    expect(sharedOf(chooseSetup(withSetups(mapped), 'm1'))).toEqual({ name: 'Mein Kiez', sections: kiez.sections, hidden: ['budget'] });
  });
});

describe('the visitor’s setups', () => {
  it('start as a copy of the setup shown, named, shown, and alone in their collapse', () => {
    const view = addSetup(toggleCollapsed(defaultView(), 'news'), everyday, 'My setup', ['briefing', 'news', 'support']);
    const added = shownCustom(view)!;
    expect(added).toEqual({ id: 'm1', name: 'My setup', sections: everyday, hidden: [] });
    expect(added.sections[0].tiles).not.toBe(everyday[0].tiles);
    expect(view.collapsed).toEqual({ everyday: ['news'] });
  });

  it('hide the city’s tiles that the setup copied does not show', () => {
    const view = addSetup(chooseSetup(defaultView(), 'commute'), [{ id: 'c1', tiles: ['transit', 'support'] }], 'Mine', AVAILABLE);
    expect(shownCustom(view)!.hidden).toEqual(['briefing', 'news', 'weather', 'budget']);
  });

  it('copy a visitor’s setup with its hidden tiles', () => {
    const view = chooseSetup(withSetups(kiez), 'm1');
    const copy = shownCustom(addSetup(view, kiez.sections, 'Copy', ['briefing', 'news', 'weather', 'budget', 'support']))!;
    expect(copy.id).toBe('m2');
    expect(copy.hidden).toEqual(['budget']);
  });

  it('are at most MAX_CUSTOM_SETUPS', () => {
    let view = defaultView();
    for (let i = 0; i < MAX_CUSTOM_SETUPS; i++) view = addSetup(view, everyday, 'x', AVAILABLE);
    expect(canAddSetup(view)).toBe(false);
    expect(addSetup(view, everyday, 'one more', AVAILABLE)).toBe(view);
  });

  it('take the first free id again once one is deleted', () => {
    const view = deleteSetup(withSetups(kiez, commute), 'm1');
    expect(shownCustom(addSetup(view, everyday, 'x', AVAILABLE))!.id).toBe('m1');
  });

  it('are named My setup, My setup 2, … by default, whichever is free first', () => {
    expect(nextSetupName(defaultView(), 'My setup')).toBe('My setup');
    const one = addSetup(defaultView(), everyday, 'My setup', AVAILABLE);
    expect(nextSetupName(one, 'My setup')).toBe('My setup 2');
    const three = addSetup(addSetup(one, everyday, 'My setup 2', AVAILABLE), everyday, 'My setup 3', AVAILABLE);
    expect(nextSetupName(deleteSetup(three, 'm2'), 'My setup')).toBe('My setup 2');
  });

  it('are renamed, the name capped', () => {
    const view = renameSetup(withSetups(kiez), 'm1', 'K'.repeat(100));
    expect(view.customSetups[0].name).toHaveLength(MAX_SETUP_NAME);
  });

  it('are edited one at a time, the others left alone', () => {
    const view = editSetup(withSetups(kiez, commute), 'm1', (s) => removeTile(s, 'weather'));
    expect(view.customSetups[0]).toEqual({ ...kiez, sections: [kiez.sections[0], { ...kiez.sections[1], tiles: ['support'] }], hidden: ['budget', 'weather'] });
    expect(view.customSetups[1]).toBe(commute);
  });

  it('keep their map through an edit of their tiles', () => {
    const view = withSetups({ ...kiez, map: { crimeLayer: 'kiez' } });
    expect(editSetup(view, 'm1', (s) => removeTile(s, 'weather')).customSetups[0].map).toEqual({ crimeLayer: 'kiez' });
  });

  it('stay as they are for an edit that changes nothing', () => {
    const view = withSetups(kiez);
    expect(editSetup(view, 'm1', (s) => removeTile(s, 'support'))).toBe(view);
  });

  it('forget a deleted section’s collapse, so a new section with its id opens', () => {
    const view = toggleCollapsed(chooseSetup(withSetups(kiez), 'm1'), 'c1');
    const edited = editSetup(view, 'm1', (s) => ({ ...s, sections: s.sections.filter((x) => x.id !== 'c1') }));
    expect(edited.collapsed).toEqual({});
  });

  it('when deleted, take their collapse along and leave Everyday shown if they were', () => {
    const view = toggleCollapsed(chooseSetup(withSetups(kiez, commute), 'm1'), 'news');
    const after = deleteSetup(view, 'm1');
    expect(after).toEqual({ choice: 'everyday', customSetups: [commute], collapsed: {}, presetMaps: {} });
    expect(deleteSetup(chooseSetup(view, 'storm'), 'm2').choice).toBe('storm');
  });
});

describe('collapsed sections', () => {
  it('are remembered per setup', () => {
    let view = toggleCollapsed(defaultView(), 'news');
    view = toggleCollapsed(chooseSetup(view, 'commute'), 'conditions');
    expect(view.collapsed).toEqual({ everyday: ['news'], commute: ['conditions'] });
    view = toggleCollapsed(chooseSetup(view, 'everyday'), 'news');
    expect(view.collapsed).toEqual({ commute: ['conditions'] });
  });
});

describe('a setup’s map', () => {
  const parking = { activeLayers: new Set<DataLayer>(['parking']) };

  it('is kept for a preset as the visitor’s change of its map, with when it was made', () => {
    const view = withSetupMap(defaultView(), 'commute', parking, 50);
    expect(view.presetMaps).toEqual({ commute: { map: parking, touched: 50 } });
    expect(setupMapDiff(view, 'commute')).toEqual(parking);
    expect(setupMapDiff(view, 'health')).toEqual({});
  });

  it('is kept for one of the visitor’s setups with the setup', () => {
    const view = withSetupMap(withSetups(kiez), 'm1', parking, 50);
    expect(view.customSetups[0]).toEqual({ ...kiez, map: parking });
    expect(setupMapDiff(view, 'm1')).toEqual(parking);
  });

  it('leaves the view as it is when the change is the one already kept, its time included', () => {
    const view = withSetupMap(defaultView(), 'commute', parking, 50);
    expect(withSetupMap(view, 'commute', { activeLayers: new Set<DataLayer>(['parking']) }, 99)).toBe(view);
    expect(withSetupMap(defaultView(), 'commute', {}, 99)).toEqual(defaultView());
  });

  it('forgets a preset’s change once the map is back to the preset’s own', () => {
    const view = withSetupMap(withSetupMap(defaultView(), 'commute', parking, 50), 'commute', {}, 60);
    expect(view.presetMaps).toEqual({});
  });

  it('is not kept for a setup the visitor does not have', () => {
    const view = withSetups(kiez);
    expect(withSetupMap(view, 'm3', parking, 50)).toBe(view);
  });
});

describe('a shared link’s setup', () => {
  const own = chooseSetup(withSetups(kiez), 'storm');
  const shared = { name: 'Geteilt', sections: [{ id: 'c1', tiles: ['weather' as const, 'support' as const] }], hidden: [] };

  it('is previewed over the visitor’s own: a preset chosen, someone’s setup as a setup of its own', () => {
    expect(previewView(own, 'commute')).toEqual({ ...own, choice: 'commute' });
    const preview = previewView(own, shared);
    expect(shownCustom(preview)).toEqual({ id: PREVIEW_ID, ...shared });
    expect(preview.customSetups[0]).toBe(kiez);
    expect(previewView(own, null)).toBe(own);
  });

  it('is kept as a new setup of the visitor’s, with the sections they collapsed in the preview', () => {
    const preview = toggleCollapsed(previewView(own, shared), 'c1');
    const kept = keepPreview(own, preview)!;
    expect(kept.choice).toBe('m2');
    expect(kept.customSetups).toEqual([kiez, { id: 'm2', ...shared }]);
    expect(kept.collapsed).toEqual({ m2: ['c1'] });
  });

  it('needs one of the visitor’s setups to replace once they have MAX_CUSTOM_SETUPS', () => {
    const full = withSetups(kiez, commute, { ...commute, id: 'm3' });
    const preview = previewView(full, shared);
    expect(keepPreview(full, preview)).toBeNull();
    const kept = keepPreview(full, preview, 'm2')!;
    expect(kept.choice).toBe('m2');
    expect(kept.customSetups.map((s) => s.name)).toEqual(['Mein Kiez', 'Geteilt', 'Pendeln']);
    expect(keepPreview(full, preview, 'm9')).toBeNull();
  });

  it('is kept as it shows when a preset, or the visitor’s own setup under a shared map', () => {
    expect(keepPreview(own, previewView(own, 'commute'))).toEqual({ ...own, choice: 'commute' });
    const kept = keepPreview(own, own)!;
    expect(kept).toEqual(own);
    expect(kept).not.toBe(own);
  });
});
