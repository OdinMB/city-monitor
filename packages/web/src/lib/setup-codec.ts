import { SUPPORT_TILE, isStandardSectionKey, type StandardSectionKey, type TileId } from './tile-setups.js';
import { MAX_SECTIONS, MAX_SECTION_NAME, type CustomSection, type CustomSetup } from './custom-setup.js';
import {
  MAX_CUSTOM_SETUPS, MAX_SETUP_NAME, chooseSetup, defaultView, isStandardSetup, type NamedSetup, type SetupId, type SetupView,
} from './setup-state.js';

/**
 * The compact form of setups for the setup cookie and shared links: short
 * keys, a tile a character, a section as `[id, tiles, name?]`, the visitor's
 * names as typed. Reading one back keeps what is valid and drops the rest;
 * nothing throws.
 */

/**
 * One character per tile. A stored setup reads its tiles by these, so never
 * change or reuse a code; a new tile takes a free one.
 */
export const TILE_CODES: Record<TileId, string> = {
  briefing: 'b', news: 'n', weather: 'w', airQuality: 'a', transit: 't', liftOutages: 'l', pollen: 'p', floodStatus: 'f',
  events: 'e', appointments: 'o', bathing: 'k', crisis: 'c', wastewater: 'v', electricity: 'y', waterLevels: 'g', support: 's',
  councilMeetings: 'm', political: 'r', laborMarket: 'j', population: 'i', budget: 'd', feuerwehr: 'h', soilMoisture: 'q',
};

const TILE_OF = new Map(Object.entries(TILE_CODES).map(([tile, code]) => [code, tile as TileId]));

const tileString = (tiles: readonly TileId[]) => tiles.map((tile) => TILE_CODES[tile]).join('');
const tilesOf = (raw: unknown): TileId[] => (typeof raw === 'string' ? [...raw].flatMap((code) => TILE_OF.get(code) ?? []) : []);

/** One capital letter per standard section, likewise fixed; the visitor's added sections keep their `c<n>` ids. */
export const SECTION_CODES: Record<StandardSectionKey, string> = {
  news: 'N', environment: 'E', disturbances: 'D', crises: 'C', background: 'B', weather: 'W', traffic: 'T', health: 'H', cityHall: 'R', social: 'S',
};

const SECTION_OF = new Map<string, string>(Object.entries(SECTION_CODES).map(([key, code]) => [code, key]));
const SECTION_ID = /^[A-Za-z][A-Za-z0-9]{0,15}$/;

const sectionCode = (id: string) => (isStandardSectionKey(id) ? SECTION_CODES[id] : id);

function sectionIdOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const id = SECTION_OF.get(raw) ?? raw;
  return SECTION_ID.test(id) ? id : undefined;
}
const CUSTOM_ID = /^m[1-9]$/;
const STANDARD_CODES = { functional: 'f', topics: 't' } as const;

const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const idCode = (id: SetupId): string => (isStandardSetup(id) ? STANDARD_CODES[id] : id);

function idOf(code: unknown): SetupId | undefined {
  if (code === STANDARD_CODES.functional) return 'functional';
  if (code === STANDARD_CODES.topics) return 'topics';
  return typeof code === 'string' && CUSTOM_ID.test(code) ? (code as SetupId) : undefined;
}

export function compactCustom(setup: CustomSetup): Record<string, unknown> {
  return {
    s: setup.sections.map((s) => [sectionCode(s.id), tileString(s.tiles), ...(s.name !== undefined ? [s.name] : [])]),
    ...(setup.hidden.length > 0 ? { h: tileString(setup.hidden) } : {}),
  };
}

/** A compact custom setup: each tile once, valid section ids once each, at least one section; otherwise null. */
export function parseCustom(raw: unknown): CustomSetup | null {
  if (!isRecord(raw) || !Array.isArray(raw.s)) return null;
  const placed = new Set<TileId>();
  const sections: CustomSection[] = [];
  for (const entry of raw.s) {
    if (sections.length >= MAX_SECTIONS) break;
    if (!Array.isArray(entry)) continue;
    const [code, codes, name] = entry as unknown[];
    const id = sectionIdOf(code);
    if (!id || sections.some((s) => s.id === id)) continue;
    const tiles: TileId[] = [];
    for (const tile of tilesOf(codes)) {
      if (placed.has(tile)) continue;
      placed.add(tile);
      tiles.push(tile);
    }
    sections.push({ id, ...(typeof name === 'string' ? { name: name.slice(0, MAX_SECTION_NAME) } : {}), tiles });
  }
  if (sections.length === 0) return null;
  const hidden = tilesOf(raw.h).filter((tile) => tile !== SUPPORT_TILE && !placed.has(tile));
  return { sections, hidden: [...new Set(hidden)] };
}

/** A visitor's setup with its name, as a shared link carries it. */
export function compactNamed(setup: Omit<NamedSetup, 'id'>): Record<string, unknown> {
  return { n: setup.name, ...compactCustom(setup) };
}

export function parseNamed(raw: unknown): Omit<NamedSetup, 'id'> | null {
  const custom = parseCustom(raw);
  if (!custom || !isRecord(raw)) return null;
  return { name: typeof raw.n === 'string' ? raw.n.slice(0, MAX_SETUP_NAME) : '', ...custom };
}

export function compactView(view: SetupView): Record<string, unknown> {
  const collapsed = Object.fromEntries(
    Object.entries(view.collapsed).flatMap(([id, ids]) => (ids && ids.length > 0 ? [[idCode(id as SetupId), ids.map(sectionCode)]] : [])),
  );
  return {
    s: idCode(view.choice),
    ...(view.customSetups.length > 0 ? { c: view.customSetups.map((s) => ({ i: s.id, ...compactNamed(s) })) } : {}),
    ...(Object.keys(collapsed).length > 0 ? { x: collapsed } : {}),
  };
}

function parseSetups(raw: unknown): NamedSetup[] {
  const setups: NamedSetup[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (setups.length >= MAX_CUSTOM_SETUPS) break;
    const id = isRecord(entry) ? idOf(entry.i) : undefined;
    if (!id || isStandardSetup(id) || setups.some((s) => s.id === id)) continue;
    const setup = parseNamed(entry);
    if (setup) setups.push({ id, ...setup });
  }
  return setups;
}

function parseCollapsed(raw: unknown, setups: readonly NamedSetup[]): SetupView['collapsed'] {
  const collapsed: SetupView['collapsed'] = {};
  if (!isRecord(raw)) return collapsed;
  for (const [code, ids] of Object.entries(raw)) {
    const id = idOf(code);
    if (!id || (!isStandardSetup(id) && !setups.some((s) => s.id === id)) || !Array.isArray(ids)) continue;
    const kept = [...new Set(ids.map(sectionIdOf).filter((sectionId): sectionId is string => sectionId !== undefined))];
    if (kept.length > 0) collapsed[id] = kept.slice(0, MAX_SECTIONS);
  }
  return collapsed;
}

/** A compact setup view, with Functional shown where the choice cannot be. */
export function parseView(raw: unknown): SetupView {
  if (!isRecord(raw)) return defaultView();
  const customSetups = parseSetups(raw.c);
  const view: SetupView = { choice: 'functional', customSetups, collapsed: parseCollapsed(raw.x, customSetups) };
  const choice = idOf(raw.s);
  return choice ? chooseSetup(view, choice) : view;
}
