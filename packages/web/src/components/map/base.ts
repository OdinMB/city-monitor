/**
 * Base map helpers: style simplification, road/water/weather/rent overlays.
 */

import maplibregl from 'maplibre-gl';
import {
  KEEP_LAYERS,
  ROAD_LAYER_IDS,
  WATER_LAYER_IDS,
  TRAFFIC_ROAD_LAYERS,
  WEATHER_SOURCE,
  WEATHER_LAYER,
  RENT_MAP_SOURCE,
  RENT_MAP_LAYER,
  RENT_MAP_WMS_URL,
  NOISE_SOURCE,
  NOISE_LAYER,
  getNoiseWmsUrl,
} from './constants.js';

/** Strip city prefix and constituency suffixes so API names match Bezirke GeoJSON.
 *  e.g. "Berlin-Spandau – Charlottenburg Nord" → "spandau" */
export function normalizePoliticalName(name: string): string {
  let n = name.toLowerCase();
  const dash = n.indexOf('-');
  if (dash > 0 && dash < 10) n = n.slice(dash + 1);
  const em = n.indexOf(' – ');
  if (em > 0) n = n.slice(0, em);
  return n.trim();
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
      !layer.id.startsWith('social-atlas-') &&
      !layer.id.startsWith('population-')
    ) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

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
        tiles: ['/api/weather-tiles/{z}/{x}/{y}.png'],
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
    map.addSource(NOISE_SOURCE, {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      attribution: '&copy; <a href="https://daten.berlin.de" target="_blank">Open Data</a>',
    });
    map.addLayer({
      id: NOISE_LAYER,
      type: 'raster',
      source: NOISE_SOURCE,
      paint: {
        'raster-opacity': 0.7,
      },
    });
  }
}

export function setRentMapOverlay(map: maplibregl.Map, visible: boolean) {
  if (visible) {
    if (!map.getSource(RENT_MAP_SOURCE)) {
      map.addSource(RENT_MAP_SOURCE, {
        type: 'raster',
        tiles: [RENT_MAP_WMS_URL],
        tileSize: 256,
        attribution: '&copy; <a href="https://daten.berlin.de" target="_blank">Berlin Open Data</a>',
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
  } else {
    if (map.getLayer(RENT_MAP_LAYER)) map.removeLayer(RENT_MAP_LAYER);
    if (map.getSource(RENT_MAP_SOURCE)) map.removeSource(RENT_MAP_SOURCE);
  }
}
