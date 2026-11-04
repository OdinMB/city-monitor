import { SUPPORT_TILE, isTileId, standardSections, type ResolvedSection, type SetupChoice, type TileId } from './tile-setups.js';
import { MAX_SECTIONS, MAX_SECTION_NAME, type CustomSection, type CustomSetup } from './custom-setup.js';

/**
 * A city's tile setup as the visitor left it, and its compact form for the
 * setup cookie and shared links: short keys, tile ids, the visitor's section
 * names as typed. Reading one back keeps what is valid and drops the rest;
 * nothing throws.
 */

export interface SetupView {
  choice: SetupChoice;
  /** My setup, once the visitor has made one. */
  custom: CustomSetup | null;
  /** The collapsed sections of each setup, by section id. */
  collapsed: Record<SetupChoice, string[]>;
}

export function defaultView(): SetupView {
  return { choice: 'functional', custom: null, collapsed: { functional: [], topics: [], custom: [] } };
}

/** The sections a view shows in a city: My setup as it is (fitted to the city when loaded), or the standard setup chosen. */
export function shownSections(view: SetupView, cityId: string, available: readonly TileId[]): ResolvedSection[] {
  if (view.choice === 'custom' && view.custom) return view.custom.sections;
  return standardSections(view.choice === 'topics' ? 'topics' : 'functional', cityId, available);
}

const CHOICE_CODES: Record<SetupChoice, string> = { functional: 'f', topics: 't', custom: 'c' };
const CHOICES = Object.keys(CHOICE_CODES) as SetupChoice[];
const choiceOf = (code: unknown) => CHOICES.find((c) => CHOICE_CODES[c] === code);

const SECTION_ID = /^[A-Za-z][A-Za-z0-9]{0,15}$/;
const MAX_COLLAPSED = MAX_SECTIONS;

const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null && !Array.isArray(raw);

export function compactCustom(setup: CustomSetup): Record<string, unknown> {
  return {
    s: setup.sections.map((s) => ({ i: s.id, ...(s.name !== undefined ? { n: s.name } : {}), t: s.tiles })),
    ...(setup.hidden.length > 0 ? { h: setup.hidden } : {}),
  };
}

/** A compact custom setup: each tile once, valid section ids once each, at least one section; otherwise null. */
export function parseCustom(raw: unknown): CustomSetup | null {
  if (!isRecord(raw) || !Array.isArray(raw.s)) return null;
  const placed = new Set<TileId>();
  const ids = new Set<string>();
  const sections: CustomSection[] = [];
  for (const entry of raw.s) {
    if (sections.length >= MAX_SECTIONS) break;
    if (!isRecord(entry) || typeof entry.i !== 'string' || !SECTION_ID.test(entry.i) || ids.has(entry.i)) continue;
    ids.add(entry.i);
    const tiles: TileId[] = [];
    for (const tile of Array.isArray(entry.t) ? entry.t : []) {
      if (!isTileId(tile) || placed.has(tile)) continue;
      placed.add(tile);
      tiles.push(tile);
    }
    const name = typeof entry.n === 'string' ? entry.n.slice(0, MAX_SECTION_NAME) : undefined;
    sections.push({ id: entry.i, ...(name !== undefined ? { name } : {}), tiles });
  }
  if (sections.length === 0) return null;
  const hidden = (Array.isArray(raw.h) ? raw.h : []).filter((t: unknown): t is TileId => isTileId(t) && t !== SUPPORT_TILE && !placed.has(t));
  return { sections, hidden: [...new Set(hidden)] };
}

export function compactView(view: SetupView): Record<string, unknown> {
  const collapsed: Record<string, string[]> = {};
  for (const choice of CHOICES) if (view.collapsed[choice].length > 0) collapsed[CHOICE_CODES[choice]] = view.collapsed[choice];
  return {
    s: CHOICE_CODES[view.choice],
    ...(view.custom ? { c: compactCustom(view.custom) } : {}),
    ...(Object.keys(collapsed).length > 0 ? { x: collapsed } : {}),
  };
}

function parseCollapsed(raw: unknown): SetupView['collapsed'] {
  const collapsed = defaultView().collapsed;
  if (!isRecord(raw)) return collapsed;
  for (const choice of CHOICES) {
    const ids = raw[CHOICE_CODES[choice]];
    if (Array.isArray(ids)) {
      collapsed[choice] = ids.filter((id: unknown): id is string => typeof id === 'string' && SECTION_ID.test(id)).slice(0, MAX_COLLAPSED);
    }
  }
  return collapsed;
}

/** A compact setup view, with Functional where the choice cannot be shown. */
export function parseView(raw: unknown): SetupView {
  if (!isRecord(raw)) return defaultView();
  const custom = parseCustom(raw.c);
  const choice = choiceOf(raw.s) ?? 'functional';
  return { choice: choice === 'custom' && !custom ? 'functional' : choice, custom, collapsed: parseCollapsed(raw.x) };
}
