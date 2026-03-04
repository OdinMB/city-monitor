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
};

export const WEATHER_SOURCE = 'weather-precip';
export const WEATHER_LAYER = 'weather-precip-layer';

export const RENT_MAP_SOURCE = 'rent-map-wms';
export const RENT_MAP_LAYER = 'rent-map-layer';
export const RENT_MAP_WMS_URL =
  'https://gdi.berlin.de/services/wms/wohnlagenadr2024?service=WMS&version=1.1.1&request=GetMap' +
  '&layers=wohnlagenadr2024&styles=&format=image/png&transparent=true' +
  '&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}';

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
};

const NOISE_WMS_BASE: Record<string, string> = {
  berlin: 'https://gdi.berlin.de/services/wms/ua_stratlaerm_2022',
  hamburg: 'https://geodienste.hamburg.de/wms_strategische_laermkarten',
};

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
