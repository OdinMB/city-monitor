import { describe, it, expect } from 'vitest';
import {
  MAX_CUSTOM_SETUPS, MAX_SETUP_NAME, PREVIEW_ID, addSetup, canAddSetup, chooseSetup, defaultView, deleteSetup, editSetup, keepPreview,
  nextSetupName, previewView, renameSetup, sharedOf, shownCustom, shownSections, toggleCollapsed, type NamedSetup, type SetupView,
} from './setup-state.js';
import { removeTile } from './custom-setup.js';
import type { ResolvedSection } from './tile-setups.js';

const kiez: NamedSetup = {
  id: 'm1',
  name: 'Mein Kiez',
  sections: [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'c1', name: 'Draußen', tiles: ['weather', 'support'] }],
  hidden: ['budget'],
};
const commute: NamedSetup = { id: 'm2', name: 'Pendeln', sections: [{ id: 'c1', tiles: ['transit', 'support'] }], hidden: [] };
const withSetups = (...customSetups: NamedSetup[]): SetupView => ({ ...defaultView(), customSetups });
const functional: ResolvedSection[] = [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'crises', tiles: ['support'] }];

describe('the setup shown', () => {
  it('is Functional to begin with', () => {
    expect(defaultView()).toEqual({ choice: 'functional', customSetups: [], collapsed: {} });
  });

  it('is a visitor’s setup as it is, or a standard setup as the city resolves it', () => {
    const view = chooseSetup(withSetups(kiez), 'm1');
    expect(shownCustom(view)).toBe(kiez);
    expect(shownSections(view, 'berlin', ['weather', 'support'])).toBe(kiez.sections);
    expect(shownSections(chooseSetup(view, 'topics'), 'berlin', ['weather', 'support']).map((s) => s.id)).toEqual(['weather', 'health']);
  });

  it('cannot be a setup the visitor does not have', () => {
    const view = withSetups(kiez);
    expect(chooseSetup(view, 'm2')).toBe(view);
  });

  it('is shared as a standard setup’s name, or a visitor’s setup without its id', () => {
    expect(sharedOf(chooseSetup(withSetups(kiez), 'topics'))).toBe('topics');
    expect(sharedOf(chooseSetup(withSetups(kiez), 'm1'))).toEqual({ name: 'Mein Kiez', sections: kiez.sections, hidden: ['budget'] });
  });
});

describe('the visitor’s setups', () => {
  it('start as a copy of the setup shown, named, shown, and alone in their collapse', () => {
    const view = addSetup(toggleCollapsed(defaultView(), 'news'), functional, 'My setup');
    const added = shownCustom(view)!;
    expect(added).toEqual({ id: 'm1', name: 'My setup', sections: functional, hidden: [] });
    expect(added.sections[0].tiles).not.toBe(functional[0].tiles);
    expect(view.collapsed).toEqual({ functional: ['news'] });
  });

  it('copy a visitor’s setup with its hidden tiles', () => {
    const view = chooseSetup(withSetups(kiez), 'm1');
    const copy = shownCustom(addSetup(view, kiez.sections, 'Copy'))!;
    expect(copy.id).toBe('m2');
    expect(copy.hidden).toEqual(['budget']);
  });

  it('are at most MAX_CUSTOM_SETUPS', () => {
    let view = defaultView();
    for (let i = 0; i < MAX_CUSTOM_SETUPS; i++) view = addSetup(view, functional, 'x');
    expect(canAddSetup(view)).toBe(false);
    expect(addSetup(view, functional, 'one more')).toBe(view);
  });

  it('take the first free id again once one is deleted', () => {
    const view = deleteSetup(withSetups(kiez, commute), 'm1');
    expect(shownCustom(addSetup(view, functional, 'x'))!.id).toBe('m1');
  });

  it('are named My setup, My setup 2, … by default, whichever is free first', () => {
    expect(nextSetupName(defaultView(), 'My setup')).toBe('My setup');
    const one = addSetup(defaultView(), functional, 'My setup');
    expect(nextSetupName(one, 'My setup')).toBe('My setup 2');
    const three = addSetup(addSetup(one, functional, 'My setup 2'), functional, 'My setup 3');
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

  it('stay as they are for an edit that changes nothing', () => {
    const view = withSetups(kiez);
    expect(editSetup(view, 'm1', (s) => removeTile(s, 'support'))).toBe(view);
  });

  it('forget a deleted section’s collapse, so a new section with its id opens', () => {
    const view = toggleCollapsed(chooseSetup(withSetups(kiez), 'm1'), 'c1');
    const edited = editSetup(view, 'm1', (s) => ({ ...s, sections: s.sections.filter((x) => x.id !== 'c1') }));
    expect(edited.collapsed).toEqual({});
  });

  it('when deleted, take their collapse along and leave Functional shown if they were', () => {
    const view = toggleCollapsed(chooseSetup(withSetups(kiez, commute), 'm1'), 'news');
    const after = deleteSetup(view, 'm1');
    expect(after).toEqual({ choice: 'functional', customSetups: [commute], collapsed: {} });
    expect(deleteSetup(chooseSetup(view, 'topics'), 'm2').choice).toBe('topics');
  });
});

describe('collapsed sections', () => {
  it('are remembered per setup', () => {
    let view = toggleCollapsed(defaultView(), 'news');
    view = toggleCollapsed(chooseSetup(view, 'topics'), 'weather');
    expect(view.collapsed).toEqual({ functional: ['news'], topics: ['weather'] });
    view = toggleCollapsed(chooseSetup(view, 'functional'), 'news');
    expect(view.collapsed).toEqual({ topics: ['weather'] });
  });
});

describe('a shared link’s setup', () => {
  const own = chooseSetup(withSetups(kiez), 'topics');
  const shared = { name: 'Geteilt', sections: [{ id: 'c1', tiles: ['weather' as const, 'support' as const] }], hidden: [] };

  it('is previewed over the visitor’s own: a standard one chosen, someone’s setup as a setup of its own', () => {
    expect(previewView(own, 'functional')).toEqual({ ...own, choice: 'functional' });
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

  it('is kept as it shows when standard, or the visitor’s own setup under a shared map', () => {
    expect(keepPreview(own, previewView(own, 'functional'))).toEqual({ ...own, choice: 'functional' });
    const kept = keepPreview(own, own)!;
    expect(kept).toEqual(own);
    expect(kept).not.toBe(own);
  });
});
