import type { CitizenReportStatus, CrimeIndicator } from '@city-monitor/shared';
import type {
  AccidentFilter, DataLayer, EmergencySubLayer, HeatReliefSubLayer, MapCategory, MapState, NewsSubLayer, NoiseWmsLayer,
  NoiseLayer, PoliticalLayer, PopulationLayer, SocialLayer, TrafficSubLayer, WaterSubLayer,
} from '../hooks/useCommandCenter.js';

/**
 * The map state in compact form, for the setup cookie and the `map` parameter
 * of a shared link: one short key per field and one character per value, a
 * set as a string of them. Reading one back drops what it does not know (a
 * hand-made link), so the base map takes the field's place; nothing throws.
 * The setups keep their maps as a difference from a base (diffMapState).
 */

/**
 * One character per value of each field, exhaustive by its type. A saved map
 * reads its values by these, so never change or reuse a code; a new value
 * takes a free one.
 */
type Codes<T extends string> = Record<T, string>;

const DATA_LAYERS: Codes<DataLayer> = {
  weather: 'm', news: 'n', warnings: 'w', 'air-quality': 'q', noise: 'o', emergencies: 'x', traffic: 't', 'bike-sharing': 'b',
  parking: 'p', 'ev-charging': 'e', 'heat-relief': 'r', accidents: 'a', lifts: 'l', crime: 'c', water: 'h', social: 's',
  population: 'i', political: 'v', reports: 'k', trees: 'g',
};
/** The group categories (GROUP_CATEGORIES), the only ones left on without layers. */
const GROUPS: Codes<Extract<MapCategory, 'traffic' | 'environment' | 'social'>> = { traffic: 't', environment: 'e', social: 's' };
const POLITICAL: Codes<PoliticalLayer> = { bezirke: 'b', bundestag: 't', landesparlament: 'l', elections: 'e' };
const SOCIAL: Codes<SocialLayer> = { unemployment: 'u', 'single-parent': 's', welfare: 'w', 'child-poverty': 'c', rent: 'r' };
const POPULATION: Codes<PopulationLayer> = { 'pop-density': 'd', 'pop-elderly': 'e', 'pop-foreign': 'f' };
const NOISE: Codes<NoiseLayer> = { total: 't', road: 'r', rail: 'l', air: 'a' };
const NEWS: Codes<NewsSubLayer> = { news: 'n', police: 'p' };
const EMERGENCY: Codes<EmergencySubLayer> = { pharmacies: 'p', aeds: 'a', hospitals: 'h' };
const WATER: Codes<WaterSubLayer> = { levels: 'l', bathing: 'b', temperature: 't' };
const TRAFFIC: Codes<TrafficSubLayer> = {
  'public-transport': 'p', incidents: 'i', congestion: 'c', roadworks: 'r', 'car-counts': 'a', 'bike-counts': 'b', telraam: 't',
};
const HEAT_RELIEF: Codes<HeatReliefSubLayer> = { cool: 'c', fountains: 'f', toilets: 't' };
const ACCIDENTS: Codes<AccidentFilter> = { all: 'a', bike: 'b', pedestrian: 'p' };
const CRIME: Codes<CrimeIndicator> = { total: 't', assault: 'a', robbery: 'r', burglary: 'b', bikeTheft: 'k', kiez: 'z' };
const REPORTS: Codes<CitizenReportStatus> = { open: 'o', in_progress: 'p', closed: 'c' };

/** The code tables by field, for the test that keeps them unique. */
export const MAP_VALUE_CODES = {
  activeLayers: DATA_LAYERS, openEmpty: GROUPS, politicalLayer: POLITICAL, socialLayer: SOCIAL, populationLayer: POPULATION,
  noiseLayer: NOISE, newsSubLayers: NEWS, emergencySubLayers: EMERGENCY, waterSubLayers: WATER, trafficSubLayers: TRAFFIC,
  accidentFilter: ACCIDENTS, crimeLayer: CRIME, heatReliefSubLayers: HEAT_RELIEF, reportStatuses: REPORTS,
} satisfies Partial<Record<keyof MapState, Record<string, string>>>;

interface Field<V> {
  key: string;
  read: (raw: unknown) => V | undefined;
  write: (value: V) => unknown;
}

const valuesByCode = <T extends string>(codes: Codes<T>) => new Map(Object.entries(codes).map(([value, code]) => [code as string, value as T]));

function oneOf<T extends string>(key: string, codes: Codes<T>): Field<T> {
  const valueOf = valuesByCode(codes);
  return { key, read: (raw) => (typeof raw === 'string' ? valueOf.get(raw) : undefined), write: (value) => codes[value] };
}

/** A set of values; `allowEmpty` where none is a choice (no layers), not where one always stays on (a sub-layer). */
function setOf<T extends string>(key: string, codes: Codes<T>, allowEmpty = false): Field<Set<T>> {
  const valueOf = valuesByCode(codes);
  return {
    key,
    read: (raw) => {
      if (typeof raw !== 'string') return undefined;
      const kept = new Set([...raw].flatMap((code) => valueOf.get(code) ?? []));
      return kept.size > 0 || allowEmpty ? kept : undefined;
    },
    write: (value) => [...value].map((v) => codes[v]).join(''),
  };
}

const flag = (key: string): Field<boolean> => ({
  key,
  read: (raw) => (raw === 1 ? true : raw === 0 ? false : undefined),
  write: (value) => (value ? 1 : 0),
});

const noiseMap = oneOf('n', NOISE);
const noiseLayer: Field<NoiseWmsLayer> = {
  key: 'n',
  read: (raw) => (raw === null ? null : noiseMap.read(raw)),
  write: (value) => (value === null ? null : noiseMap.write(value)),
};

const FIELDS: { [K in keyof MapState]: Field<MapState[K]> } = {
  singleView: flag('s'),
  activeLayers: setOf('a', DATA_LAYERS, true),
  openEmpty: setOf<MapCategory>('o', GROUPS as Codes<MapCategory>, true),
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

function copyField<K extends keyof MapState>(into: Partial<MapState>, from: Partial<MapState>, name: K) {
  const value = from[name];
  if (value !== undefined) into[name] = (value instanceof Set ? new Set(value) : value) as MapState[K];
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

/** Whether two map states show the same, sets compared by their members; in partial ones a field given in one only differs. */
export function sameMapState(a: Partial<MapState>, b: Partial<MapState>): boolean {
  return FIELD_NAMES.every((name) => sameValue(a[name], b[name]));
}

/** The fields of `map` that differ from `base`: laid over `base`, they give `map` back. */
export function diffMapState(map: MapState, base: MapState): Partial<MapState> {
  const diff: Partial<MapState> = {};
  for (const name of FIELD_NAMES) if (!sameValue(map[name], base[name])) copyField(diff, map, name);
  return diff;
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
