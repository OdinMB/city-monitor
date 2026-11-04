import type { CitizenReportStatus, CrimeIndicator } from '@city-monitor/shared';
import { CATEGORY_LAYERS, GROUP_CATEGORIES } from '../hooks/useCommandCenter.js';
import type {
  AccidentFilter, DataLayer, EmergencySubLayer, HeatReliefSubLayer, MapCategory, MapState, NewsSubLayer, NoiseWmsLayer,
  NoiseLayer, PoliticalLayer, PopulationLayer, SocialLayer, TrafficSubLayer, WaterSubLayer,
} from '../hooks/useCommandCenter.js';

/**
 * The map state in compact form, for the setup cookie and the `map` parameter
 * of a shared link: one short key per field, ids rather than labels. Reading
 * one back drops what it does not know (an old cookie, a hand-made link), so
 * the city's default takes the field's place; nothing throws.
 */

/** Every value of a union, made exhaustive by the record's type. */
const valuesOf = <T extends string>(record: Record<T, true>) => Object.keys(record) as T[];

const DATA_LAYERS: readonly DataLayer[] = Object.values(CATEGORY_LAYERS).flat();
const GROUPS: readonly MapCategory[] = [...GROUP_CATEGORIES];
const POLITICAL = valuesOf<PoliticalLayer>({ bezirke: true, bundestag: true, landesparlament: true, elections: true });
const SOCIAL = valuesOf<SocialLayer>({ unemployment: true, 'single-parent': true, welfare: true, 'child-poverty': true, rent: true });
const POPULATION = valuesOf<PopulationLayer>({ 'pop-density': true, 'pop-elderly': true, 'pop-foreign': true });
const NOISE = valuesOf<NoiseLayer>({ total: true, road: true, rail: true, air: true });
const NEWS = valuesOf<NewsSubLayer>({ news: true, police: true });
const EMERGENCY = valuesOf<EmergencySubLayer>({ pharmacies: true, aeds: true, hospitals: true });
const WATER = valuesOf<WaterSubLayer>({ levels: true, bathing: true, temperature: true });
const TRAFFIC = valuesOf<TrafficSubLayer>({
  'public-transport': true, incidents: true, congestion: true, roadworks: true, 'car-counts': true, 'bike-counts': true, telraam: true,
});
const HEAT_RELIEF = valuesOf<HeatReliefSubLayer>({ cool: true, fountains: true, toilets: true });
const ACCIDENTS = valuesOf<AccidentFilter>({ all: true, bike: true, pedestrian: true });
const CRIME = valuesOf<CrimeIndicator>({ total: true, assault: true, robbery: true, burglary: true, bikeTheft: true, kiez: true });
const REPORTS = valuesOf<CitizenReportStatus>({ open: true, in_progress: true, closed: true });

interface Field<V> {
  key: string;
  read: (raw: unknown) => V | undefined;
  write: (value: V) => unknown;
}

function oneOf<T>(key: string, allowed: readonly T[]): Field<T> {
  return { key, read: (raw) => (allowed.includes(raw as T) ? (raw as T) : undefined), write: (value) => value };
}

/** A set of values; `allowEmpty` where none is a choice (no layers), not where one always stays on (a sub-layer). */
function setOf<T>(key: string, allowed: readonly T[], allowEmpty = false): Field<Set<T>> {
  return {
    key,
    read: (raw) => {
      if (!Array.isArray(raw)) return undefined;
      const kept = new Set(raw.filter((value: unknown): value is T => allowed.includes(value as T)));
      return kept.size > 0 || allowEmpty ? kept : undefined;
    },
    write: (value) => [...value],
  };
}

const flag = (key: string): Field<boolean> => ({
  key,
  read: (raw) => (raw === 1 ? true : raw === 0 ? false : undefined),
  write: (value) => (value ? 1 : 0),
});

const noiseLayer: Field<NoiseWmsLayer> = {
  key: 'n',
  read: (raw) => (raw === null ? null : oneOf('n', NOISE).read(raw)),
  write: (value) => value,
};

const FIELDS: { [K in keyof MapState]: Field<MapState[K]> } = {
  singleView: flag('s'),
  activeLayers: setOf('a', DATA_LAYERS, true),
  openEmpty: setOf('o', GROUPS, true),
  politicalLayer: oneOf('p', POLITICAL),
  socialLayer: oneOf('sl', SOCIAL),
  populationLayer: oneOf('po', POPULATION),
  noiseLayer,
  noiseLiveData: flag('nl'),
  newsSubLayers: setOf('ns', NEWS),
  emergencySubLayers: setOf('es', EMERGENCY),
  waterSubLayers: setOf('ws', WATER),
  trafficSubLayers: setOf('ts', TRAFFIC),
  accidentFilter: oneOf('af', ACCIDENTS),
  crimeLayer: oneOf('cr', CRIME),
  heatReliefSubLayers: setOf('hs', HEAT_RELIEF),
  reportStatuses: setOf('rs', REPORTS),
};

const FIELD_NAMES = Object.keys(FIELDS) as (keyof MapState)[];

/** Only the map fields of `state`, as the store holds more. */
export function pickMapState(state: MapState): MapState {
  const picked: Partial<MapState> = {};
  for (const name of FIELD_NAMES) copyField(picked, state, name);
  return picked as MapState;
}

function copyField<K extends keyof MapState>(into: Partial<MapState>, from: MapState, name: K) {
  into[name] = from[name];
}

function writeField<K extends keyof MapState>(name: K, value: MapState[K]): unknown {
  return FIELDS[name].write(value);
}

function readField<K extends keyof MapState>(into: Partial<MapState>, name: K, raw: Record<string, unknown>) {
  const value = FIELDS[name].read(raw[FIELDS[name].key]);
  if (value !== undefined) into[name] = value;
}

const sameValue = (a: unknown, b: unknown) =>
  a instanceof Set && b instanceof Set ? a.size === b.size && [...a].every((v) => b.has(v)) : a === b;

/** Whether two map states show the same, sets compared by their members. */
export function sameMapState(a: MapState, b: MapState): boolean {
  return FIELD_NAMES.every((name) => sameValue(a[name], b[name]));
}

/** The fields given, each under its short key. */
export function compactMapState(state: Partial<MapState>): Record<string, unknown> {
  const compact: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    const value = state[name];
    if (value !== undefined) compact[FIELDS[name].key] = writeField(name, value);
  }
  return compact;
}

/** The fields of a compact map state that are known and valid, or null when it is not one. */
export function parseMapState(raw: unknown): Partial<MapState> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const state: Partial<MapState> = {};
  for (const name of FIELD_NAMES) readField(state, name, raw as Record<string, unknown>);
  return state;
}
