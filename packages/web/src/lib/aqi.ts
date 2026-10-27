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
 */

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
 * originating agencies mandatory wherever its data is shown.
 */
const WAQI_AGENCIES: Record<string, WaqiAgencies> = {
  berlin: {
    short: 'Umweltbundesamt, BLUME',
    full: 'the Umweltbundesamt (German Environment Agency) and the Berlin air quality monitoring network (BLUME)',
  },
  hamburg: {
    short: 'Umweltbundesamt, HaLm',
    full: 'the Umweltbundesamt (German Environment Agency) and the Hamburg air quality monitoring network (HaLm)',
  },
  koeln: {
    short: 'Umweltbundesamt, LANUK',
    full: 'the Umweltbundesamt (German Environment Agency) and the North Rhine-Westphalia air quality monitoring network (LUQS) of the Landesamt für Natur, Umwelt und Klima (LANUK)',
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
