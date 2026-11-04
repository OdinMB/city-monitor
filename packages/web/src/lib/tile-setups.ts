import type { CityFeature } from '@city-monitor/shared';

/**
 * The dashboard's tiles and the two standard setups that arrange them into
 * sections: which tiles a city has (from its features) and where Functional
 * and Topics put each of them. How a tile renders is in
 * components/layout/DashboardTile.tsx; the visitor's own setups in
 * setup-state.ts and custom-setup.ts.
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
  events: (has: Has) => has('events'),
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

/** The two setups every city has; the visitor's own are in setup-state.ts. */
export type StandardSetup = 'functional' | 'topics';

/** The standard sections; each has its name under `setup.section.<key>`. */
export type StandardSectionKey =
  | 'news' | 'environment' | 'disturbances' | 'crises' | 'background'
  | 'weather' | 'traffic' | 'health' | 'cityHall' | 'social';

export const STANDARD_SECTION_KEYS: readonly StandardSectionKey[] = [
  'news', 'environment', 'disturbances', 'crises', 'background', 'weather', 'traffic', 'health', 'cityHall', 'social',
];

export function isStandardSectionKey(value: string): value is StandardSectionKey {
  return (STANDARD_SECTION_KEYS as readonly string[]).includes(value);
}

interface SectionDef {
  key: StandardSectionKey;
  tiles: readonly TileId[];
}

/**
 * Functional groups by what a tile does for the visitor (what hits me now,
 * what is disrupted, what to do in a crisis, background figures); Topics by
 * subject. Each places every tile once (tile-setups.test.ts).
 */
export const STANDARD_SETUPS: Record<StandardSetup, readonly SectionDef[]> = {
  functional: [
    { key: 'news', tiles: ['briefing', 'news', 'events'] },
    { key: 'environment', tiles: ['weather', 'airQuality', 'pollen', 'wastewater', 'bathing'] },
    { key: 'disturbances', tiles: ['transit', 'liftOutages', 'appointments'] },
    { key: 'crises', tiles: ['floodStatus', 'crisis', 'support'] },
    {
      key: 'background',
      tiles: ['councilMeetings', 'political', 'laborMarket', 'population', 'budget', 'electricity', 'soilMoisture', 'feuerwehr', 'waterLevels'],
    },
  ],
  topics: [
    { key: 'news', tiles: ['briefing', 'news', 'events'] },
    { key: 'weather', tiles: ['weather', 'pollen'] },
    { key: 'environment', tiles: ['airQuality', 'waterLevels', 'floodStatus', 'bathing', 'electricity', 'soilMoisture'] },
    { key: 'traffic', tiles: ['transit', 'liftOutages'] },
    { key: 'health', tiles: ['crisis', 'wastewater', 'feuerwehr', 'support'] },
    { key: 'cityHall', tiles: ['appointments', 'councilMeetings', 'political', 'budget'] },
    { key: 'social', tiles: ['laborMarket', 'population'] },
  ],
};

/** A tile a city places elsewhere than the standard setup does: into `section`, before `before` or at its end. */
interface Placement {
  tile: TileId;
  section: StandardSectionKey;
  before?: TileId;
}

const CITY_PLACEMENTS: Partial<Record<string, Partial<Record<StandardSetup, readonly Placement[]>>>> = {
  // Hamburg's gauges are its storm-surge warning: a crisis tile there, ahead of the numbers to call.
  hamburg: { functional: [{ tile: 'waterLevels', section: 'crises', before: 'crisis' }] },
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

/** A standard setup in a city: its placements applied, the tiles it lacks left out, and no section left empty. */
export function standardSections(setup: StandardSetup, cityId: string, available: readonly TileId[]): ResolvedSection[] {
  const placements = CITY_PLACEMENTS[cityId]?.[setup] ?? [];
  const sections = placements.reduce(place, [...STANDARD_SETUPS[setup]]);
  return sections
    .map((s) => ({ id: s.key, tiles: s.tiles.filter((t) => available.includes(t)) }))
    .filter((s) => s.tiles.length > 0);
}
