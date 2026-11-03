/**
 * Map constants, color ramps, and shared type aliases.
 */

import type { AirQualityGridPoint, WaterLevelStation } from '../../lib/api.js';

export const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';
export const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

export const EMPTY_AQ: AirQualityGridPoint[] = [];
export const EMPTY_WL: WaterLevelStation[] = [];

/** Layers to KEEP — everything else gets hidden */
export const KEEP_LAYERS = new Set([
  'background',
  'landcover',
  'park_national_park',
  'park_nature_reserve',
  'boundary_county',
  'boundary_state',
  'boundary_country_outline',
  'boundary_country_inner',
]);

/**
 * Major road case layers from CARTO style — shown when the traffic data layer is active.
 * Only case (outline) layers, not fill layers.
 */
export const TRAFFIC_ROAD_LAYERS: { id: string; width: number }[] = [
  { id: 'road_mot_case_noramp', width: 2.5 },
  { id: 'road_mot_case_ramp', width: 2 },
  { id: 'bridge_mot_case', width: 2.5 },
  { id: 'road_trunk_case_noramp', width: 2 },
  { id: 'road_trunk_case_ramp', width: 1.5 },
  { id: 'bridge_trunk_case', width: 2 },
  { id: 'road_pri_case_noramp', width: 1.5 },
  { id: 'road_pri_case_ramp', width: 1.2 },
  { id: 'bridge_pri_case', width: 1.5 },
  { id: 'road_sec_case_noramp', width: 1 },
  { id: 'bridge_sec_case', width: 1 },
];
export const ROAD_LAYER_IDS = new Set(TRAFFIC_ROAD_LAYERS.map((l) => l.id));

/** Water body layers from CARTO style — shown when the water-levels data layer is active. */
export const WATER_LAYER_IDS = new Set(['water', 'water_shadow', 'waterway']);

export const DISTRICT_URLS: Record<string, { url: string; nameField: string }> = {
  berlin: {
    url: new URL('../../data/districts/berlin-bezirke.geojson', import.meta.url).href,
    nameField: 'name',
  },
  hamburg: {
    url: new URL('../../data/districts/hamburg-bezirke.geojson', import.meta.url).href,
    nameField: 'bezirk_name',
  },
  // Stadtbezirke Köln, Offene Daten Köln (dl-de/zero-2.0): the city's Shapefile,
  // converted once to WGS84 and simplified.
  koeln: {
    url: new URL('../../data/districts/koeln-bezirke.geojson', import.meta.url).href,
    nameField: 'name',
  },
  // vablock_stadtbezirke_opendata, GeodatenService München (dl-de/by-2.0): the
  // WFS layer, its two-part districts 18 and 19 merged, simplified.
  muenchen: {
    url: new URL('../../data/districts/muenchen-bezirke.geojson', import.meta.url).href,
    nameField: 'name',
  },
};

export const WEATHER_SOURCE = 'weather-precip';
export const WEATHER_LAYER = 'weather-precip-layer';

export const RENT_MAP_SOURCE = 'rent-map-wms';
export const RENT_MAP_LAYER = 'rent-map-layer';

/** One class of a city's rent map, as its WMS draws it: the i18n key under `sidebar.rentLegend` and the colour. */
export interface RentMapClass {
  key: 'simple' | 'medium' | 'good' | 'normal' | 'unrated';
  color: string;
}

interface RentMapWms {
  /** The WMS endpoint, without query. */
  base: string;
  layer: string;
  /** The map credit, as the provider and licence ask. */
  attribution: string;
  /** The classes the WMS draws, in the order of its own legend (GetLegendGraphic). */
  legend: readonly RentMapClass[];
}

/**
 * Each city's address-level residential-location map (Wohnlagenkarte), the
 * `rent` sub-layer of the social layer. A city lists the `rentMap` feature
 * exactly when it has an entry (config/index.test.ts checks).
 */
const RENT_MAP_WMS: Record<string, RentMapWms> = {
  // Wohnlagenkarte zum Berliner Mietspiegel 2026; a new Mietspiegel (every two years) brings a new service name.
  berlin: {
    base: 'https://gdi.berlin.de/services/wms/wohnlagenadr2026',
    layer: 'wohnlagenadr2026',
    attribution: '&copy; <a href="https://daten.berlin.de" target="_blank">Berlin Open Data</a>',
    legend: [
      { key: 'simple', color: '#ffff7f' },
      { key: 'medium', color: '#ffd37f' },
      { key: 'good', color: '#ff7f7f' },
    ],
  },
  // Hamburger Wohnlagenverzeichnis, updated with each Mietenspiegel (two-yearly).
  // GetCapabilities <Fees>: dl-de/by-2.0 with this credit line (checked 2026-11-02).
  // Two classes only: Hamburg's Mietenspiegel knows no "einfache Wohnlage".
  hamburg: {
    base: 'https://geodienste.hamburg.de/HH_WMS_Wohnlagen',
    layer: 'wohnlagen',
    attribution:
      '<a href="https://geodienste.hamburg.de/HH_WMS_Wohnlagen?SERVICE=WMS&amp;REQUEST=GetCapabilities" target="_blank">Freie und Hansestadt Hamburg, Behörde für Stadtentwicklung und Wohnen</a>, ' +
      '<a href="https://www.govdata.de/dl-de/by-2-0" target="_blank">dl-de/by-2-0</a>',
    legend: [
      { key: 'normal', color: '#fc2222' },
      { key: 'good', color: '#3c80fc' },
      { key: 'unrated', color: '#ffffff' },
    ],
  },
};

/** The city's rent map tile URL template, or null when it has none. */
export function getRentMapWmsUrl(cityId: string): string | null {
  const wms = RENT_MAP_WMS[cityId];
  if (!wms) return null;
  return `${wms.base}?service=WMS&version=1.1.1&request=GetMap` +
    `&layers=${wms.layer}&styles=&format=image/png&transparent=true` +
    `&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
}

export function getRentMapAttribution(cityId: string): string | undefined {
  return RENT_MAP_WMS[cityId]?.attribution;
}

/**
 * Bike-sharing availability bands, for the station circles and the sidebar
 * legend; `key` names the `sidebar.bikeLegend` label. 1–2 bikes is "few", 3 and
 * more "many".
 */
export const BIKE_AVAILABILITY: ReadonlyArray<{ key: 'none' | 'few' | 'many'; color: string }> = [
  { key: 'none', color: '#94a3b8' },
  { key: 'few', color: '#f59e0b' },
  { key: 'many', color: '#16a34a' },
];

/** The classes of the city's rent map, for the sidebar legend (empty without one). */
export function getRentMapLegend(cityId: string): readonly RentMapClass[] {
  return RENT_MAP_WMS[cityId]?.legend ?? [];
}

export const NOISE_SOURCE = 'noise-wms';
export const NOISE_LAYER = 'noise-wms-layer';

const NOISE_WMS_LAYERS: Record<string, Record<string, string>> = {
  berlin: {
    total: 'bf_gesamtlaerm_den2022',
    road: 'bb_strasse_gesamt_den2022',
    rail: 'bc_tram_ubahn_den2022',
    air: 'bd_flug_gesamt_den2022',
  },
  hamburg: {
    road: 'strasse_tag',
    rail: 'schiene_tag',
    air: 'flug_tag',
  },
  // LANUV's statewide map of the 2022 round (Runde 4). Rail is both the
  // Stadtbahn ("Schiene sonstige") and Deutsche Bahn ("Schiene Bund").
  koeln: {
    road: 'STR_DEN',
    rail: 'SCS_DEN,SCB_DEN',
    air: 'FLG_DEN',
  },
};

const NOISE_WMS_BASE: Record<string, string> = {
  berlin: 'https://gdi.berlin.de/services/wms/ua_stratlaerm_2022',
  hamburg: 'https://geodienste.hamburg.de/wms_strategische_laermkarten',
  koeln: 'https://www.wms.nrw.de/umwelt/laerm',
};

/**
 * The zoom from which a city's noise map draws anything. NRW's service renders
 * only at 1:75,500 or closer (GetCapabilities MaxScaleDenominator), which a
 * 256px tile in web mercator reaches at zoom 13; further out it returns empty
 * tiles, so none are requested and the sidebar asks to zoom in.
 */
const NOISE_WMS_MIN_ZOOM: Record<string, number> = {
  koeln: 13,
};

/** The zoom from which the city's noise map shows, or undefined when it shows at every zoom. */
export function getNoiseWmsMinZoom(cityId: string): number | undefined {
  return NOISE_WMS_MIN_ZOOM[cityId];
}

/** The map credit for each city's noise map, as its provider and licence ask. */
const NOISE_WMS_ATTRIBUTION: Record<string, string> = {
  berlin: '&copy; <a href="https://daten.berlin.de" target="_blank">Open Data</a>',
  hamburg:
    '&copy; <a href="https://geodienste.hamburg.de/wms_strategische_laermkarten" target="_blank">Freie und Hansestadt Hamburg</a>, ' +
    // GetCapabilities <Fees>: Datenlizenz Deutschland – Zero – Version 2.0 (checked 2026-11-01).
    // Zero asks for no credit; it is kept as a courtesy.
    '<a href="https://www.govdata.de/dl-de/zero-2-0" target="_blank">dl-de/zero-2-0</a>',
  // GetCapabilities <AccessConstraints>: dl-de/by-2.0, credit "Land NRW" (checked 2026-11-02).
  koeln:
    '<a href="https://www.wms.nrw.de/umwelt/laerm?REQUEST=GetCapabilities&amp;SERVICE=WMS" target="_blank">Land NRW</a>, ' +
    '<a href="https://www.govdata.de/dl-de/by-2-0" target="_blank">dl-de/by-2-0</a>',
};

export function getNoiseWmsAttribution(cityId: string): string | undefined {
  return NOISE_WMS_ATTRIBUTION[cityId];
}

export function getNoiseWmsUrl(cityId: string, noiseLayer: string): string | null {
  const base = NOISE_WMS_BASE[cityId];
  const layers = NOISE_WMS_LAYERS[cityId];
  if (!base || !layers) return null;
  const layer = layers[noiseLayer];
  if (!layer) return null;
  return `${base}?service=WMS&version=1.1.1&request=GetMap` +
    `&layers=${layer}&styles=&format=image/png&transparent=true` +
    `&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
}

export const TRAFFIC_FLOW_SOURCE = 'traffic-flow-wms';
export const TRAFFIC_FLOW_LAYER = 'traffic-flow-layer';

/** One class of a city's congestion map: the i18n key under `sidebar.trafficFlowLegend` and the colour its WMS draws. */
export interface TrafficFlowClass {
  key: 'flowing' | 'dense' | 'slow' | 'jammed';
  color: string;
}

interface TrafficFlowWms {
  /** The WMS endpoint, without query. */
  base: string;
  layer: string;
  /** The map credit, as the provider and licence ask. */
  attribution: string;
  /** The classes the WMS draws, from free-flowing to jammed. */
  legend: readonly TrafficFlowClass[];
  /** The zoom from which the WMS draws anything (it renders empty tiles further out). */
  minZoom?: number;
}

/**
 * How often the congestion map is asked for new tiles. Hamburg's Verkehrslage
 * is recomputed every 5 minutes; the service sends no-cache.
 */
export const TRAFFIC_FLOW_REFRESH_MS = 5 * 60_000;

/**
 * Each city's live congestion map, the `congestion` sub-layer of the traffic
 * layer. A city lists the `trafficFlowMap` feature exactly when it has an
 * entry (config/index.test.ts checks).
 */
const TRAFFIC_FLOW_WMS: Record<string, TrafficFlowWms> = {
  // Verkehrslage Hamburg: the road network's state every 5 minutes, out to the
  // motorways towards Lüneburg, Bremen, Flensburg and Lübeck. GetCapabilities
  // <Fees>: dl-de/by-2.0 with this credit line (checked 2026-11-03). It draws
  // nothing at 1:270,000 (zoom 11) and starts at zoom 12. Colours sampled from
  // its GetLegendGraphic.
  hamburg: {
    base: 'https://geodienste.hamburg.de/wms_hh_verkehrslage',
    layer: 'verkehrslage',
    attribution:
      '<a href="https://geodienste.hamburg.de/wms_hh_verkehrslage?SERVICE=WMS&amp;REQUEST=GetCapabilities" target="_blank">Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende</a>, ' +
      '<a href="https://www.govdata.de/dl-de/by-2-0" target="_blank">dl-de/by-2-0</a>',
    legend: [
      { key: 'flowing', color: '#2ca62c' },
      { key: 'dense', color: '#e88528' },
      { key: 'slow', color: '#e70104' },
      { key: 'jammed', color: '#971718' },
    ],
    minZoom: 12,
  },
};

/**
 * The city's congestion map tile URL template, or null when it has none.
 * `refresh` changes the URL (and so the tiles) every refresh period.
 */
export function getTrafficFlowWmsUrl(cityId: string, refresh = 0): string | null {
  const wms = TRAFFIC_FLOW_WMS[cityId];
  if (!wms) return null;
  return `${wms.base}?service=WMS&version=1.1.1&request=GetMap` +
    `&layers=${wms.layer}&styles=&format=image/png&transparent=true` +
    `&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}&t=${refresh}`;
}

export function getTrafficFlowAttribution(cityId: string): string | undefined {
  return TRAFFIC_FLOW_WMS[cityId]?.attribution;
}

/** The classes of the city's congestion map, for the sidebar legend (empty without one). */
export function getTrafficFlowLegend(cityId: string): readonly TrafficFlowClass[] {
  return TRAFFIC_FLOW_WMS[cityId]?.legend ?? [];
}

/** The zoom from which the city's congestion map shows, or undefined when it shows at every zoom. */
export function getTrafficFlowMinZoom(cityId: string): number | undefined {
  return TRAFFIC_FLOW_WMS[cityId]?.minZoom;
}

/**
 * Bands of a counting site's count against its usual count for that hour, for
 * the site circles and the sidebar legend; `key` names the
 * `sidebar.trafficCountLegend` label. `below` is the upper bound of the
 * count / usual ratio. Blue for less traffic than usual, orange to red for
 * more; grey where there is nothing to compare.
 */
export const TRAFFIC_COUNT_LEVELS: ReadonlyArray<{ key: 'wellBelow' | 'below' | 'usual' | 'above' | 'wellAbove'; below: number; color: string }> = [
  { key: 'wellBelow', below: 0.6, color: '#1d4ed8' },
  { key: 'below', below: 0.85, color: '#60a5fa' },
  { key: 'usual', below: 1.15, color: '#a8a29e' },
  { key: 'above', below: 1.4, color: '#fb923c' },
  { key: 'wellAbove', below: Infinity, color: '#dc2626' },
];
export const TRAFFIC_COUNT_NONE_COLOR = '#e5e7eb';

/**
 * Below this usual count per hour a site is not compared: at night a few
 * vehicles more or less double or halve the count.
 */
export const TRAFFIC_COUNT_MIN_TYPICAL: Record<'car' | 'bike', number> = { car: 50, bike: 10 };

export type TrafficCountLevel = (typeof TRAFFIC_COUNT_LEVELS)[number]['key'] | 'none';

/** A site's band, or 'none' without a usual count or with too little traffic to compare. */
export function trafficCountLevel(count: number, typical: number | null, mode: 'car' | 'bike'): TrafficCountLevel {
  if (typical === null || typical < TRAFFIC_COUNT_MIN_TYPICAL[mode]) return 'none';
  const ratio = count / typical;
  return TRAFFIC_COUNT_LEVELS.find((l) => ratio < l.below)!.key;
}

export const POLITICAL_MARKER_LAYER = 'political-marker-icon';
export const POLITICAL_MARKER_SOURCE = 'political-markers';

export const SPIDER_BASE_RADIUS = 0.003; // ~300m base
export const SPIDER_PER_ITEM = 0.0008;   // extra ~80m per item so large groups spread further

export const NINA_SEVERITY_COLORS: Record<string, string> = {
  extreme: 'rgba(220, 38, 38, 0.3)',
  severe: 'rgba(239, 68, 68, 0.25)',
  moderate: 'rgba(245, 158, 11, 0.2)',
  minor: 'rgba(234, 179, 8, 0.15)',
};

export const TRAFFIC_SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  major: '#f97316',
  moderate: '#eab308',
  low: '#84cc16',
};

export type SocialAtlasMetric = 'unemployment' | 'singleParent' | 'welfare' | 'childPoverty';

export const SOCIAL_ATLAS_COLOR_RAMPS: Record<SocialAtlasMetric, { property: string; stops: [number, string][] }> = {
  unemployment: {
    property: 'unemployment',
    stops: [[0, '#dcfce7'], [5, '#86efac'], [10, '#22c55e'], [15, '#16a34a'], [25, '#14532d']],
  },
  singleParent: {
    property: 'singleParent',
    stops: [[0, '#fef9c3'], [20, '#fde047'], [40, '#eab308'], [60, '#a16207'], [80, '#713f12']],
  },
  welfare: {
    property: 'welfare',
    stops: [[0, '#ede9fe'], [10, '#c4b5fd'], [20, '#8b5cf6'], [30, '#6d28d9'], [50, '#3b0764']],
  },
  childPoverty: {
    property: 'childPoverty',
    stops: [[0, '#fce7f3'], [10, '#f9a8d4'], [20, '#ec4899'], [40, '#be185d'], [60, '#831843']],
  },
};

export type PopulationMetric = 'density' | 'elderlyPct' | 'foreignPct';

export const POPULATION_COLOR_RAMPS: Record<PopulationMetric, { property: string; stops: [number, string][] }> = {
  density: {
    property: 'density',
    stops: [[0, '#dbeafe'], [5000, '#93c5fd'], [10000, '#60a5fa'], [20000, '#3b82f6'], [30000, '#1d4ed8']],
  },
  elderlyPct: {
    property: 'elderlyPct',
    stops: [[0, '#fef3c7'], [10, '#fcd34d'], [20, '#f59e0b'], [30, '#d97706'], [40, '#92400e']],
  },
  foreignPct: {
    property: 'foreignPct',
    stops: [[0, '#cffafe'], [10, '#67e8f9'], [20, '#22d3ee'], [30, '#06b6d4'], [50, '#0e7490']],
  },
};
