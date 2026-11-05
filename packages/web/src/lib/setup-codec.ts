import { isPreset, isStandardSectionKey, type PresetId, type StandardSectionKey, type TileId } from './tile-setups.js';
import { MAX_SECTIONS, MAX_SECTION_NAME, type CustomSection, type CustomSetup } from './custom-setup.js';
import {
  MAX_CUSTOM_SETUPS, MAX_SETUP_NAME, chooseSetup, defaultView, type MapChange, type NamedSetup, type SetupId, type SetupView,
} from './setup-state.js';
import { compactMapState, parseMapState } from './map-state.js';

/**
 * The compact form of setups for the setup cookie and shared links: short
 * keys, a tile a character, a section as `[id, tiles, name?]`, the visitor's
 * names as typed, map changes as map-state.ts writes them. Reading one back
 * keeps what is valid and drops the rest; nothing throws.
 */

/**
 * One character per tile. A stored setup reads its tiles by these, so never
 * change or reuse a code; a new tile takes a free one.
 */
export const TILE_CODES: Record<TileId, string> = {
  briefing: 'b', news: 'n', weather: 'w', airQuality: 'a', transit: 't', liftOutages: 'l', pollen: 'p', floodStatus: 'f',
  events: 'e', appointments: 'o', bathing: 'k', crisis: 'c', wastewater: 'v', electricity: 'y', waterLevels: 'g',
  councilMeetings: 'm', political: 'r', laborMarket: 'j', population: 'i', budget: 'd', feuerwehr: 'h', soilMoisture: 'q',
};

/**
 * Codes of tiles that are gone (support, now a strip every setup shows):
 * never to be given again. A stored setup that still has one loads without it.
 */
export const RETIRED_TILE_CODES: readonly string[] = ['s'];

const TILE_OF = new Map(Object.entries(TILE_CODES).map(([tile, code]) => [code, tile as TileId]));

const tileString = (tiles: readonly TileId[]) => tiles.map((tile) => TILE_CODES[tile]).join('');
const tilesOf = (raw: unknown): TileId[] => (typeof raw === 'string' ? [...raw].flatMap((code) => TILE_OF.get(code) ?? []) : []);

/**
 * One letter per preset section, likewise fixed; the visitor's added sections
 * keep their `c<n>` ids. Capitals first, then lower case once they ran out.
 */
export const SECTION_CODES: Record<StandardSectionKey, string> = {
  news: 'N', environment: 'E', disturbances: 'D', crises: 'C', background: 'B',
  gettingAround: 'G', conditions: 'K', today: 'Y', thingsToDo: 'A', water: 'Q', airAllergies: 'P', infections: 'I', help: 'F',
  warnings: 'U', services: 'V', politics: 'O', people: 'M', cityFigures: 'Z', whatsOn: 'J', inBrief: 'X', figures: 'L',
  heat: 'h', coolingOff: 'k', drought: 'd',
};

/** Codes of sections that are gone (Topics' weather, traffic, health, city hall, social): never to be given again. */
export const RETIRED_SECTION_CODES: readonly string[] = ['W', 'T', 'H', 'R', 'S'];

const SECTION_OF = new Map<string, string>(Object.entries(SECTION_CODES).map(([key, code]) => [code, key]));
const SECTION_ID = /^[A-Za-z][A-Za-z0-9]{0,15}$/;

const sectionCode = (id: string) => (isStandardSectionKey(id) ? SECTION_CODES[id] : id);

function sectionIdOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const id = SECTION_OF.get(raw) ?? raw;
  return SECTION_ID.test(id) ? id : undefined;
}
const CUSTOM_ID = /^m[1-9]$/;

/** One lower-case letter per preset, likewise fixed (Everyday keeps Functional's). */
export const PRESET_CODES: Record<PresetId, string> = {
  everyday: 'f', commute: 'c', dayOut: 'd', health: 'h', storm: 's', cityHall: 'r', movingHere: 'k', visitors: 'v', newsroom: 'j',
  cycling: 'b', heatwave: 'w',
};

/** Codes of setups that are gone (Topics): never to be given again. */
export const RETIRED_PRESET_CODES: readonly string[] = ['t'];

const PRESET_OF = new Map(Object.entries(PRESET_CODES).map(([id, code]) => [code, id as PresetId]));

const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const idCode = (id: SetupId): string => (isPreset(id) ? PRESET_CODES[id] : id);

function idOf(code: unknown): SetupId | undefined {
  if (typeof code !== 'string') return undefined;
  return PRESET_OF.get(code) ?? (CUSTOM_ID.test(code) ? (code as SetupId) : undefined);
}

/** A map change as kept: known fields, at least one. */
function mapChangeOf(raw: unknown): MapChange | undefined {
  const map = parseMapState(raw);
  return map && Object.keys(map).length > 0 ? map : undefined;
}

const isTime = (raw: unknown): raw is number => typeof raw === 'number' && Number.isFinite(raw) && raw >= 0;

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
  const hidden = tilesOf(raw.h).filter((tile) => !placed.has(tile));
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

/**
 * A setup view: `s` the setup shown, `c` the visitor's setups (`i` id, `m`
 * map change), `x` the collapsed sections by setup, `p` the presets' map
 * changes (`m` change, `u` when made).
 */
export function compactView(view: SetupView): Record<string, unknown> {
  const collapsed = Object.fromEntries(
    Object.entries(view.collapsed).flatMap(([id, ids]) => (ids && ids.length > 0 ? [[idCode(id as SetupId), ids.map(sectionCode)]] : [])),
  );
  const presetMaps = Object.fromEntries(
    Object.entries(view.presetMaps).flatMap(([id, change]) => (change ? [[PRESET_CODES[id as PresetId], { m: compactMapState(change.map), u: change.touched }]] : [])),
  );
  const setups = view.customSetups.map((s) => ({ i: s.id, ...compactNamed(s), ...(s.map ? { m: compactMapState(s.map) } : {}) }));
  return {
    s: idCode(view.choice),
    ...(setups.length > 0 ? { c: setups } : {}),
    ...(Object.keys(collapsed).length > 0 ? { x: collapsed } : {}),
    ...(Object.keys(presetMaps).length > 0 ? { p: presetMaps } : {}),
  };
}

function parseSetups(raw: unknown): NamedSetup[] {
  const setups: NamedSetup[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (setups.length >= MAX_CUSTOM_SETUPS) break;
    const id = isRecord(entry) ? idOf(entry.i) : undefined;
    if (!id || isPreset(id) || setups.some((s) => s.id === id)) continue;
    const setup = parseNamed(entry);
    const map = mapChangeOf((entry as Record<string, unknown>).m);
    if (setup) setups.push({ id, ...setup, ...(map ? { map } : {}) });
  }
  return setups;
}

function parseCollapsed(raw: unknown, setups: readonly NamedSetup[]): SetupView['collapsed'] {
  const collapsed: SetupView['collapsed'] = {};
  if (!isRecord(raw)) return collapsed;
  for (const [code, ids] of Object.entries(raw)) {
    const id = idOf(code);
    if (!id || (!isPreset(id) && !setups.some((s) => s.id === id)) || !Array.isArray(ids)) continue;
    const kept = [...new Set(ids.map(sectionIdOf).filter((sectionId): sectionId is string => sectionId !== undefined))];
    if (kept.length > 0) collapsed[id] = kept.slice(0, MAX_SECTIONS);
  }
  return collapsed;
}

function parsePresetMaps(raw: unknown): SetupView['presetMaps'] {
  const presetMaps: SetupView['presetMaps'] = {};
  if (!isRecord(raw)) return presetMaps;
  for (const [code, entry] of Object.entries(raw)) {
    const id = PRESET_OF.get(code);
    if (!id || !isRecord(entry) || !isTime(entry.u)) continue;
    const map = mapChangeOf(entry.m);
    if (map) presetMaps[id] = { map, touched: entry.u };
  }
  return presetMaps;
}

/** A compact setup view, with Everyday shown where the choice cannot be. */
export function parseView(raw: unknown): SetupView {
  if (!isRecord(raw)) return defaultView();
  const customSetups = parseSetups(raw.c);
  const view: SetupView = {
    choice: 'everyday',
    customSetups,
    collapsed: parseCollapsed(raw.x, customSetups),
    presetMaps: parsePresetMaps(raw.p),
  };
  const choice = idOf(raw.s);
  return choice ? chooseSetup(view, choice) : view;
}
