/**
 * Air quality index bands: the colour and name of a value.
 *
 * Two scales are on screen:
 * - European AQI (EEA bands at 20/40/60/80/100): Open-Meteo's city-wide index
 *   (header chip, tile headline) and the Sensor.Community points on the map,
 *   which the server converts from PM readings.
 * - US EPA AQI (bands at 50/100/150/200/300): the WAQI stations (aqicn.org).
 *   WAQI reports this scale and the server stores it unconverted in the grid's
 *   `europeanAqi` field, so a grid point's scale comes from `gridPointScale`.
 *
 * The official UBA stations carry a third one, UBA's five-class index
 * (`getUbaLevel` below).
 */

import type { AirQualityStation } from '@city-monitor/shared';

export type AqiScale = 'eu' | 'us';

export interface AqiLevel {
  /** Band id, unique within its scale. */
  label: string;
  /** i18n key of the band's name. */
  labelKey: string;
  color: string;
  /** Text colour that stays legible on `color` (map badges). */
  textColor: string;
}

export interface EuropeanAqiLevel extends AqiLevel {
  /** Tailwind classes for a tinted background. */
  bg: string;
}

const WHITE = '#ffffff';
const DARK = '#1f2937';

const EU_LEVELS: Array<{ max: number } & EuropeanAqiLevel> = [
  { max: 20, label: 'good', color: '#50C878', bg: 'bg-green-100 dark:bg-green-900/30' },
  { max: 40, label: 'fair', color: '#FFD700', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  { max: 60, label: 'moderate', color: '#FF8C00', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  { max: 80, label: 'poor', color: '#FF4444', bg: 'bg-red-100 dark:bg-red-900/30' },
  { max: 100, label: 'veryPoor', color: '#8B008B', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  { max: Infinity, label: 'extremelyPoor', color: '#800000', bg: 'bg-red-200 dark:bg-red-900/50' },
].map((l) => ({ ...l, labelKey: `panel.airQuality.level.${l.label}`, textColor: WHITE }));

/**
 * US EPA AQI bands in the standard AQI colours (AirNow, "AQI Basics"). Text on
 * the three light colours is dark, as on AirNow, because white is unreadable there.
 */
const US_LEVELS: Array<{ max: number } & AqiLevel> = [
  { max: 50, label: 'good', color: '#00E400', textColor: DARK },
  { max: 100, label: 'moderate', color: '#FFFF00', textColor: DARK },
  { max: 150, label: 'unhealthySensitive', color: '#FF7E00', textColor: DARK },
  { max: 200, label: 'unhealthy', color: '#FF0000', textColor: WHITE },
  { max: 300, label: 'veryUnhealthy', color: '#8F3F97', textColor: WHITE },
  { max: Infinity, label: 'hazardous', color: '#7E0023', textColor: WHITE },
].map((l) => ({ ...l, labelKey: `panel.airQuality.usLevel.${l.label}` }));

function findLevel<T extends AqiLevel>(levels: Array<{ max: number } & T>, aqi: number): T {
  return levels.find((l) => aqi <= l.max) ?? levels[levels.length - 1];
}

/** Band of a European AQI value. */
export function getAqiLevel(aqi: number): EuropeanAqiLevel {
  return findLevel(EU_LEVELS, aqi);
}

/** Band of a US EPA AQI value. */
export function getUsAqiLevel(aqi: number): AqiLevel {
  return findLevel(US_LEVELS, aqi);
}

export function getAqiLevelOnScale(aqi: number, scale: AqiScale): AqiLevel {
  return scale === 'us' ? getUsAqiLevel(aqi) : getAqiLevel(aqi);
}

/** Short name shown next to a value on each scale. Index names stay untranslated. */
export const AQI_SCALE_NAME: Record<AqiScale, string> = { eu: 'AQI', us: 'US AQI' };

/** WAQI grid points link to their aqicn.org station page; Sensor.Community points do not. */
export function isWaqiStation(point: { url?: string }): boolean {
  return point.url?.includes('aqicn.org') ?? false;
}

/** Scale of an air quality grid point's value: US AQI for WAQI stations, European otherwise. */
export function gridPointScale(point: { url?: string }): AqiScale {
  return isWaqiStation(point) ? 'us' : 'eu';
}

/* ── UBA air quality index (official stations) ─────────────────────────── */

/**
 * The Umweltbundesamt's air quality index of an official station: five classes
 * (0 very good … 4 very poor), the worst of its NO₂, PM10, PM2.5 and O₃ classes.
 * A third scale beside the two above, with its own names
 * (`panel.airQuality.ubaLevel.*`) and a five-step ramp after the EEA's former
 * index colours. Text on the three light colours is dark.
 */
const UBA_LEVELS: readonly AqiLevel[] = [
  { label: 'veryGood', color: '#50F0E6', textColor: DARK },
  { label: 'good', color: '#50CCAA', textColor: DARK },
  { label: 'moderate', color: '#F0E641', textColor: DARK },
  { label: 'poor', color: '#FF5050', textColor: DARK },
  { label: 'veryPoor', color: '#960032', textColor: WHITE },
].map((l) => ({ ...l, labelKey: `panel.airQuality.ubaLevel.${l.label}` }));

/** Colour shown for a station whose hour has no overall index. */
const UBA_UNKNOWN: AqiLevel = { label: 'unknown', labelKey: 'panel.airQuality.ubaLevel.unknown', color: '#9ca3af', textColor: DARK };

/** Band of a UBA index class, or a grey "no index" band for null. */
export function getUbaLevel(index: number | null): AqiLevel {
  return index !== null && Number.isInteger(index) && index >= 0 && index <= 4 ? UBA_LEVELS[index]! : UBA_UNKNOWN;
}

/** The source line the UBA Air Data API asks for (dl-de/by-2-0), in its own German wording. */
export const UBA_SOURCE_LINE = 'Umweltbundesamt mit Daten der Messnetze der Länder und des Bundes';

/** Map attribution of the official stations' source. Fixed markup with no feed data in it. */
export const UBA_MAP_ATTRIBUTION =
  `<a href="https://www.umweltbundesamt.de/daten/luft/luftdaten" target="_blank" rel="noopener">${UBA_SOURCE_LINE}</a> (dl-de/by-2-0)`;

/** "Berlin Wedding" → "Wedding", "München/Stachus" → "Stachus", "Köln-Chorweiler" → "Chorweiler". */
export function shortStationName(name: string, cityName: string): string {
  const short = name.startsWith(cityName) ? name.slice(cityName.length).replace(/^[\s/-]+/, '') : name;
  return short || name;
}

type Pollutant = 'no2' | 'pm10' | 'pm25' | 'o3';

export interface MeasuredValue {
  /** Mean over the stations that measured it, rounded to one decimal. */
  value: number;
  stations: number;
}

export interface MeasuredSummary {
  values: Record<Pollutant, MeasuredValue | null>;
  /** Which stations the means are over: the urban background ones when there are any. */
  basis: 'background' | 'all';
  /** End of the newest measured hour among them. */
  measuredAt: string;
}

/**
 * City-wide measured concentrations: per pollutant, the mean over the
 * background stations (those away from busy roads and industry, which is what
 * a city-wide value describes and what the CAMS model resolves), or over all
 * stations when none is a background station. Only stations reporting the
 * newest hour count, so a station that stopped sending does not hold the
 * mean back. Null without stations.
 */
export function measuredSummary(stations: readonly Pick<AirQualityStation, Pollutant | 'setting' | 'measuredAt'>[]): MeasuredSummary | null {
  if (stations.length === 0) return null;
  const background = stations.filter((s) => s.setting === 'background');
  const basis = background.length > 0 ? 'background' : 'all';
  const pool = basis === 'background' ? background : stations;
  const measuredAt = pool.reduce((latest, s) => (s.measuredAt > latest ? s.measuredAt : latest), pool[0]!.measuredAt);
  const current = pool.filter((s) => s.measuredAt === measuredAt);
  const mean = (key: Pollutant): MeasuredValue | null => {
    const vals = current.map((s) => s[key]).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return { value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, stations: vals.length };
  };
  return { values: { no2: mean('no2'), pm10: mean('pm10'), pm25: mean('pm25'), o3: mean('o3') }, basis, measuredAt };
}

/** Distance in metres between two points (equirectangular, fine at city scale). */
function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const k = Math.PI / 180;
  const x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/**
 * The grid without the WAQI points that relay an official station the map
 * already shows from UBA (a WAQI point within `radius` metres of one), so a
 * station is not drawn twice. Sensor.Community points stay.
 */
export function withoutRelayedStations<T extends { lat: number; lon: number; url?: string }>(
  grid: readonly T[],
  stations: readonly { lat: number; lon: number }[],
  radius = 300,
): T[] {
  if (stations.length === 0) return grid as T[];
  return grid.filter((p) => !isWaqiStation(p) || !stations.some((s) => metresBetween(p, s) <= radius));
}

/** Agencies that run the official stations WAQI relays for a city. */
export interface WaqiAgencies {
  /** Proper names only, for the map attribution. */
  short: string;
  /** English wording for the Sources page. */
  full: string;
}

/**
 * Originating agencies of the WAQI stations in each city's bounding box. WAQI's
 * terms make credit to the World Air Quality Index Project and to the
 * originating agencies mandatory wherever its data is shown. Each entry names
 * the agencies the stations' aqicn.org pages credit (checked 2026-11-01): the
 * state network, plus the European Environment Agency where it relays the
 * stations; none credits the Umweltbundesamt.
 */
const WAQI_AGENCIES: Record<string, WaqiAgencies> = {
  berlin: {
    short: 'European Environment Agency, BLUME',
    full: 'the European Environment Agency and the Berlin air quality monitoring network (BLUME)',
  },
  hamburg: {
    short: 'HaLm',
    full: 'the Hamburg air quality monitoring network (Hamburger Luftmessnetz, HaLm)',
  },
  koeln: {
    short: 'European Environment Agency, LANUK',
    full: 'the European Environment Agency and the North Rhine-Westphalia air quality monitoring network (LUQS) of the Landesamt für Natur, Umwelt und Klima (LANUK, formerly LANUV)',
  },
  muenchen: {
    short: 'European Environment Agency, LfU',
    full: 'the European Environment Agency and the Bavarian air quality monitoring network (LÜB) of the Bayerisches Landesamt für Umwelt (LfU)',
  },
};

/** The city's WAQI originating agencies, or undefined for a city without an entry. */
export function waqiAgencies(cityId: string): WaqiAgencies | undefined {
  return WAQI_AGENCIES[cityId];
}

/**
 * Map attribution for the air-quality layer: WAQI and the city's originating
 * agencies, or nothing when no WAQI station is on the layer. Fixed markup with
 * no feed data in it.
 */
export function waqiMapAttribution(points: ReadonlyArray<{ url?: string }>, cityId: string): string | undefined {
  if (!points.some(isWaqiStation)) return undefined;
  const agencies = waqiAgencies(cityId);
  const link = '<a href="https://waqi.info/" target="_blank" rel="noopener">World Air Quality Index Project</a>';
  return agencies ? `&copy; ${link}, ${agencies.short}` : `&copy; ${link}`;
}
