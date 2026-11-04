import { SUPPORT_TILE, type ResolvedSection, type TileId } from './tile-setups.js';

/**
 * A visitor's own setup's sections and tiles, and the edits setup mode makes
 * to them (its name and id are in setup-state.ts).
 * Every operation returns a new setup and leaves its input alone; one that
 * cannot apply (an unknown section, the last section, the support tile's
 * removal) returns the setup unchanged.
 */

export interface CustomSection {
  /** Unique within the setup: a standard section's key when copied from one, `c<n>` when added. */
  id: string;
  /** The visitor's name for it; without one (or blank) it shows its standard name. */
  name?: string;
  tiles: TileId[];
}

export interface CustomSetup {
  sections: CustomSection[];
  /** Tiles the visitor removed: the hidden tray. A tile in neither list is new and joins the last section. */
  hidden: TileId[];
}

/**
 * Caps that keep a city's MAX_CUSTOM_SETUPS setups inside the cookie, each as
 * large as it can get (setup-cookie.test.ts). A name holds the longest
 * standard section name in any language ("Gesundheit & Sicherheit"), and
 * there is room for one section more than Topics has.
 */
export const MAX_SECTION_NAME = 24;
export const MAX_SECTIONS = 8;

/** A copy of a setup's sections as the visitor's own, nothing hidden. */
export function customFrom(sections: readonly ResolvedSection[]): CustomSetup {
  return {
    sections: sections.map((s) => ({ id: s.id, ...(s.name !== undefined ? { name: s.name } : {}), tiles: [...s.tiles] })),
    hidden: [],
  };
}

/**
 * The setup in a city with `available` tiles: tiles it lacks dropped, each
 * placed once, the hidden list kept to tiles that are neither placed nor the
 * support tile, and every other tile of the city (a source added since) at
 * the end of the last section, so no tile is silently lost.
 */
export function fitToCity(setup: CustomSetup, available: readonly TileId[]): CustomSetup {
  const placed = new Set<TileId>();
  const keep = (tile: TileId) => {
    if (!available.includes(tile) || placed.has(tile)) return false;
    placed.add(tile);
    return true;
  };
  const sections = setup.sections.map((s) => ({ ...s, tiles: s.tiles.filter(keep) }));
  const hidden = [...new Set(setup.hidden)].filter((t) => t !== SUPPORT_TILE && available.includes(t) && !placed.has(t));
  const unplaced = available.filter((t) => !placed.has(t) && !hidden.includes(t));
  if (unplaced.length > 0) {
    if (sections.length === 0) sections.push({ id: nextSectionId([]), tiles: [] });
    const last = sections[sections.length - 1];
    sections[sections.length - 1] = { ...last, tiles: [...last.tiles, ...unplaced] };
  }
  return { sections, hidden };
}

function nextSectionId(sections: readonly CustomSection[]): string {
  const taken = sections.map((s) => /^c(\d+)$/.exec(s.id)).map((m) => (m ? Number(m[1]) : 0));
  return `c${Math.max(0, ...taken) + 1}`;
}

function withSections(setup: CustomSetup, sections: CustomSection[], hidden = setup.hidden): CustomSetup {
  return { sections, hidden };
}

export function renameSection(setup: CustomSetup, id: string, name: string): CustomSetup {
  return withSections(setup, setup.sections.map((s) => (s.id === id ? { ...s, name: name.slice(0, MAX_SECTION_NAME) } : s)));
}

/** Swaps a section with its neighbour above (-1) or below (1). */
export function moveSection(setup: CustomSetup, id: string, delta: -1 | 1): CustomSetup {
  const from = setup.sections.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= setup.sections.length) return setup;
  const sections = [...setup.sections];
  [sections[from], sections[to]] = [sections[to], sections[from]];
  return withSections(setup, sections);
}

/** The last section stays: the support tile always needs one. */
export function canDeleteSection(setup: CustomSetup): boolean {
  return setup.sections.length > 1;
}

/**
 * Deletes a section: its tiles go to the hidden tray, except the support
 * tile, which joins the end of the section before (the one after, for the
 * first section).
 */
export function deleteSection(setup: CustomSetup, id: string): CustomSetup {
  const index = setup.sections.findIndex((s) => s.id === id);
  if (index < 0 || !canDeleteSection(setup)) return setup;
  const gone = setup.sections[index];
  const keepsSupport = gone.tiles.includes(SUPPORT_TILE);
  const heir = setup.sections[index > 0 ? index - 1 : 1].id;
  const sections = setup.sections
    .filter((s) => s.id !== id)
    .map((s) => (keepsSupport && s.id === heir ? { ...s, tiles: [...s.tiles, SUPPORT_TILE] } : s));
  return withSections(setup, sections, [...setup.hidden, ...gone.tiles.filter((t) => t !== SUPPORT_TILE)]);
}

/** Adds an empty section at the end, up to MAX_SECTIONS. */
export function addSection(setup: CustomSetup, name: string): CustomSetup {
  if (setup.sections.length >= MAX_SECTIONS) return setup;
  const section: CustomSection = { id: nextSectionId(setup.sections), name: name.slice(0, MAX_SECTION_NAME), tiles: [] };
  return withSections(setup, [...setup.sections, section]);
}

/**
 * Moves a tile up (-1) or down (1) within its section, past the next tile
 * that is on screen: `visible` leaves out one that renders nothing (the lift
 * tile while there is no data), so every press moves the tile on screen.
 */
export function moveTile(setup: CustomSetup, tile: TileId, delta: -1 | 1, visible: (tile: TileId) => boolean = () => true): CustomSetup {
  return withSections(setup, setup.sections.map((s) => {
    const from = s.tiles.indexOf(tile);
    if (from < 0) return s;
    let to = from + delta;
    while (to >= 0 && to < s.tiles.length && !visible(s.tiles[to])) to += delta;
    if (to < 0 || to >= s.tiles.length) return s;
    const rest = s.tiles.filter((t) => t !== tile);
    const at = rest.indexOf(s.tiles[to]) + (delta > 0 ? 1 : 0);
    return { ...s, tiles: [...rest.slice(0, at), tile, ...rest.slice(at)] };
  }));
}

/** Puts a tile at the end of a section: from another section ("move to section") or from the hidden tray. */
export function placeTile(setup: CustomSetup, tile: TileId, sectionId: string): CustomSetup {
  if (!setup.sections.some((s) => s.id === sectionId)) return setup;
  const sections = setup.sections.map((s) => {
    const tiles = s.tiles.filter((t) => t !== tile);
    return { ...s, tiles: s.id === sectionId ? [...tiles, tile] : tiles };
  });
  return withSections(setup, sections, setup.hidden.filter((t) => t !== tile));
}

/** Moves a tile to the hidden tray; the support tile stays. */
export function removeTile(setup: CustomSetup, tile: TileId): CustomSetup {
  if (tile === SUPPORT_TILE || !setup.sections.some((s) => s.tiles.includes(tile))) return setup;
  const sections = setup.sections.map((s) => ({ ...s, tiles: s.tiles.filter((t) => t !== tile) }));
  return withSections(setup, sections, [...setup.hidden, tile]);
}
