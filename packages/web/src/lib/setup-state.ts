import { isPreset, presetSections, type PresetId, type ResolvedSection, type TileId } from './tile-setups.js';
import { customFrom, type CustomSetup } from './custom-setup.js';
import { sameMapState } from './map-state.js';
import type { MapState } from '../hooks/useCommandCenter.js';

/**
 * A city's tile setups as the visitor left them: the setup shown, their own
 * setups (each named, at most MAX_CUSTOM_SETUPS), the collapsed sections of
 * each, and each setup's map as the visitor changed it. Every operation
 * returns a new view and leaves its input alone; one that cannot apply
 * returns the view itself. The compact form for the cookie and links is in
 * setup-codec.ts; the maps the changes lie over in setup-maps.ts.
 */

/** Three setups of a city's, each as large as it can get, still fit the cookie (setup-cookie.test.ts). */
export const MAX_CUSTOM_SETUPS = 3;
export const MAX_SETUP_NAME = 24;

/** A visitor's setup: `m1`, `m2`, … */
export type CustomSetupId = `m${number}`;
export type SetupId = PresetId | CustomSetupId;

/**
 * A setup's map as the visitor changed it: the fields that differ from the
 * map it starts from (the preset's own, or Everyday's for the visitor's
 * setups); empty while it shows that map.
 */
export type MapChange = Partial<MapState>;

export interface NamedSetup extends CustomSetup {
  id: CustomSetupId;
  /** As the visitor typed it; a blank one shows the default name. */
  name: string;
  /** Its map; none while it shows Everyday's. */
  map?: MapChange;
}

/** The visitor's change of a preset's map, and when they last made one (seconds): the cookie drops the oldest first. */
export interface PresetMapChange {
  map: MapChange;
  touched: number;
}

/** A setup as a link carries it: a preset by id, or a visitor's without its id (the map goes as a parameter of its own). */
export type SharedSetup = PresetId | Omit<NamedSetup, 'id' | 'map'>;

export interface SetupView {
  choice: SetupId;
  customSetups: NamedSetup[];
  /** The collapsed sections of each setup, by section id; a setup with none has no entry. */
  collapsed: Partial<Record<SetupId, string[]>>;
  /** The presets whose map the visitor changed. */
  presetMaps: Partial<Record<PresetId, PresetMapChange>>;
}

/** A shared link's setup while previewed: never one of the visitor's ids, which start at `m1`. */
export const PREVIEW_ID: CustomSetupId = 'm0';

export function defaultView(): SetupView {
  return { choice: 'everyday', customSetups: [], collapsed: {}, presetMaps: {} };
}

/** The visitor's setup shown, if one is. */
export function shownCustom(view: SetupView): NamedSetup | undefined {
  return view.customSetups.find((s) => s.id === view.choice);
}

/** The sections a view shows in a city: a visitor's setup as it is (fitted to the city when loaded), or the preset chosen. */
export function shownSections(view: SetupView, cityId: string, available: readonly TileId[]): ResolvedSection[] {
  const custom = shownCustom(view);
  if (custom) return custom.sections;
  return presetSections(isPreset(view.choice) ? view.choice : 'everyday', cityId, available);
}

/** The setup shown, as a link carries it. */
export function sharedOf(view: SetupView): SharedSetup {
  const custom = shownCustom(view);
  if (!custom) return isPreset(view.choice) ? view.choice : 'everyday';
  const { name, sections, hidden } = custom;
  return { name, sections, hidden };
}

function withCollapsed(collapsed: SetupView['collapsed'], id: SetupId, ids: readonly string[]): SetupView['collapsed'] {
  const rest = Object.fromEntries(Object.entries(collapsed).filter(([key]) => key !== id));
  return ids.length > 0 ? { ...rest, [id]: [...ids] } : rest;
}

/** Shows a preset or one of the visitor's setups. */
export function chooseSetup(view: SetupView, id: SetupId): SetupView {
  if (view.choice === id || (!isPreset(id) && !view.customSetups.some((s) => s.id === id))) return view;
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
 * screen, with the city's other tiles (`available`) hidden. None past
 * MAX_CUSTOM_SETUPS. Its map is for the caller to set (withSetupMap).
 */
export function addSetup(view: SetupView, shown: readonly ResolvedSection[], name: string, available: readonly TileId[]): SetupView {
  if (!canAddSetup(view)) return view;
  const setup: NamedSetup = { id: nextSetupId(view), name: name.slice(0, MAX_SETUP_NAME), ...customFrom(shown, available) };
  return { ...view, choice: setup.id, customSetups: [...view.customSetups, setup], collapsed: withCollapsed(view.collapsed, setup.id, []) };
}

/** Deletes one of the visitor's setups; Everyday shows if it was shown. */
export function deleteSetup(view: SetupView, id: CustomSetupId): SetupView {
  if (!view.customSetups.some((s) => s.id === id)) return view;
  return {
    ...view,
    choice: view.choice === id ? 'everyday' : view.choice,
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

/** A setup's map as the visitor changed it (MapChange). */
export function setupMapDiff(view: SetupView, id: SetupId): MapChange {
  if (isPreset(id)) return view.presetMaps[id]?.map ?? {};
  return view.customSetups.find((s) => s.id === id)?.map ?? {};
}

/**
 * Keeps `map` as the setup's map change, at `touched` for a preset; an empty
 * one forgets it. The view itself when that change is already kept.
 */
export function withSetupMap(view: SetupView, id: SetupId, map: MapChange, touched: number): SetupView {
  if (sameMapState(map, setupMapDiff(view, id))) return view;
  const empty = Object.keys(map).length === 0;
  if (isPreset(id)) {
    const rest = Object.fromEntries(Object.entries(view.presetMaps).filter(([key]) => key !== id));
    return { ...view, presetMaps: empty ? rest : { ...rest, [id]: { map, touched } } };
  }
  return editNamed(view, id, ({ map: _old, ...setup }) => (empty ? setup : { ...setup, map }));
}

/**
 * A shared link's setup shown over the visitor's own view: a preset chosen,
 * someone's setup added under PREVIEW_ID and shown. A link with only a map
 * state (`null`) shows the visitor's own view.
 */
export function previewView(own: SetupView, shared: SharedSetup | null): SetupView {
  if (shared === null) return own;
  if (typeof shared === 'string') return { ...own, choice: shared };
  return {
    ...own,
    choice: PREVIEW_ID,
    customSetups: [...own.customSetups, { ...shared, id: PREVIEW_ID }],
    collapsed: withCollapsed(own.collapsed, PREVIEW_ID, []),
  };
}

/**
 * The previewed view made the visitor's own: someone's setup as a new setup
 * of theirs, or in place of `replace` (needed once they have
 * MAX_CUSTOM_SETUPS; null without it), anything else as it shows. The map
 * shown is for the caller to keep (withSetupMap).
 */
export function keepPreview(own: SetupView, preview: SetupView, replace?: CustomSetupId): SetupView | null {
  const shared = preview.customSetups.find((s) => s.id === PREVIEW_ID);
  if (!shared) return { ...preview };
  if (replace !== undefined && !own.customSetups.some((s) => s.id === replace)) return null;
  const id = replace ?? (canAddSetup(own) ? nextSetupId(own) : null);
  if (id === null) return null;
  const kept: NamedSetup = { ...shared, id };
  const customSetups = replace ? own.customSetups.map((s) => (s.id === replace ? kept : s)) : [...own.customSetups, kept];
  return { ...own, choice: id, customSetups, collapsed: withCollapsed(own.collapsed, id, preview.collapsed[PREVIEW_ID] ?? []) };
}
