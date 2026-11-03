/**
 * Base map helpers: style simplification, road/water/weather/rent overlays.
 */

import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import {
  KEEP_LAYERS,
  ROAD_LAYER_IDS,
  WATER_LAYER_IDS,
  TRAFFIC_ROAD_LAYERS,
  TRAFFIC_RAIL_LAYER,
  TRAFFIC_RAIL_MIN_ZOOM,
  GREEN_LAYER_IDS,
  WEATHER_SOURCE,
  WEATHER_LAYER,
  RENT_MAP_SOURCE,
  RENT_MAP_LAYER,
  getRentMapWmsUrl,
  getRentMapAttribution,
  NOISE_SOURCE,
  NOISE_LAYER,
  getNoiseWmsUrl,
  getNoiseWmsAttribution,
  getNoiseWmsMinZoom,
  TRAFFIC_FLOW_SOURCE,
  TRAFFIC_FLOW_LAYER,
  getTrafficFlowWmsUrl,
  getTrafficFlowAttribution,
  getTrafficFlowMinZoom,
  STREET_TREES_SOURCE,
  STREET_TREES_LAYER,
  STREET_TREES_MIN_ZOOM,
  getStreetTreesWmsUrl,
  getStreetTreesAttribution,
} from './constants.js';
import { API_BASE } from '../../lib/api.js';

/** Check whether a style layer should be visible on initial load */
function isKeptLayer(layer: LayerSpecification): boolean {
  const id = layer.id;
  return (
    KEEP_LAYERS.has(id) ||
    ROAD_LAYER_IDS.has(id) ||
    WATER_LAYER_IDS.has(id) ||
    id.startsWith('district-') ||
    id.startsWith('political-') ||
    id.startsWith('transit-') ||
    id.startsWith('news-') ||
    id.startsWith('safety-') ||
    id.startsWith('warning-') ||
    id.startsWith('pharmacy-') ||
    id.startsWith('aed-') ||
    id.startsWith('traffic-') ||
    id.startsWith('construction-') ||
    id.startsWith('aq-') ||
    id.startsWith('wl-') ||
    id.startsWith('bathing-') ||
    id.startsWith('weather-') ||
    id.startsWith('rent-map-') ||
    id.startsWith('noise-') ||
    id.startsWith('street-trees-') ||
    id.startsWith('social-atlas-') ||
    id.startsWith('population-')
  );
}

/** Pre-process a CARTO style to hide layers we don't need, preventing the
 *  flash of detailed streets before simplifyMap() runs. */
function preprocessStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (isKeptLayer(layer)) return layer;
      return { ...layer, layout: { ...layer.layout, visibility: 'none' as const } };
    }),
  };
}

// Cache fetched + processed styles so theme swaps don't re-fetch
const styleCache = new Map<string, StyleSpecification>();

/** Fetch a CARTO style URL, pre-process it to hide unwanted layers, and return
 *  a style object ready for the Map constructor or setStyle(). Rejects on a
 *  network error, an error status or a body that is not a style; only a style
 *  that loaded is cached, so the next call asks again. */
/**
 * The bounds around the same centre that fit `zoomIn` zoom steps closer: each
 * step halves the span.
 */
export function zoomedInBounds(
  [[west, south], [east, north]]: [[number, number], [number, number]],
  zoomIn: number,
): [[number, number], [number, number]] {
  const scale = 2 ** -zoomIn;
  const lon = (west + east) / 2;
  const lat = (south + north) / 2;
  const halfLon = ((east - west) / 2) * scale;
  const halfLat = ((north - south) / 2) * scale;
  return [[lon - halfLon, lat - halfLat], [lon + halfLon, lat + halfLat]];
}

export async function loadStyle(url: string): Promise<StyleSpecification> {
  const cached = styleCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Base-map style request failed: ${res.status}`);
  const raw: StyleSpecification = await res.json();
  if (!Array.isArray(raw?.layers)) throw new Error('Base-map style has no layers');
  const processed = preprocessStyle(raw);
  styleCache.set(url, processed);
  return processed;
}

export function simplifyMap(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (
      !KEEP_LAYERS.has(layer.id) &&
      !ROAD_LAYER_IDS.has(layer.id) &&
      !WATER_LAYER_IDS.has(layer.id) &&
      !layer.id.startsWith('district-') &&
      !layer.id.startsWith('political-') &&
      !layer.id.startsWith('transit-') &&
      !layer.id.startsWith('news-') &&
      !layer.id.startsWith('safety-') &&
      !layer.id.startsWith('warning-') &&
      !layer.id.startsWith('pharmacy-') &&
      !layer.id.startsWith('aed-') &&
      !layer.id.startsWith('traffic-') &&
      !layer.id.startsWith('construction-') &&
      !layer.id.startsWith('aq-') &&
      !layer.id.startsWith('wl-') &&
      !layer.id.startsWith('bathing-') &&
      !layer.id.startsWith('weather-') &&
      !layer.id.startsWith('rent-map-') &&
      !layer.id.startsWith('noise-') &&
      !layer.id.startsWith('street-trees-') &&
      !layer.id.startsWith('social-atlas-') &&
      !layer.id.startsWith('population-')
    ) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

/** The traffic category's backdrop: the major streets and the railway lines. */
export function setTrafficRoadVisibility(map: maplibregl.Map, visible: boolean, isDark: boolean) {
  const color = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  for (const { id, width } of TRAFFIC_ROAD_LAYERS) {
    if (!map.getLayer(id)) continue;
    if (visible) {
      map.setPaintProperty(id, 'line-color', color);
      map.setPaintProperty(id, 'line-width', width);
      map.setPaintProperty(id, 'line-opacity', 1);
    } else {
      map.setPaintProperty(id, 'line-opacity', 0);
    }
  }
  if (map.getLayer(TRAFFIC_RAIL_LAYER)) {
    if (visible) {
      map.setLayerZoomRange(TRAFFIC_RAIL_LAYER, TRAFFIC_RAIL_MIN_ZOOM, 24);
      map.setPaintProperty(TRAFFIC_RAIL_LAYER, 'line-color', isDark ? 'rgba(251,191,36,0.35)' : 'rgba(180,83,9,0.3)');
      map.setPaintProperty(TRAFFIC_RAIL_LAYER, 'line-opacity', 1);
    } else {
      map.setPaintProperty(TRAFFIC_RAIL_LAYER, 'line-opacity', 0);
    }
  }
}

/** The style's own green-space colours, read once per theme before they are tinted. */
const greenOriginals = new Map<string, unknown>();

/** The environment category's green spaces: tinted while it is on, back to the style's faint colour otherwise. */
export function setGreenSpaceVisibility(map: maplibregl.Map, visible: boolean, isDark: boolean) {
  for (const id of GREEN_LAYER_IDS) {
    if (!map.getLayer(id)) continue;
    const key = `${isDark ? 'dark' : 'light'}:${id}`;
    if (!greenOriginals.has(key)) greenOriginals.set(key, map.getPaintProperty(id, 'fill-color'));
    const color = visible
      ? (isDark ? 'rgba(74,222,128,0.14)' : 'rgba(74,163,80,0.2)')
      : greenOriginals.get(key);
    map.setPaintProperty(id, 'fill-color', color as maplibregl.ExpressionSpecification);
  }
}

export function setWaterAreaVisibility(map: maplibregl.Map, visible: boolean, isDark: boolean) {
  for (const id of WATER_LAYER_IDS) {
    if (!map.getLayer(id)) continue;
    if (id === 'waterway') {
      map.setPaintProperty(id, 'line-opacity', visible ? 1 : 0);
      if (visible) {
        map.setPaintProperty(id, 'line-color', isDark ? 'rgba(96,165,250,0.5)' : 'rgba(59,130,246,0.35)');
      }
    } else {
      map.setPaintProperty(id, 'fill-opacity', visible ? (isDark ? 0.4 : 0.25) : 0);
      if (visible) {
        map.setPaintProperty(id, 'fill-color', isDark ? 'rgba(59,130,246,0.5)' : 'rgba(96,165,250,0.4)');
      }
    }
  }
}

export function setWeatherOverlay(map: maplibregl.Map, visible: boolean) {
  if (visible) {
    if (!map.getSource(WEATHER_SOURCE)) {
      map.addSource(WEATHER_SOURCE, {
        type: 'raster',
        tiles: [`${API_BASE}/weather-tiles/{z}/{x}/{y}.png`],
        tileSize: 256,
        maxzoom: 7, // RainViewer max zoom; MapLibre upscales for higher zooms
        attribution: '&copy; <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>',
      });
    }
    if (!map.getLayer(WEATHER_LAYER)) {
      map.addLayer({
        id: WEATHER_LAYER,
        type: 'raster',
        source: WEATHER_SOURCE,
        paint: {
          'raster-opacity': 0.65,
        },
      });
    }
  } else {
    if (map.getLayer(WEATHER_LAYER)) map.removeLayer(WEATHER_LAYER);
    if (map.getSource(WEATHER_SOURCE)) map.removeSource(WEATHER_SOURCE);
  }
}

export function setNoiseOverlay(map: maplibregl.Map, visible: boolean, cityId: string, noiseLayer: string) {
  // Always remove old source/layer first so the WMS layer name can change
  if (map.getLayer(NOISE_LAYER)) map.removeLayer(NOISE_LAYER);
  if (map.getSource(NOISE_SOURCE)) map.removeSource(NOISE_SOURCE);

  if (visible) {
    const url = getNoiseWmsUrl(cityId, noiseLayer);
    if (!url) return;
    const minzoom = getNoiseWmsMinZoom(cityId);
    map.addSource(NOISE_SOURCE, {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      attribution: getNoiseWmsAttribution(cityId),
      ...(minzoom !== undefined && { minzoom }),
    });
    // Insert below noise sensor markers so live data stays in foreground
    const beforeId = map.getLayer('noise-sensor-icon') ? 'noise-sensor-icon' : undefined;
    map.addLayer({
      id: NOISE_LAYER,
      type: 'raster',
      source: NOISE_SOURCE,
      paint: {
        'raster-opacity': 0.7,
      },
    }, beforeId);
  }
}

/**
 * The city's live congestion map (the traffic layer's congestion sub-layer).
 * A new `refresh` swaps the tile URL in place so the map shows the newest
 * state without the layer blinking out; another city's map is replaced.
 */
export function setTrafficFlowOverlay(map: maplibregl.Map, visible: boolean, cityId: string, refresh: number) {
  const url = visible ? getTrafficFlowWmsUrl(cityId, refresh) : null;
  const source = map.getSource(TRAFFIC_FLOW_SOURCE) as maplibregl.RasterTileSource | undefined;
  const base = (u: string | undefined) => u?.replace(/&t=\d+$/, '');
  if (source && (!url || base(source.tiles?.[0]) !== base(url))) {
    if (map.getLayer(TRAFFIC_FLOW_LAYER)) map.removeLayer(TRAFFIC_FLOW_LAYER);
    map.removeSource(TRAFFIC_FLOW_SOURCE);
  }
  if (!url) return;
  const current = map.getSource(TRAFFIC_FLOW_SOURCE) as maplibregl.RasterTileSource | undefined;
  if (current) {
    if (current.tiles?.[0] !== url) current.setTiles([url]);
  } else {
    const minzoom = getTrafficFlowMinZoom(cityId);
    map.addSource(TRAFFIC_FLOW_SOURCE, {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      attribution: getTrafficFlowAttribution(cityId),
      ...(minzoom !== undefined && { minzoom }),
    });
  }
  if (!map.getLayer(TRAFFIC_FLOW_LAYER)) {
    // Under the incident lines and roadworks, which say why a road is slow
    const beforeId = ['traffic-line-casing', 'construction-line-casing', 'construction-points'].find((id) => map.getLayer(id));
    map.addLayer({
      id: TRAFFIC_FLOW_LAYER,
      type: 'raster',
      source: TRAFFIC_FLOW_SOURCE,
      paint: { 'raster-opacity': 0.85 },
    }, beforeId);
  }
}

/**
 * The city's street-tree register as a raster, from STREET_TREES_MIN_ZOOM on
 * (no tiles are requested further out). Kept while it shows this city's
 * register, replaced on a city switch.
 */
export function setStreetTreesOverlay(map: maplibregl.Map, visible: boolean, cityId: string) {
  const url = visible ? getStreetTreesWmsUrl(cityId) : null;
  const source = map.getSource(STREET_TREES_SOURCE) as maplibregl.RasterTileSource | undefined;
  if (source && (!url || source.tiles?.[0] !== url)) {
    if (map.getLayer(STREET_TREES_LAYER)) map.removeLayer(STREET_TREES_LAYER);
    map.removeSource(STREET_TREES_SOURCE);
  }
  if (!url) return;
  if (!map.getSource(STREET_TREES_SOURCE)) {
    map.addSource(STREET_TREES_SOURCE, {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      minzoom: STREET_TREES_MIN_ZOOM,
      attribution: getStreetTreesAttribution(cityId),
    });
  }
  if (!map.getLayer(STREET_TREES_LAYER)) {
    // Beneath the first point layer, so markers of other layers stay clickable on top of the dots
    const beforeId = map.getStyle()?.layers?.find((l) => l.type === 'symbol' || l.type === 'circle')?.id;
    map.addLayer({
      id: STREET_TREES_LAYER,
      type: 'raster',
      source: STREET_TREES_SOURCE,
      minzoom: STREET_TREES_MIN_ZOOM,
      paint: {
        'raster-opacity': 0.85,
      },
    }, beforeId);
  }
}

export function setRentMapOverlay(map: maplibregl.Map, visible: boolean, cityId: string) {
  const url = visible ? getRentMapWmsUrl(cityId) : null;
  const source = map.getSource(RENT_MAP_SOURCE) as maplibregl.RasterTileSource | undefined;
  // Keep a source that already shows this city's map; replace one of another city's.
  if (source && (!url || source.tiles?.[0] !== url)) {
    if (map.getLayer(RENT_MAP_LAYER)) map.removeLayer(RENT_MAP_LAYER);
    map.removeSource(RENT_MAP_SOURCE);
  }
  if (!url) return;
  if (!map.getSource(RENT_MAP_SOURCE)) {
    map.addSource(RENT_MAP_SOURCE, {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      attribution: getRentMapAttribution(cityId),
    });
  }
  if (!map.getLayer(RENT_MAP_LAYER)) {
    map.addLayer({
      id: RENT_MAP_LAYER,
      type: 'raster',
      source: RENT_MAP_SOURCE,
      paint: {
        'raster-opacity': 0.6,
      },
    });
  }
}
