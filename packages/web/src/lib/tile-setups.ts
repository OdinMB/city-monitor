import type { CityFeature } from '@city-monitor/shared';

/**
 * The dashboard's tiles and the presets that arrange them into sections:
 * which tiles a city has (from its features) and where each preset puts
 * them. How a tile renders is in components/layout/DashboardTile.tsx; the
 * presets' maps in setup-maps.ts; the visitor's own setups in setup-state.ts
 * and custom-setup.ts.
 */

type Has = (feature: CityFeature) => boolean;

/** The features each tile needs, in the order a city lists its tiles. */
const TILE_GATES = {
  briefing: (has: Has) => has('news'),
  news: (has: Has) => has('news'),
  weather: () => true,
  airQuality: () => true,
  transit: (has: Has) => has('transit'),
  // KVB's lists or DB stations; a city with DB alone hides the tile at run
  // time while the server has no DB key (LiftOutagesTile).
  liftOutages: (has: Has) => has('liftOutages') || has('stationLifts'),
  pollen: (has: Has) => has('pollen'),
  floodStatus: (has: Has) => has('floodStatus'),
  // Hamburg Tourismus' events show only while the API returns some (useEventsTileShown)
  events: (has: Has) => has('events') || has('hhtEvents'),
  appointments: (has: Has) => has('appointments'),
  bathing: (has: Has) => has('bathing'),
  crisis: (has: Has) => has('crisis'),
  wastewater: (has: Has) => has('wastewater'),
  electricity: (has: Has) => has('electricity'),
  waterLevels: (has: Has) => has('waterLevels'),
  support: () => true,
  councilMeetings: (has: Has) => has('councilMeetings'),
  political: (has: Has) => has('political'),
  laborMarket: (has: Has) => has('laborMarket'),
  population: (has: Has) => has('population'),
  budget: (has: Has) => has('budget'),
  feuerwehr: (has: Has) => has('feuerwehr'),
  soilMoisture: (has: Has) => has('soilMoisture'),
} satisfies Record<string, (has: Has) => boolean>;

/** A dashboard tile's stable id, used in setups, the cookie and shared links. */
export type TileId = keyof typeof TILE_GATES;

export const TILE_IDS = Object.keys(TILE_GATES) as TileId[];

/**
 * The grid columns each tile takes (its Tile's `span` in DashboardTile.tsx).
 * A section is as wide as its tiles need, so small sections share a row.
 */
export const TILE_SPANS: Record<TileId, 1 | 2> = {
  briefing: 2, news: 2, events: 2, councilMeetings: 2, budget: 2,
  weather: 1, airQuality: 1, transit: 1, liftOutages: 1, pollen: 1, floodStatus: 1, appointments: 1, bathing: 1,
  crisis: 1, wastewater: 1, electricity: 1, waterLevels: 1, support: 1, political: 1, laborMarket: 1, population: 1,
  feuerwehr: 1, soilMoisture: 1,
};

/** The grid columns a section's tiles fill side by side, at most the grid's four. */
export function sectionWidth(tiles: readonly TileId[]): 1 | 2 | 3 | 4 {
  const columns = tiles.reduce((sum, tile) => sum + TILE_SPANS[tile], 0);
  return Math.min(4, Math.max(1, columns)) as 1 | 2 | 3 | 4;
}

/** The tile that can be moved but never removed from a setup. */
export const SUPPORT_TILE: TileId = 'support';

export function isTileId(value: unknown): value is TileId {
  return typeof value === 'string' && Object.hasOwn(TILE_GATES, value);
}

/** The tiles a city has, in TILE_IDS order. */
export function cityTiles(features: readonly CityFeature[]): TileId[] {
  const has: Has = (feature) => features.includes(feature);
  return TILE_IDS.filter((id) => TILE_GATES[id](has));
}

/**
 * The fixed setups every city offers, each for a situation: which tiles it
 * shows and in which sections (here), and which map layers (setup-maps.ts).
 * The visitor's own setups are in setup-state.ts.
 */
export type PresetId =
  | 'everyday' | 'commute' | 'dayOut' | 'health' | 'storm'
  | 'cityHall' | 'movingHere' | 'visitors' | 'newsroom' | 'cycling' | 'heatwave';

/** The presets as the menu groups them: for every day, then for a special interest. */
export const PRESET_GROUPS: readonly { key: 'daily' | 'special'; presets: readonly PresetId[] }[] = [
  { key: 'daily', presets: ['everyday', 'commute', 'dayOut', 'health', 'storm'] },
  { key: 'special', presets: ['cityHall', 'movingHere', 'visitors', 'newsroom', 'cycling', 'heatwave'] },
];

export const PRESET_IDS: readonly PresetId[] = PRESET_GROUPS.flatMap((g) => g.presets);

export function isPreset(value: string): value is PresetId {
  return (PRESET_IDS as readonly string[]).includes(value);
}

/** The presets' sections; each has its name under `setup.section.<key>`. */
export type StandardSectionKey =
  | 'news' | 'environment' | 'disturbances' | 'crises' | 'background'
  | 'gettingAround' | 'conditions' | 'today' | 'thingsToDo' | 'water' | 'airAllergies' | 'infections' | 'help' | 'warnings'
  | 'services' | 'politics' | 'people' | 'cityFigures' | 'whatsOn' | 'inBrief' | 'figures' | 'heat' | 'coolingOff' | 'drought';

export const STANDARD_SECTION_KEYS: readonly StandardSectionKey[] = [
  'news', 'environment', 'disturbances', 'crises', 'background',
  'gettingAround', 'conditions', 'today', 'thingsToDo', 'water', 'airAllergies', 'infections', 'help', 'warnings',
  'services', 'politics', 'people', 'cityFigures', 'whatsOn', 'inBrief', 'figures', 'heat', 'coolingOff', 'drought',
];

export function isStandardSectionKey(value: string): value is StandardSectionKey {
  return (STANDARD_SECTION_KEYS as readonly string[]).includes(value);
}

interface SectionDef {
  key: StandardSectionKey;
  tiles: readonly TileId[];
}

/**
 * Everyday groups every tile by what it does for the visitor (what hits me
 * now, what is disrupted, what to do in a crisis, background figures) and
 * places each once (tile-setups.test.ts); it is what a city opens with. The
 * others show only the tiles their situation needs, the support tile last;
 * a tile a preset leaves out is not shown in it.
 */
export const PRESET_SECTIONS: Record<PresetId, readonly SectionDef[]> = {
  everyday: [
    { key: 'news', tiles: ['briefing', 'news', 'events'] },
    { key: 'environment', tiles: ['weather', 'airQuality', 'pollen', 'wastewater', 'bathing'] },
    { key: 'disturbances', tiles: ['transit', 'liftOutages', 'appointments'] },
    { key: 'crises', tiles: ['floodStatus', 'crisis', 'support'] },
    {
      key: 'background',
      tiles: ['councilMeetings', 'political', 'laborMarket', 'population', 'budget', 'electricity', 'soilMoisture', 'feuerwehr', 'waterLevels'],
    },
  ],
  commute: [
    { key: 'gettingAround', tiles: ['transit', 'liftOutages'] },
    { key: 'conditions', tiles: ['weather', 'airQuality'] },
    { key: 'news', tiles: ['news', 'support'] },
  ],
  dayOut: [
    { key: 'today', tiles: ['weather', 'airQuality', 'pollen'] },
    { key: 'thingsToDo', tiles: ['events'] },
    { key: 'water', tiles: ['bathing', 'waterLevels', 'support'] },
  ],
  health: [
    { key: 'airAllergies', tiles: ['airQuality', 'pollen', 'weather'] },
    { key: 'infections', tiles: ['wastewater'] },
    { key: 'help', tiles: ['crisis', 'support'] },
  ],
  storm: [
    { key: 'warnings', tiles: ['weather', 'floodStatus', 'waterLevels'] },
    { key: 'help', tiles: ['crisis'] },
    { key: 'news', tiles: ['news', 'support'] },
  ],
  cityHall: [
    { key: 'services', tiles: ['appointments'] },
    { key: 'politics', tiles: ['councilMeetings', 'political', 'budget'] },
    { key: 'news', tiles: ['briefing', 'support'] },
  ],
  movingHere: [
    { key: 'people', tiles: ['population', 'laborMarket'] },
    { key: 'cityFigures', tiles: ['budget', 'electricity', 'soilMoisture', 'feuerwehr', 'support'] },
  ],
  visitors: [
    { key: 'today', tiles: ['weather', 'airQuality'] },
    { key: 'gettingAround', tiles: ['transit', 'liftOutages'] },
    { key: 'whatsOn', tiles: ['events'] },
    { key: 'inBrief', tiles: ['briefing', 'support'] },
  ],
  newsroom: [
    { key: 'news', tiles: ['briefing', 'news'] },
    { key: 'politics', tiles: ['councilMeetings', 'political', 'budget'] },
    { key: 'figures', tiles: ['feuerwehr', 'laborMarket', 'population', 'support'] },
  ],
  cycling: [
    { key: 'conditions', tiles: ['weather', 'airQuality', 'pollen', 'support'] },
  ],
  heatwave: [
    { key: 'heat', tiles: ['weather', 'airQuality'] },
    { key: 'coolingOff', tiles: ['bathing', 'waterLevels'] },
    { key: 'drought', tiles: ['soilMoisture', 'support'] },
  ],
};

/** A tile a city places elsewhere than the preset does: into `section`, before `before` or at its end. */
interface Placement {
  tile: TileId;
  section: StandardSectionKey;
  before?: TileId;
}

const CITY_PLACEMENTS: Partial<Record<string, Partial<Record<PresetId, readonly Placement[]>>>> = {
  // Hamburg's gauges are its storm-surge warning: a crisis tile there, ahead of the numbers to call.
  hamburg: { everyday: [{ tile: 'waterLevels', section: 'crises', before: 'crisis' }] },
};

/** A section as the dashboard shows it. `name` is a visitor's own; without one the section shows its standard name. */
export interface ResolvedSection {
  id: string;
  name?: string;
  tiles: TileId[];
}

function place(sections: SectionDef[], { tile, section, before }: Placement): SectionDef[] {
  return sections.map((s) => {
    const tiles = s.tiles.filter((t) => t !== tile);
    if (s.key !== section) return { ...s, tiles };
    const at = before === undefined ? -1 : tiles.indexOf(before);
    if (at < 0) return { ...s, tiles: [...tiles, tile] };
    return { ...s, tiles: [...tiles.slice(0, at), tile, ...tiles.slice(at)] };
  });
}

/**
 * A preset in a city: its placements applied, the tiles it lacks left out and
 * no section left empty. The support tile, left alone in a section, joins the
 * section before, so no section shows it alone.
 */
export function presetSections(preset: PresetId, cityId: string, available: readonly TileId[]): ResolvedSection[] {
  const placements = CITY_PLACEMENTS[cityId]?.[preset] ?? [];
  const sections = placements.reduce(place, [...PRESET_SECTIONS[preset]])
    .map((s) => ({ id: s.key as string, tiles: s.tiles.filter((t) => available.includes(t)) }))
    .filter((s) => s.tiles.length > 0);
  return sections.flatMap((s, i) => {
    const alone = s.tiles.length === 1 && s.tiles[0] === SUPPORT_TILE;
    if (alone && i > 0) return [];
    const next = sections[i + 1];
    const takesSupport = next && next.tiles.length === 1 && next.tiles[0] === SUPPORT_TILE;
    return [takesSupport ? { ...s, tiles: [...s.tiles, SUPPORT_TILE] } : s];
  });
}
