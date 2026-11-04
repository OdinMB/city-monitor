import { standardSections, type ResolvedSection, type StandardSetup, type TileId } from './tile-setups.js';
import { customFrom, type CustomSetup } from './custom-setup.js';

/**
 * A city's tile setups as the visitor left them: the setup shown, their own
 * setups (each named, at most MAX_CUSTOM_SETUPS) and the collapsed sections of
 * each. Every operation returns a new view and leaves its input alone; one
 * that cannot apply returns the view itself. The compact form for the cookie
 * and links is in setup-codec.ts.
 */

/** Three setups of a city's, each as large as it can get, still fit the cookie (setup-cookie.test.ts). */
export const MAX_CUSTOM_SETUPS = 3;
export const MAX_SETUP_NAME = 24;

/** A visitor's setup: `m1`, `m2`, … */
export type CustomSetupId = `m${number}`;
export type SetupId = StandardSetup | CustomSetupId;

export interface NamedSetup extends CustomSetup {
  id: CustomSetupId;
  /** As the visitor typed it; a blank one shows the default name. */
  name: string;
}

/** A setup as a link carries it: a standard setup by name, or a visitor's without its id. */
export type SharedSetup = StandardSetup | Omit<NamedSetup, 'id'>;

export interface SetupView {
  choice: SetupId;
  customSetups: NamedSetup[];
  /** The collapsed sections of each setup, by section id; a setup with none has no entry. */
  collapsed: Partial<Record<SetupId, string[]>>;
}

/** A shared link's setup while previewed: never one of the visitor's ids, which start at `m1`. */
export const PREVIEW_ID: CustomSetupId = 'm0';

export function isStandardSetup(id: string): id is StandardSetup {
  return id === 'functional' || id === 'topics';
}

export function defaultView(): SetupView {
  return { choice: 'functional', customSetups: [], collapsed: {} };
}

/** The visitor's setup shown, if one is. */
export function shownCustom(view: SetupView): NamedSetup | undefined {
  return view.customSetups.find((s) => s.id === view.choice);
}

/** The sections a view shows in a city: a visitor's setup as it is (fitted to the city when loaded), or the standard setup chosen. */
export function shownSections(view: SetupView, cityId: string, available: readonly TileId[]): ResolvedSection[] {
  const custom = shownCustom(view);
  if (custom) return custom.sections;
  return standardSections(isStandardSetup(view.choice) ? view.choice : 'functional', cityId, available);
}

/** The setup shown, as a link carries it. */
export function sharedOf(view: SetupView): SharedSetup {
  const custom = shownCustom(view);
  if (!custom) return isStandardSetup(view.choice) ? view.choice : 'functional';
  const { name, sections, hidden } = custom;
  return { name, sections, hidden };
}

function withCollapsed(collapsed: SetupView['collapsed'], id: SetupId, ids: readonly string[]): SetupView['collapsed'] {
  const rest = Object.fromEntries(Object.entries(collapsed).filter(([key]) => key !== id));
  return ids.length > 0 ? { ...rest, [id]: [...ids] } : rest;
}

/** Shows a standard setup or one of the visitor's. */
export function chooseSetup(view: SetupView, id: SetupId): SetupView {
  if (view.choice === id || (!isStandardSetup(id) && !view.customSetups.some((s) => s.id === id))) return view;
  return { ...view, choice: id };
}

/** Collapses or expands a section of the setup shown. */
export function toggleCollapsed(view: SetupView, sectionId: string): SetupView {
  const ids = view.collapsed[view.choice] ?? [];
  const next = ids.includes(sectionId) ? ids.filter((id) => id !== sectionId) : [...ids, sectionId];
  return { ...view, collapsed: withCollapsed(view.collapsed, view.choice, next) };
}

export function canAddSetup(view: SetupView): boolean {
  return view.customSetups.length < MAX_CUSTOM_SETUPS;
}

function nextSetupId(view: SetupView): CustomSetupId {
  let n = 1;
  while (view.customSetups.some((s) => s.id === `m${n}`)) n += 1;
  return `m${n}`;
}

/** `base` if no setup has that name, else `base 2`, `base 3`, …, whichever is free first. */
export function nextSetupName(view: SetupView, base: string): string {
  const taken = new Set(view.customSetups.map((s) => s.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  return name;
}

/**
 * A new setup of the visitor's, shown: a copy of `shown`, the sections on
 * screen, with the hidden tiles of the visitor's setup it copies. None past
 * MAX_CUSTOM_SETUPS.
 */
export function addSetup(view: SetupView, shown: readonly ResolvedSection[], name: string): SetupView {
  if (!canAddSetup(view)) return view;
  const setup: NamedSetup = {
    id: nextSetupId(view),
    name: name.slice(0, MAX_SETUP_NAME),
    ...customFrom(shown),
    hidden: [...(shownCustom(view)?.hidden ?? [])],
  };
  return { choice: setup.id, customSetups: [...view.customSetups, setup], collapsed: withCollapsed(view.collapsed, setup.id, []) };
}

/** Deletes one of the visitor's setups; Functional shows if it was shown. */
export function deleteSetup(view: SetupView, id: CustomSetupId): SetupView {
  if (!view.customSetups.some((s) => s.id === id)) return view;
  return {
    choice: view.choice === id ? 'functional' : view.choice,
    customSetups: view.customSetups.filter((s) => s.id !== id),
    collapsed: withCollapsed(view.collapsed, id, []),
  };
}

export function renameSetup(view: SetupView, id: CustomSetupId, name: string): SetupView {
  return editNamed(view, id, (setup) => ({ ...setup, name: name.slice(0, MAX_SETUP_NAME) }));
}

/**
 * Applies a custom-setup operation (custom-setup.ts) to one of the visitor's
 * setups, and forgets the collapse of any section it removed: a new section
 * may get that id and should not start collapsed.
 */
export function editSetup(view: SetupView, id: CustomSetupId, edit: (setup: CustomSetup) => CustomSetup): SetupView {
  const setup = view.customSetups.find((s) => s.id === id);
  if (!setup) return view;
  const next = edit(setup);
  if (next === setup) return view;
  const edited = editNamed(view, id, () => ({ ...setup, sections: next.sections, hidden: next.hidden }));
  const kept = (view.collapsed[id] ?? []).filter((sectionId) => next.sections.some((s) => s.id === sectionId));
  return { ...edited, collapsed: withCollapsed(view.collapsed, id, kept) };
}

function editNamed(view: SetupView, id: CustomSetupId, edit: (setup: NamedSetup) => NamedSetup): SetupView {
  if (!view.customSetups.some((s) => s.id === id)) return view;
  return { ...view, customSetups: view.customSetups.map((s) => (s.id === id ? edit(s) : s)) };
}

/**
 * A shared link's setup shown over the visitor's own view: a standard setup
 * chosen, someone's setup added under PREVIEW_ID and shown. A link with only
 * a map state (`null`) shows the visitor's own view.
 */
export function previewView(own: SetupView, shared: SharedSetup | null): SetupView {
  if (shared === null) return own;
  if (typeof shared === 'string') return { ...own, choice: shared };
  return {
    choice: PREVIEW_ID,
    customSetups: [...own.customSetups, { ...shared, id: PREVIEW_ID }],
    collapsed: withCollapsed(own.collapsed, PREVIEW_ID, []),
  };
}

/**
 * The previewed view made the visitor's own: someone's setup as a new setup
 * of theirs, or in place of `replace` (needed once they have
 * MAX_CUSTOM_SETUPS; null without it), anything else as it shows.
 */
export function keepPreview(own: SetupView, preview: SetupView, replace?: CustomSetupId): SetupView | null {
  const shared = preview.customSetups.find((s) => s.id === PREVIEW_ID);
  if (!shared) return { ...preview };
  if (replace !== undefined && !own.customSetups.some((s) => s.id === replace)) return null;
  const id = replace ?? (canAddSetup(own) ? nextSetupId(own) : null);
  if (id === null) return null;
  const kept: NamedSetup = { ...shared, id };
  const customSetups = replace ? own.customSetups.map((s) => (s.id === replace ? kept : s)) : [...own.customSetups, kept];
  return { choice: id, customSetups, collapsed: withCollapsed(own.collapsed, id, preview.collapsed[PREVIEW_ID] ?? []) };
}
