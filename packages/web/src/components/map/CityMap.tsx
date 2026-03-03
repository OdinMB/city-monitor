/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive city map using MapLibre GL with CARTO tiles.
 *
 * Reference: .worldmonitor/public/map-styles/ — bundled CARTO map styles
 * Does NOT port worldmonitor's DeckGLMap component.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTheme } from '../../hooks/useTheme.js';
import { useTransit } from '../../hooks/useTransit.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { useSafety } from '../../hooks/useSafety.js';
import { useNina } from '../../hooks/useNina.js';
import { usePharmacies } from '../../hooks/usePharmacies.js';
import { useAeds } from '../../hooks/useAeds.js';
import { useTrafficIncidents } from '../../hooks/useTraffic.js';
import { useConstruction } from '../../hooks/useConstruction.js';
import { usePolitical } from '../../hooks/usePolitical.js';
import { useAirQualityGrid } from '../../hooks/useAirQualityGrid.js';
import { useWaterLevels } from '../../hooks/useWaterLevels.js';
import { useBathing } from '../../hooks/useBathing.js';
import { useSocialAtlas } from '../../hooks/useSocialAtlas.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import type { TransitAlert, NewsItem, SafetyReport, NinaWarning, EmergencyPharmacy, TrafficIncident, ConstructionSite, PoliticalDistrict, AirQualityGridPoint, AedLocation, BathingSpot, WaterLevelStation, SocialAtlasFeatureProps } from '../../lib/api.js';
import { SEVERITY_COLORS, NEWS_CATEGORY_COLORS, AQI_LEVEL_COLORS, CONSTRUCTION_SUBTYPE_COLORS, WATER_STATE_COLORS, BATHING_QUALITY_COLORS, registerAllMapIcons, registerPoliticalIcons } from '../../lib/map-icons.js';
import { getAqiLevel } from '../../lib/aqi.js';
import { getPartyColor, getMajorityParty } from '../../lib/party-colors.js';
import { MAP_NEWS, MAP_DENSITY, MAP_SAFETY } from '../../lib/map-settings.js';
import { filterSafetyByRecency } from '../../lib/map-filters.js';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

const EMPTY_AQ: AirQualityGridPoint[] = [];
const EMPTY_WL: WaterLevelStation[] = [];

// Layers to KEEP — everything else gets hidden
const KEEP_LAYERS = new Set([
  'background',
  'landcover',
  'park_national_park',
  'park_nature_reserve',
  'boundary_county',
  'boundary_state',
  'boundary_country_outline',
  'boundary_country_inner',
]);

// Major road case layers from CARTO style — shown when the traffic data layer is active.
// Only case (outline) layers, not fill layers. The native CARTO paint is too subtle at
// city-wide zoom, so setTrafficRoadVisibility overrides color + width.
const TRAFFIC_ROAD_LAYERS: { id: string; width: number }[] = [
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
const ROAD_LAYER_IDS = new Set(TRAFFIC_ROAD_LAYERS.map((l) => l.id));

// Water body layers from CARTO style — shown when the water-levels data layer is active.
const WATER_LAYER_IDS = new Set(['water', 'water_shadow', 'waterway']);

const DISTRICT_URLS: Record<string, { url: string; nameField: string }> = {
  berlin: {
    url: new URL('../../data/districts/berlin-bezirke.geojson', import.meta.url).href,
    nameField: 'name',
  },
  hamburg: {
    url: new URL('../../data/districts/hamburg-bezirke.geojson', import.meta.url).href,
    nameField: 'bezirk_name',
  },
};

/** Strip city prefix and constituency suffixes so API names match Bezirke GeoJSON.
 *  e.g. "Berlin-Spandau – Charlottenburg Nord" → "spandau" */
function normalizePoliticalName(name: string): string {
  let n = name.toLowerCase();
  // Strip city prefix (e.g. "berlin-")
  const dash = n.indexOf('-');
  if (dash > 0 && dash < 10) n = n.slice(dash + 1);
  // Take only the part before " – " (constituency compounds)
  const em = n.indexOf(' – ');
  if (em > 0) n = n.slice(0, em);
  return n.trim();
}


function simplifyMap(map: maplibregl.Map) {
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
      !layer.id.startsWith('social-atlas-')
    ) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

function setTrafficRoadVisibility(map: maplibregl.Map, visible: boolean, isDark: boolean) {
  const color = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  for (const { id, width } of TRAFFIC_ROAD_LAYERS) {
    if (!map.getLayer(id)) continue;
    if (visible) {
      map.setPaintProperty(id, 'line-color', color);
      map.setPaintProperty(id, 'line-width', width);
      map.setPaintProperty(id, 'line-opacity', 1);
    } else {
      // Reset to near-invisible defaults so roads blend into background
      map.setPaintProperty(id, 'line-opacity', 0);
    }
  }
}

function setWaterAreaVisibility(map: maplibregl.Map, visible: boolean, isDark: boolean) {
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

const WEATHER_SOURCE = 'weather-precip';
const WEATHER_LAYER = 'weather-precip-layer';

function setWeatherOverlay(map: maplibregl.Map, visible: boolean) {
  if (visible) {
    if (!map.getSource(WEATHER_SOURCE)) {
      map.addSource(WEATHER_SOURCE, {
        type: 'raster',
        tiles: ['/api/weather-tiles/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; <a href="https://openweathermap.org/" target="_blank">OpenWeatherMap</a>',
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

const RENT_MAP_SOURCE = 'rent-map-wms';
const RENT_MAP_LAYER = 'rent-map-layer';
const RENT_MAP_WMS_URL =
  'https://gdi.berlin.de/services/wms/wohnlagenadr2024?service=WMS&version=1.1.1&request=GetMap' +
  '&layers=wohnlagenadr2024&styles=&format=image/png&transparent=true' +
  '&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}';

function setRentMapOverlay(map: maplibregl.Map, visible: boolean) {
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

async function addDistrictLayer(map: maplibregl.Map, cityId: string, isDark: boolean) {
  const config = DISTRICT_URLS[cityId];
  if (!config) return;

  // Fetch GeoJSON data directly so it's inlined into the source
  let geojson: GeoJSON.FeatureCollection;
  try {
    const res = await fetch(config.url);
    geojson = await res.json();
  } catch {
    return;
  }

  // Remove existing layers/source if present (for style re-adds)
  for (const id of ['district-label', 'district-line', 'district-fill']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('districts')) map.removeSource('districts');

  map.addSource('districts', {
    type: 'geojson',
    data: geojson,
    generateId: true,
  });

  map.addLayer({
    id: 'district-fill',
    type: 'fill',
    source: 'districts',
    paint: {
      'fill-color': isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        isDark ? 0.12 : 0.08,
        1,
      ],
    },
  });

  map.addLayer({
    id: 'district-line',
    type: 'line',
    source: 'districts',
    paint: {
      'line-color': isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
      'line-width': 1.5,
      'line-dasharray': [4, 2],
    },
  });

  map.addLayer({
    id: 'district-label',
    type: 'symbol',
    source: 'districts',
    layout: {
      'text-field': ['get', config.nameField],
      'text-size': 14,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-anchor': 'center',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.7)',
      'text-halo-color': isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.5,
    },
  });
}

function applyPoliticalStyling(
  map: maplibregl.Map,
  districts: PoliticalDistrict[],
  isDark: boolean,
  nameField: string,
) {
  if (!map.getLayer('district-fill') || !map.getSource('districts')) return;

  // Build a color mapping: normalized district name → majority party color
  const colorMap = new Map<string, string>();
  for (const d of districts) {
    const majorityParty = getMajorityParty(d.representatives);
    if (majorityParty) {
      colorMap.set(normalizePoliticalName(d.name), getPartyColor(majorityParty));
    }
  }

  // If we have political data, apply party-colored fill
  if (colorMap.size > 0) {
    const matchExpr: unknown[] = ['match', ['downcase', ['get', nameField]]];
    for (const [name, color] of colorMap) {
      matchExpr.push(name, color);
    }
    matchExpr.push(isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'); // fallback

    map.setPaintProperty('district-fill', 'fill-color', matchExpr as maplibregl.ExpressionSpecification);
    map.setPaintProperty('district-fill', 'fill-opacity', 0.35);
  }
}

function resetDistrictStyling(map: maplibregl.Map, isDark: boolean) {
  if (!map.getLayer('district-fill')) return;
  map.setPaintProperty(
    'district-fill',
    'fill-color',
    isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
  );
  map.setPaintProperty('district-fill', 'fill-opacity', [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    isDark ? 0.12 : 0.08,
    1,
  ]);
}

function sortRepsByPartyMajority(reps: PoliticalDistrict['representatives']): PoliticalDistrict['representatives'] {
  const counts = new Map<string, number>();
  for (const r of reps) counts.set(r.party, (counts.get(r.party) ?? 0) + 1);
  return [...reps].sort((a, b) => {
    const ca = counts.get(a.party) ?? 0;
    const cb = counts.get(b.party) ?? 0;
    if (ca !== cb) return cb - ca;
    if (a.party !== b.party) return a.party.localeCompare(b.party);
    return a.name.localeCompare(b.name);
  });
}

function buildPoliticalPopupHtml(districtName: string, districts: PoliticalDistrict[]): string {
  const normalized = normalizePoliticalName(districtName);
  const match = districts.find(
    (d) => normalizePoliticalName(d.name) === normalized,
  );
  if (!match || match.representatives.length === 0) {
    return `<div style="font-size:13px"><strong>${districtName}</strong><br><em>No data available</em></div>`;
  }

  // Sort representatives by party majority (largest party first)
  const sorted = sortRepsByPartyMajority(match.representatives);

  const parts = [`<div style="font-size:13px;max-height:400px;overflow-y:auto">`];
  parts.push(`<div style="font-weight:600;margin-bottom:6px">${districtName}</div>`);

  for (const rep of sorted) {
    const color = getPartyColor(rep.party);
    parts.push(
      `<div style="border-left:3px solid ${color};padding-left:8px;margin-bottom:6px">` +
      `<strong>${rep.name}</strong> <span style="opacity:0.6;font-size:11px">${rep.party}</span><br>` +
      `<span style="font-size:11px;opacity:0.7">${rep.role}${rep.constituency ? ` — ${rep.constituency}` : ''}</span>` +
      (rep.profileUrl ? `<br><a href="${rep.profileUrl}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Profile →</a>` : '') +
      `</div>`,
    );
  }

  parts.push(`</div>`);
  return parts.join('');
}

function setupDistrictHover(map: maplibregl.Map) {
  let hoveredId: number | null = null;

  map.on('mousemove', 'district-fill', (e) => {
    if (!e.features?.length) return;
    const id = e.features[0].id as number;
    if (hoveredId === id) return;

    if (hoveredId !== null) {
      map.setFeatureState({ source: 'districts', id: hoveredId }, { hover: false });
    }
    hoveredId = id;
    map.setFeatureState({ source: 'districts', id }, { hover: true });
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'district-fill', () => {
    if (hoveredId !== null) {
      map.setFeatureState({ source: 'districts', id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    map.getCanvas().style.cursor = '';
  });
}

// --- Political district markers -------------------------------------------

/** Compute a simple centroid from a polygon's first ring (average of vertices) */
function polygonCentroid(coords: number[][]): [number, number] {
  let sumLon = 0;
  let sumLat = 0;
  // Exclude the closing vertex (it duplicates the first)
  const n = coords.length > 1 ? coords.length - 1 : coords.length;
  for (let i = 0; i < n; i++) {
    sumLon += coords[i][0];
    sumLat += coords[i][1];
  }
  return [sumLon / n, sumLat / n];
}

const POLITICAL_MARKER_LAYER = 'political-marker-icon';
const POLITICAL_MARKER_SOURCE = 'political-markers';

function updatePoliticalMarkers(
  map: maplibregl.Map,
  districts: PoliticalDistrict[],
  geojsonFeatures: GeoJSON.Feature[],
  subLayer: 'bezirke' | 'bundestag' | 'landesparlament',
  nameField: string,
  isDark: boolean,
) {
  // Clean up existing marker layer
  if (map.getLayer(POLITICAL_MARKER_LAYER)) map.removeLayer(POLITICAL_MARKER_LAYER);
  if (map.getSource(POLITICAL_MARKER_SOURCE)) map.removeSource(POLITICAL_MARKER_SOURCE);

  if (!districts.length || !geojsonFeatures.length) return;

  // Build normalized name → majority party color map
  const colorMap = new Map<string, string>();
  const uniqueColors = new Set<string>();
  for (const d of districts) {
    const party = getMajorityParty(d.representatives);
    const color = party ? getPartyColor(party) : '#808080';
    colorMap.set(normalizePoliticalName(d.name), color);
    uniqueColors.add(color);
  }

  // Register icons for all party colors used (including fallback)
  uniqueColors.add('#808080');
  registerPoliticalIcons(map, subLayer, [...uniqueColors], isDark);

  const points: GeoJSON.Feature[] = [];

  for (const f of geojsonFeatures) {
    const name = f.properties?.[nameField] as string | undefined;
    if (!name) continue;

    const geom = f.geometry;
    let centroid: [number, number];
    if (geom.type === 'Polygon') {
      centroid = polygonCentroid((geom as GeoJSON.Polygon).coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      // Use the largest ring
      const coords = (geom as GeoJSON.MultiPolygon).coordinates;
      let best = coords[0][0];
      for (const poly of coords) {
        if (poly[0].length > best.length) best = poly[0];
      }
      centroid = polygonCentroid(best);
    } else {
      continue;
    }

    const color = colorMap.get(normalizePoliticalName(name)) ?? '#808080';
    const iconId = `political-icon-${color.replace('#', '')}`;

    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: centroid },
      properties: { name, iconId, color },
    });
  }

  if (!points.length) return;

  map.addSource(POLITICAL_MARKER_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: points },
  });

  map.addLayer({
    id: POLITICAL_MARKER_LAYER,
    type: 'symbol',
    source: POLITICAL_MARKER_SOURCE,
    layout: {
      'icon-image': ['get', 'iconId'],
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

}

function removePoliticalMarkers(map: maplibregl.Map) {
  if (map.getLayer(POLITICAL_MARKER_LAYER)) map.removeLayer(POLITICAL_MARKER_LAYER);
  if (map.getSource(POLITICAL_MARKER_SOURCE)) map.removeSource(POLITICAL_MARKER_SOURCE);
}

// --- Shared popup helpers ---------------------------------------------------

let _hoverPopup: maplibregl.Popup | null = null;
let _hoverTimer: ReturnType<typeof setTimeout> | null = null;

function _clearHoverTimer() {
  if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
}

function _closeHoverPopup() {
  _clearHoverTimer();
  if (_hoverPopup) { _hoverPopup.remove(); _hoverPopup = null; }
}

function showMapPopup(
  map: maplibregl.Map,
  lngLat: maplibregl.LngLatLike,
  html: string,
  opts: { offset?: number; maxWidth?: string; sticky?: boolean } = {},
): maplibregl.Popup {
  const { offset = 10, maxWidth = '300px', sticky = false } = opts;
  _closeHoverPopup();

  const popup = new maplibregl.Popup({
    offset,
    maxWidth,
    closeButton: sticky,
    closeOnClick: sticky,
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);

  if (!sticky) {
    _hoverPopup = popup;
    const el = popup.getElement();
    // Allow the entire popup container to receive pointer events so the mouse
    // can travel from the map feature through the tip into the content area
    // without triggering the close timer.
    el.style.pointerEvents = 'auto';
    el.addEventListener('mouseenter', _clearHoverTimer);
    el.addEventListener('mouseleave', () => {
      if (_hoverPopup === popup) _closeHoverPopup();
    });
  }

  popup.on('close', () => {
    if (_hoverPopup === popup) _hoverPopup = null;
  });

  return popup;
}

type MapLayerEvent = maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] };
type PopupContentFn = (e: MapLayerEvent) => { html: string; lngLat: [number, number] } | null;

/** Register hover (desktop) + click (mobile/pin) popup handlers for a layer. */
function registerPopupHandlers(
  map: maplibregl.Map,
  layerId: string,
  getContent: PopupContentFn,
  opts?: { offset?: number; maxWidth?: string },
) {
  map.on('mouseenter', layerId, (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const c = getContent(e as MapLayerEvent);
    if (c) showMapPopup(map, c.lngLat, c.html, { ...opts, sticky: false });
  });

  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
    _clearHoverTimer();
    _hoverTimer = setTimeout(_closeHoverPopup, 300);
  });

  map.on('click', layerId, (e) => {
    const c = getContent(e as MapLayerEvent);
    if (c) showMapPopup(map, c.lngLat, c.html, { ...opts, sticky: true });
  });
}

// ---------------------------------------------------------------------------

interface StationGroup {
  station: string;
  lat: number;
  lon: number;
  alerts: TransitAlert[];
  highestSeverity: TransitAlert['severity'];
}

/** Group alerts by station location — one map feature per station */
function alertsToGeoJSON(alerts: TransitAlert[]): GeoJSON.FeatureCollection {
  const byKey = new Map<string, StationGroup>();

  for (const a of alerts) {
    if (!a.location) continue;
    const key = `${a.location.lat.toFixed(4)},${a.location.lon.toFixed(4)}`;
    const group = byKey.get(key);
    if (group) {
      group.alerts.push(a);
      if (a.severity === 'high' || (a.severity === 'medium' && group.highestSeverity === 'low')) {
        group.highestSeverity = a.severity;
      }
    } else {
      byKey.set(key, {
        station: a.station,
        lat: a.location.lat,
        lon: a.location.lon,
        alerts: [a],
        highestSeverity: a.severity,
      });
    }
  }

  const features: GeoJSON.Feature[] = [];
  for (const [, group] of byKey) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [group.lon, group.lat],
      },
      properties: {
        station: group.station,
        count: group.alerts.length,
        severity: group.highestSeverity,
        color: SEVERITY_COLORS[group.highestSeverity] ?? SEVERITY_COLORS.low,
        label: group.alerts.length > 1
          ? `${group.alerts.length}`
          : group.alerts[0].line,
        alertsJson: JSON.stringify(group.alerts.map((a) => ({
          line: a.line,
          type: a.type,
          severity: a.severity,
          message: a.message,
          detail: a.detail,
        }))),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

function buildPopupHtml(props: Record<string, unknown>): string {
  const alertsRaw = props.alertsJson as string;
  let alerts: Array<{ line: string; type: string; severity: string; message: string; detail: string }>;
  try {
    alerts = JSON.parse(alertsRaw);
  } catch {
    return '';
  }

  const station = props.station as string;
  const parts = [`<div style="font-size:13px;max-height:240px;overflow-y:auto">`];
  parts.push(`<div style="font-weight:600;margin-bottom:6px">${station}</div>`);

  for (const a of alerts) {
    const sevColor = SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.low;
    const typeLabel = a.type.replace('-', ' ');
    parts.push(
      `<div style="border-left:3px solid ${sevColor};padding-left:8px;margin-bottom:8px">` +
      `<strong>${a.line}</strong> <span style="opacity:0.6;font-size:11px">${typeLabel}</span><br>` +
      `<span style="font-size:12px">${a.detail}</span>` +
      `</div>`,
    );
  }

  parts.push(`</div>`);
  return parts.join('');
}

/** Snap a coordinate to a grid cell key (e.g. "52.51,13.38") */
function geoCell(lat: number, lon: number): string {
  const g = MAP_NEWS.spatialGridSize;
  return `${Math.floor(lat / g)},${Math.floor(lon / g)}`;
}

/**
 * Select the most important news items for map display.
 * 1. Guarantee the top N items from each category (so no category is invisible)
 * 2. Fill remaining slots by global importance ranking
 * 3. Cap at global max
 * 4. Spatial bonus: add items in grid cells not yet covered (up to bonus cap)
 */
function filterNewsForMap(items: NewsItem[], fallback: { lat: number; lon: number }): NewsItem[] {
  // Items already filtered by relevant_to_city on the server (applyDropLogic)
  const byImportance = [...items].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));

  // Group by category, each group already sorted by importance
  const byCategory = new Map<string, NewsItem[]>();
  for (const item of byImportance) {
    const list = byCategory.get(item.category);
    if (list) list.push(item);
    else byCategory.set(item.category, [item]);
  }

  // Phase 1: guarantee top N per category
  const picked = new Set<string>();
  for (const [, catItems] of byCategory) {
    for (let i = 0; i < Math.min(MAP_NEWS.guaranteedPerCategory, catItems.length); i++) {
      picked.add(catItems[i].id);
    }
  }

  // Phase 2: fill remaining slots by importance
  const resultSet = new Set<string>();
  const result: NewsItem[] = [];
  for (const item of byImportance) {
    if (result.length >= MAP_NEWS.maxTotal) break;
    if (picked.has(item.id)) {
      result.push(item);
      resultSet.add(item.id);
    }
  }
  for (const item of byImportance) {
    if (result.length >= MAP_NEWS.maxTotal) break;
    if (!resultSet.has(item.id)) {
      result.push(item);
      resultSet.add(item.id);
    }
  }

  // Phase 3: spatial bonus — add items that fill empty grid cells
  const coveredCells = new Set<string>();
  for (const item of result) {
    const loc = item.location ?? fallback;
    coveredCells.add(geoCell(loc.lat, loc.lon));
  }

  let bonus = 0;
  for (const item of byImportance) {
    if (bonus >= MAP_NEWS.spatialBonusMax) break;
    if (resultSet.has(item.id)) continue;
    const loc = item.location ?? fallback;
    const cell = geoCell(loc.lat, loc.lon);
    if (coveredCells.has(cell)) continue;
    coveredCells.add(cell);
    result.push(item);
    resultSet.add(item.id);
    bonus++;
  }

  return result;
}

function newsToGeoJSON(items: NewsItem[], fallback: { lat: number; lon: number }, categoryLabel: (cat: string) => string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const item of items) {
    const loc = item.location ?? fallback;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
      properties: {
        title: item.title,
        category: item.category,
        categoryLabel: categoryLabel(item.category),
        sourceName: item.sourceName,
        url: item.url,
        color: NEWS_CATEGORY_COLORS[item.category] ?? '#6366f1',
        locationLabel: item.location?.label ?? '',
        importance: item.importance ?? 0,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function safetyToGeoJSON(reports: SafetyReport[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const report of reports) {
    if (!report.location) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [report.location.lon, report.location.lat] },
      properties: {
        title: report.title,
        district: report.district ?? '',
        url: report.url,
        locationLabel: report.location.label ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// Interactive spiderify: click a heap of stacked markers to scatter them
// outward with connecting legs. Click elsewhere to collapse.
// ---------------------------------------------------------------------------

const SPIDER_BASE_RADIUS = 0.003; // ~300m base
const SPIDER_PER_ITEM = 0.0008;   // extra ~80m per item so large groups spread further

interface SpiderState {
  groups: Map<string, number[]>;       // groupKey → feature indices
  origCoords: Map<number, [number, number]>;
  expandedKey: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface SpiderHandlerSet { handlers: Array<{ event: string; layer?: string; fn: any }> }

const _newsSpider: SpiderState = { groups: new Map(), origCoords: new Map(), expandedKey: null };
const _newsH: SpiderHandlerSet = { handlers: [] };
const _safetySpider: SpiderState = { groups: new Map(), origCoords: new Map(), expandedKey: null };
const _safetyH: SpiderHandlerSet = { handlers: [] };

function cleanupSpiderHandlers(map: maplibregl.Map, hset: SpiderHandlerSet) {
  for (const h of hset.handlers) {
    if (h.layer) map.off(h.event as 'click', h.layer, h.fn);
    else map.off(h.event as 'click', h.fn);
  }
  hset.handlers = [];
}

/** Tag features with group info and store original coordinates */
function initSpiderState(fc: GeoJSON.FeatureCollection, state: SpiderState) {
  const previousKey = state.expandedKey;
  state.groups.clear();
  state.origCoords.clear();
  state.expandedKey = null;

  for (let i = 0; i < fc.features.length; i++) {
    const coords = (fc.features[i].geometry as GeoJSON.Point).coordinates;
    const key = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`;
    state.origCoords.set(i, [coords[0], coords[1]]);
    if (!state.groups.has(key)) state.groups.set(key, []);
    state.groups.get(key)!.push(i);
    fc.features[i].properties!._groupKey = key;
    fc.features[i].properties!._isExpanded = 0;
  }
  for (const [, indices] of state.groups) {
    for (const idx of indices) fc.features[idx].properties!._groupSize = indices.length;
  }
  // Restore expansion if the group key still exists after data refresh
  if (previousKey && state.groups.has(previousKey)) {
    state.expandedKey = previousKey;
  }
}

/** Compute positions + spider leg lines based on current expansion state */
function computeSpiderPositions(
  features: GeoJSON.Feature[],
  state: SpiderState,
): GeoJSON.FeatureCollection {
  const lineFeatures: GeoJSON.Feature[] = [];
  for (const [key, indices] of state.groups) {
    if (indices.length <= 1) continue;
    const orig = state.origCoords.get(indices[0])!;
    const expanded = state.expandedKey === key;
    const radius = SPIDER_BASE_RADIUS + SPIDER_PER_ITEM * indices.length;

    for (let j = 0; j < indices.length; j++) {
      const feat = features[indices[j]];
      feat.properties!._isExpanded = expanded ? 1 : 0;
      if (expanded) {
        const angle = (2 * Math.PI * j) / indices.length - Math.PI / 2;
        const lon = orig[0] + radius * Math.cos(angle);
        const lat = orig[1] + radius * Math.sin(angle);
        (feat.geometry as GeoJSON.Point).coordinates = [lon, lat];
        lineFeatures.push({
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [[orig[0], orig[1]], [lon, lat]] },
        });
      } else {
        // Collapse back to original
        (feat.geometry as GeoJSON.Point).coordinates = [orig[0], orig[1]];
      }
    }
  }
  return { type: 'FeatureCollection', features: lineFeatures };
}

function updateSpiderSources(
  map: maplibregl.Map,
  features: GeoJSON.Feature[],
  state: SpiderState,
  pointSourceId: string,
  lineSourceId: string,
) {
  const lines = computeSpiderPositions(features, state);
  const pointSrc = map.getSource(pointSourceId) as maplibregl.GeoJSONSource | undefined;
  const lineSrc = map.getSource(lineSourceId) as maplibregl.GeoJSONSource | undefined;
  if (pointSrc) pointSrc.setData({ type: 'FeatureCollection', features });
  if (lineSrc) lineSrc.setData(lines);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addSpiderHandler(map: maplibregl.Map, hset: SpiderHandlerSet, event: string, layerOrFn: string | ((...a: any[]) => void), fn?: (...a: any[]) => void) {
  if (typeof layerOrFn === 'string') {
    map.on(event as 'click', layerOrFn, fn!);
    hset.handlers.push({ event, layer: layerOrFn, fn: fn! });
  } else {
    map.on(event as 'click', layerOrFn);
    hset.handlers.push({ event, fn: layerOrFn });
  }
}

function updateNewsMarkers(map: maplibregl.Map, items: NewsItem[], _isDark: boolean, fallback: { lat: number; lon: number }, categoryLabel: (cat: string) => string) {
  const geojson = newsToGeoJSON(items, fallback, categoryLabel);

  cleanupSpiderHandlers(map, _newsH);
  for (const id of ['news-marker-count', 'news-marker-label', 'news-marker-circle', 'news-marker-icon', 'news-spider-lines']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('news-markers')) map.removeSource('news-markers');
  if (map.getSource('news-spider-lines')) map.removeSource('news-spider-lines');

  if (geojson.features.length === 0) return;

  initSpiderState(geojson, _newsSpider);

  // Empty line source (populated on expansion)
  map.addSource('news-spider-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'news-spider-lines',
    type: 'line',
    source: 'news-spider-lines',
    paint: { 'line-color': '#6366f1', 'line-width': 1.5, 'line-opacity': 0.5 },
  });

  map.addSource('news-markers', { type: 'geojson', data: geojson });

  const iconMatch: unknown[] = ['match', ['get', 'category']];
  for (const cat of Object.keys(NEWS_CATEGORY_COLORS)) {
    iconMatch.push(cat, `news-icon-${cat}`);
  }
  iconMatch.push('news-icon-local');

  map.addLayer({
    id: 'news-marker-icon',
    type: 'symbol',
    source: 'news-markers',
    layout: {
      'icon-image': iconMatch as maplibregl.ExpressionSpecification,
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  // Count badge for stacked groups (hidden when expanded)
  map.addLayer({
    id: 'news-marker-count',
    type: 'symbol',
    source: 'news-markers',
    filter: ['all', ['>', ['get', '_groupSize'], 1], ['==', ['get', '_isExpanded'], 0]],
    layout: {
      'text-field': ['concat', '+', ['to-string', ['-', ['get', '_groupSize'], 1]]],
      'text-size': 10,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-offset': [0.9, -0.9],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#6366f1',
      'text-halo-width': 1.5,
    },
  });

  // Keep a ref to features array for source updates
  const features = geojson.features;
  let justExpanded = false;

  // Click: expand group or show popup
  addSpiderHandler(map, _newsH, 'click', 'news-marker-icon', (e: maplibregl.MapMouseEvent) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['news-marker-icon'] });
    if (!f.length) return;
    const groupKey = f[0].properties!._groupKey as string;
    const groupSize = f[0].properties!._groupSize as number;

    if (groupSize > 1 && _newsSpider.expandedKey !== groupKey) {
      _newsSpider.expandedKey = groupKey;
      updateSpiderSources(map, features, _newsSpider, 'news-markers', 'news-spider-lines');
      justExpanded = true;
      return;
    }
    // Individual or already-expanded marker — popup handled below
  });

  // Hover
  addSpiderHandler(map, _newsH, 'mouseenter', 'news-marker-icon', (e: maplibregl.MapMouseEvent) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = map.queryRenderedFeatures(e.point, { layers: ['news-marker-icon'] });
    if (!f.length) return;
    const props = f[0].properties!;
    const coords = (f[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const groupKey = props._groupKey as string;
    const groupSize = props._groupSize as number;

    if (groupSize > 1 && _newsSpider.expandedKey !== groupKey) {
      showMapPopup(map, coords, `<div style="font-size:12px;padding:2px 6px">${groupSize} items &middot; click to expand</div>`, { sticky: false });
    } else {
      const imp = Number(props.importance) || 0;
      const html = `<div style="font-size:13px;max-width:280px">
        <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
        <div style="opacity:0.6;font-size:11px">${props.sourceName} · ${props.categoryLabel}${imp ? ` · ${Math.round(imp * 100)}%` : ''}</div>
        ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
        <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Read more →</a>
      </div>`;
      showMapPopup(map, coords, html, { sticky: false });
    }
  });

  addSpiderHandler(map, _newsH, 'mouseleave', 'news-marker-icon', () => {
    map.getCanvas().style.cursor = '';
    _clearHoverTimer();
    _hoverTimer = setTimeout(_closeHoverPopup, 300);
  });

  // Sticky popup on click (only if not expanding)
  addSpiderHandler(map, _newsH, 'click', 'news-marker-icon', (e: maplibregl.MapMouseEvent) => {
    if (justExpanded) { justExpanded = false; return; }
    const f = map.queryRenderedFeatures(e.point, { layers: ['news-marker-icon'] });
    if (!f.length) return;
    const props = f[0].properties!;
    const groupSize = props._groupSize as number;
    const groupKey = props._groupKey as string;
    if (groupSize > 1 && _newsSpider.expandedKey !== groupKey) return; // handled by expand
    const coords = (f[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const imp = Number(props.importance) || 0;
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
      <div style="opacity:0.6;font-size:11px">${props.sourceName} · ${props.categoryLabel}${imp ? ` · ${Math.round(imp * 100)}%` : ''}</div>
      ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
      <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Read more →</a>
    </div>`;
    showMapPopup(map, coords, html, { sticky: true });
  });

  // Collapse on map background click (check both marker layers)
  addSpiderHandler(map, _newsH, 'click', (e: maplibregl.MapMouseEvent) => {
    if (!_newsSpider.expandedKey) return;
    const f = map.queryRenderedFeatures(e.point, { layers: ['news-marker-icon', 'safety-marker-icon'].filter(id => !!map.getLayer(id)) });
    if (f.length > 0) return; // clicked a marker, not background
    _newsSpider.expandedKey = null;
    updateSpiderSources(map, features, _newsSpider, 'news-markers', 'news-spider-lines');
  });
}

function updateSafetyMarkers(map: maplibregl.Map, reports: SafetyReport[], _isDark: boolean) {
  const geojson = safetyToGeoJSON(reports);

  cleanupSpiderHandlers(map, _safetyH);
  for (const id of ['safety-marker-count', 'safety-marker-label', 'safety-marker-circle', 'safety-marker-icon', 'safety-spider-lines']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('safety-markers')) map.removeSource('safety-markers');
  if (map.getSource('safety-spider-lines')) map.removeSource('safety-spider-lines');

  if (geojson.features.length === 0) return;

  initSpiderState(geojson, _safetySpider);

  map.addSource('safety-spider-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'safety-spider-lines',
    type: 'line',
    source: 'safety-spider-lines',
    paint: { 'line-color': '#ef4444', 'line-width': 1.5, 'line-opacity': 0.5 },
  });

  map.addSource('safety-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'safety-marker-icon',
    type: 'symbol',
    source: 'safety-markers',
    layout: {
      'icon-image': 'safety-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  // Count badge for stacked groups (hidden when expanded)
  map.addLayer({
    id: 'safety-marker-count',
    type: 'symbol',
    source: 'safety-markers',
    filter: ['all', ['>', ['get', '_groupSize'], 1], ['==', ['get', '_isExpanded'], 0]],
    layout: {
      'text-field': ['concat', '+', ['to-string', ['-', ['get', '_groupSize'], 1]]],
      'text-size': 10,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-offset': [0.9, -0.9],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#ef4444',
      'text-halo-width': 1.5,
    },
  });

  const features = geojson.features;
  let justExpanded = false;

  addSpiderHandler(map, _safetyH, 'click', 'safety-marker-icon', (e: maplibregl.MapMouseEvent) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['safety-marker-icon'] });
    if (!f.length) return;
    const groupKey = f[0].properties!._groupKey as string;
    const groupSize = f[0].properties!._groupSize as number;

    if (groupSize > 1 && _safetySpider.expandedKey !== groupKey) {
      _safetySpider.expandedKey = groupKey;
      updateSpiderSources(map, features, _safetySpider, 'safety-markers', 'safety-spider-lines');
      justExpanded = true;
      return;
    }
  });

  addSpiderHandler(map, _safetyH, 'mouseenter', 'safety-marker-icon', (e: maplibregl.MapMouseEvent) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = map.queryRenderedFeatures(e.point, { layers: ['safety-marker-icon'] });
    if (!f.length) return;
    const props = f[0].properties!;
    const coords = (f[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const groupKey = props._groupKey as string;
    const groupSize = props._groupSize as number;

    if (groupSize > 1 && _safetySpider.expandedKey !== groupKey) {
      showMapPopup(map, coords, `<div style="font-size:12px;padding:2px 6px">${groupSize} reports &middot; click to expand</div>`, { sticky: false });
    } else {
      const html = `<div style="font-size:13px;max-width:280px">
        <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
        ${props.district ? `<div style="opacity:0.6;font-size:11px">${props.district}</div>` : ''}
        ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
        <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Details →</a>
      </div>`;
      showMapPopup(map, coords, html, { sticky: false });
    }
  });

  addSpiderHandler(map, _safetyH, 'mouseleave', 'safety-marker-icon', () => {
    map.getCanvas().style.cursor = '';
    _clearHoverTimer();
    _hoverTimer = setTimeout(_closeHoverPopup, 300);
  });

  addSpiderHandler(map, _safetyH, 'click', 'safety-marker-icon', (e: maplibregl.MapMouseEvent) => {
    if (justExpanded) { justExpanded = false; return; }
    const f = map.queryRenderedFeatures(e.point, { layers: ['safety-marker-icon'] });
    if (!f.length) return;
    const props = f[0].properties!;
    const groupSize = props._groupSize as number;
    const groupKey = props._groupKey as string;
    if (groupSize > 1 && _safetySpider.expandedKey !== groupKey) return;
    const coords = (f[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
      ${props.district ? `<div style="opacity:0.6;font-size:11px">${props.district}</div>` : ''}
      ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
      <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Details →</a>
    </div>`;
    showMapPopup(map, coords, html, { sticky: true });
  });

  addSpiderHandler(map, _safetyH, 'click', (e: maplibregl.MapMouseEvent) => {
    if (!_safetySpider.expandedKey) return;
    const f = map.queryRenderedFeatures(e.point, { layers: ['safety-marker-icon', 'news-marker-icon'].filter(id => !!map.getLayer(id)) });
    if (f.length > 0) return;
    _safetySpider.expandedKey = null;
    updateSpiderSources(map, features, _safetySpider, 'safety-markers', 'safety-spider-lines');
  });
}

const NINA_SEVERITY_COLORS: Record<string, string> = {
  extreme: 'rgba(220, 38, 38, 0.3)',
  severe: 'rgba(239, 68, 68, 0.25)',
  moderate: 'rgba(245, 158, 11, 0.2)',
  minor: 'rgba(234, 179, 8, 0.15)',
};

function warningsToGeoJSON(warnings: NinaWarning[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const w of warnings) {
    if (!w.area) continue;
    const area = w.area as GeoJSON.Feature | GeoJSON.FeatureCollection;
    if (area.type === 'FeatureCollection') {
      for (const f of (area as GeoJSON.FeatureCollection).features) {
        features.push({
          ...f,
          properties: {
            ...f.properties,
            warningId: w.id,
            headline: w.headline,
            severity: w.severity,
            fillColor: NINA_SEVERITY_COLORS[w.severity] ?? NINA_SEVERITY_COLORS.minor,
          },
        });
      }
    } else if (area.type === 'Feature') {
      features.push({
        ...(area as GeoJSON.Feature),
        properties: {
          ...(area as GeoJSON.Feature).properties,
          warningId: w.id,
          headline: w.headline,
          severity: w.severity,
          fillColor: NINA_SEVERITY_COLORS[w.severity] ?? NINA_SEVERITY_COLORS.minor,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

// Social Atlas 2023 choropleth — 536 Planungsräume colored by composite status index
const SOCIAL_ATLAS_COLORS: Record<number, string> = {
  1: '#22c55e', // hoch (high social status) — green
  2: '#eab308', // mittel — yellow
  3: '#f97316', // niedrig — orange
  4: '#ef4444', // sehr niedrig — red
};

function updateSocialAtlasLayer(map: maplibregl.Map, geojson: GeoJSON.FeatureCollection | null, isDark: boolean) {
  for (const id of ['social-atlas-fill', 'social-atlas-line']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('social-atlas-areas')) map.removeSource('social-atlas-areas');

  if (!geojson || geojson.features.length === 0) return;

  map.addSource('social-atlas-areas', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'social-atlas-fill',
    type: 'fill',
    source: 'social-atlas-areas',
    paint: {
      'fill-color': [
        'match', ['get', 'statusIndex'],
        1, SOCIAL_ATLAS_COLORS[1],
        2, SOCIAL_ATLAS_COLORS[2],
        3, SOCIAL_ATLAS_COLORS[3],
        4, SOCIAL_ATLAS_COLORS[4],
        '#9ca3af', // fallback gray
      ],
      'fill-opacity': isDark ? 0.35 : 0.4,
    },
  });

  map.addLayer({
    id: 'social-atlas-line',
    type: 'line',
    source: 'social-atlas-areas',
    paint: {
      'line-color': isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
      'line-width': 0.5,
    },
  });

  function buildSocialAtlasPopup(p: SocialAtlasFeatureProps): string {
    const statusColor = SOCIAL_ATLAS_COLORS[p.statusIndex] ?? '#9ca3af';
    return `<div style="font-size:13px;max-width:300px">
      <div style="font-weight:600;margin-bottom:6px">${p.plrName}</div>
      <div style="display:inline-block;padding:2px 8px;border-radius:4px;background:${statusColor};color:#fff;font-size:11px;font-weight:500;margin-bottom:6px">${p.statusLabel}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr><td style="padding:2px 0;opacity:0.7">Unemployment</td><td style="text-align:right;font-weight:500">${p.unemployment?.toFixed(1) ?? '–'}%</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Single-parent HH</td><td style="text-align:right;font-weight:500">${p.singleParent?.toFixed(1) ?? '–'}%</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Welfare recipients</td><td style="text-align:right;font-weight:500">${p.welfare?.toFixed(1) ?? '–'}%</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Child poverty</td><td style="text-align:right;font-weight:500">${p.childPoverty?.toFixed(1) ?? '–'}%</td></tr>
      </table>
    </div>`;
  }

  // Use mousemove (not mouseenter) so the popup updates when moving between
  // adjacent polygons — mouseenter only fires once per layer, not per feature.
  let hoveredPlrId: string | null = null;

  map.on('mousemove', 'social-atlas-fill', (e) => {
    const me = e as MapLayerEvent;
    if (!me.features?.length) return;
    const p = me.features[0].properties as unknown as SocialAtlasFeatureProps;
    if (p.plrId === hoveredPlrId) return; // same area — skip
    hoveredPlrId = p.plrId;
    map.getCanvas().style.cursor = 'pointer';
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], buildSocialAtlasPopup(p), { sticky: false });
  });

  map.on('mouseleave', 'social-atlas-fill', () => {
    map.getCanvas().style.cursor = '';
    hoveredPlrId = null;
    _clearHoverTimer();
    _hoverTimer = setTimeout(_closeHoverPopup, 300);
  });

  map.on('click', 'social-atlas-fill', (e) => {
    const me = e as MapLayerEvent;
    if (!me.features?.length) return;
    const p = me.features[0].properties as unknown as SocialAtlasFeatureProps;
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], buildSocialAtlasPopup(p), { sticky: true });
  });
}

function updateWarningPolygons(map: maplibregl.Map, warnings: NinaWarning[], _isDark: boolean) {
  const geojson = warningsToGeoJSON(warnings);

  for (const id of ['warning-fill', 'warning-line']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('warning-areas')) map.removeSource('warning-areas');

  if (geojson.features.length === 0) return;

  map.addSource('warning-areas', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'warning-fill',
    type: 'fill',
    source: 'warning-areas',
    paint: {
      'fill-color': ['get', 'fillColor'],
      'fill-opacity': 1,
    },
  });

  map.addLayer({
    id: 'warning-line',
    type: 'line',
    source: 'warning-areas',
    paint: {
      'line-color': '#ef4444',
      'line-width': 1.5,
      'line-opacity': 0.6,
    },
  });

  registerPopupHandlers(map, 'warning-fill', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.headline}</div>
      <div style="opacity:0.6;font-size:11px">${props.severity}</div>
    </div>`;
    return { html, lngLat: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
  });
}

/** Format "2026-03-03T09:00:00" range into e.g. "Today 09:00 – Tomorrow 09:00" or "3 Mar 09:00 – 4 Mar 09:00" */
function formatPharmacyDuty(from: string, until: string): string {
  const fmt = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (target.getTime() === today.getTime()) return `Today ${time}`;
    if (target.getTime() === tomorrow.getTime()) return `Tomorrow ${time}`;
    const day = d.getDate();
    const mon = d.toLocaleString([], { month: 'short' });
    return `${day} ${mon} ${time}`;
  };
  return `${fmt(from)} – ${fmt(until)}`;
}

function pharmaciesToGeoJSON(pharmacies: EmergencyPharmacy[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of pharmacies) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.location.lon, p.location.lat] },
      properties: {
        name: p.name,
        address: p.address,
        phone: p.phone ?? '',
        validFrom: p.validFrom,
        validUntil: p.validUntil,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function aedsToGeoJSON(aeds: AedLocation[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const a of aeds) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: {
        id: a.id,
        indoor: a.indoor,
        description: a.description ?? '',
        operator: a.operator ?? '',
        openingHours: a.openingHours ?? '',
        access: a.access ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

const TRAFFIC_SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  major: '#f97316',
  moderate: '#eab308',
  low: '#84cc16',
};

function trafficToGeoJSON(incidents: TrafficIncident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const inc of incidents) {
    if (!inc.geometry?.coordinates?.length) continue;
    features.push({
      type: 'Feature',
      geometry: inc.geometry as GeoJSON.Geometry,
      properties: {
        id: inc.id,
        type: inc.type,
        severity: inc.severity,
        description: inc.description,
        road: inc.road ?? '',
        from: inc.from ?? '',
        to: inc.to ?? '',
        delay: inc.delay ?? 0,
        color: TRAFFIC_SEVERITY_COLORS[inc.severity] ?? TRAFFIC_SEVERITY_COLORS.low,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function updateTrafficLayers(map: maplibregl.Map, incidents: TrafficIncident[], _isDark: boolean) {
  const geojson = trafficToGeoJSON(incidents);

  for (const id of ['traffic-line', 'traffic-line-casing']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('traffic-incidents')) map.removeSource('traffic-incidents');

  if (geojson.features.length === 0) return;

  map.addSource('traffic-incidents', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'traffic-line-casing',
    type: 'line',
    source: 'traffic-incidents',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#000000',
      'line-width': 6,
      'line-opacity': 0.3,
    },
  });

  map.addLayer({
    id: 'traffic-line',
    type: 'line',
    source: 'traffic-incidents',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 4,
      'line-opacity': 0.8,
    },
  });

  registerPopupHandlers(map, 'traffic-line', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const delayMin = props.delay ? Math.round(Number(props.delay) / 60) : 0;
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.type}${props.road ? ` — ${props.road}` : ''}</div>
      ${props.description ? `<div style="font-size:12px">${props.description}</div>` : ''}
      ${props.from && props.to ? `<div style="font-size:11px;opacity:0.6;margin-top:2px">${props.from} → ${props.to}</div>` : ''}
      ${delayMin > 0 ? `<div style="font-size:11px;margin-top:2px">Delay: ~${delayMin} min</div>` : ''}
    </div>`;
    return { html, lngLat: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
  });

  raiseTransitLayers(map);
}

/** Move transit marker layers above traffic/construction so they're not hidden. */
function raiseTransitLayers(map: maplibregl.Map) {
  for (const id of ['transit-marker-icon', 'transit-marker-label']) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

// --------------- Construction / Roadworks ---------------

function constructionToGeoJSON(sites: ConstructionSite[]): { lines: GeoJSON.FeatureCollection; points: GeoJSON.FeatureCollection } {
  const lines: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  for (const site of sites) {
    const color = CONSTRUCTION_SUBTYPE_COLORS[site.subtype] ?? CONSTRUCTION_SUBTYPE_COLORS.construction;
    const props = {
      id: site.id,
      subtype: site.subtype,
      street: site.street,
      section: site.section ?? '',
      description: site.description,
      direction: site.direction ?? '',
      validFrom: site.validFrom ?? '',
      validUntil: site.validUntil ?? '',
      color,
      iconImage: `construction-icon-${site.subtype}`,
    };

    const geomType = site.geometry?.type;
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
      lines.push({ type: 'Feature', geometry: site.geometry as GeoJSON.Geometry, properties: props });
    } else if (geomType === 'Point') {
      points.push({ type: 'Feature', geometry: site.geometry as GeoJSON.Geometry, properties: props });
    } else if (geomType === 'GeometryCollection') {
      // VIZ sometimes returns GeometryCollection with Point + LineStrings
      const gc = site.geometry as unknown as { geometries: GeoJSON.Geometry[] };
      for (const g of gc.geometries ?? []) {
        if (g.type === 'LineString' || g.type === 'MultiLineString') {
          lines.push({ type: 'Feature', geometry: g, properties: props });
        } else if (g.type === 'Point') {
          points.push({ type: 'Feature', geometry: g, properties: props });
        }
      }
    }
  }
  return {
    lines: { type: 'FeatureCollection', features: lines },
    points: { type: 'FeatureCollection', features: points },
  };
}

function updateConstructionLayers(map: maplibregl.Map, sites: ConstructionSite[], _isDark: boolean) {
  const { lines, points } = constructionToGeoJSON(sites);

  for (const id of ['construction-line', 'construction-line-casing', 'construction-points']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('construction-lines')) map.removeSource('construction-lines');
  if (map.getSource('construction-points')) map.removeSource('construction-points');

  if (lines.features.length === 0 && points.features.length === 0) return;

  if (lines.features.length > 0) {
    map.addSource('construction-lines', { type: 'geojson', data: lines });

    map.addLayer({
      id: 'construction-line-casing',
      type: 'line',
      source: 'construction-lines',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000000', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 13, 3, 15, 5, 17, 8], 'line-opacity': 0.2 },
    });

    map.addLayer({
      id: 'construction-line',
      type: 'line',
      source: 'construction-lines',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 2, 15, 3.5, 17, 6],
        'line-opacity': 0.7,
        'line-dasharray': [4, 3],
      },
    });

    registerPopupHandlers(map, 'construction-line', (e) => {
      if (!e.features?.length) return null;
      const p = e.features[0].properties!;
      return { html: constructionPopupHtml(p), lngLat: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
    });
  }

  if (points.features.length > 0) {
    map.addSource('construction-points', { type: 'geojson', data: points });

    map.addLayer({
      id: 'construction-points',
      type: 'symbol',
      source: 'construction-points',
      layout: {
        'icon-image': ['get', 'iconImage'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.15, 13, 0.45, 15, 0.8, 17, 1.2],
        'icon-allow-overlap': true,
      },
    });

    registerPopupHandlers(map, 'construction-points', (e) => {
      if (!e.features?.length) return null;
      const p = e.features[0].properties!;
      return { html: constructionPopupHtml(p), lngLat: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
    });
  }

  raiseTransitLayers(map);
}

function constructionPopupHtml(p: Record<string, unknown>): string {
  const subtypeLabel = String(p.subtype ?? '').replace(/^./, (c: string) => c.toUpperCase());
  return `<div style="font-size:13px;max-width:280px">
    <div style="font-weight:600;margin-bottom:4px">${subtypeLabel}: ${p.street}</div>
    ${p.section ? `<div style="font-size:12px;opacity:0.7">${p.section}</div>` : ''}
    ${p.description ? `<div style="font-size:12px;margin-top:2px">${p.description}</div>` : ''}
    ${p.validFrom ? `<div style="font-size:11px;opacity:0.6;margin-top:4px">${p.validFrom}${p.validUntil ? ` – ${p.validUntil}` : ''}</div>` : ''}
    ${p.direction ? `<div style="font-size:11px;opacity:0.6">${p.direction}</div>` : ''}
  </div>`;
}

// --------------- Air Quality Grid ---------------

function aqGridToGeoJSON(points: AirQualityGridPoint[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of points) {
    const level = getAqiLevel(p.europeanAqi);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        aqi: p.europeanAqi,
        station: p.station,
        color: level.color,
        level: level.label,
        label: String(p.europeanAqi),
        url: p.url ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function updateAqGridLayer(map: maplibregl.Map, points: AirQualityGridPoint[], isDark: boolean) {
  const geojson = aqGridToGeoJSON(points);

  for (const id of ['aq-marker-label', 'aq-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('aq-grid')) map.removeSource('aq-grid');

  if (geojson.features.length === 0) return;

  map.addSource('aq-grid', { type: 'geojson', data: geojson });

  // Build match expression: AQI level → aq-icon-{level}
  const iconMatch: unknown[] = ['match', ['get', 'level']];
  for (const level of Object.keys(AQI_LEVEL_COLORS)) {
    iconMatch.push(level, `aq-icon-${level}`);
  }
  iconMatch.push('aq-icon-good'); // fallback

  map.addLayer({
    id: 'aq-marker-icon',
    type: 'symbol',
    source: 'aq-grid',
    layout: {
      'icon-image': iconMatch as maplibregl.ExpressionSpecification,
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  map.addLayer({
    id: 'aq-marker-label',
    type: 'symbol',
    source: 'aq-grid',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 9,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-offset': [0, 2.8],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
      'text-halo-color': isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
      'text-halo-width': 1,
    },
  });

  const getAqContent: PopupContentFn = (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const level = getAqiLevel(Number(props.aqi));
    const linkIcon = props.url
      ? ` <a href="${props.url}" target="_blank" rel="noopener" style="display:inline;color:#3b82f6;text-decoration:none;margin-left:3px;vertical-align:middle"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
      : '';
    const html = `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:4px">${props.station}${linkIcon}</div>
      <div style="font-size:12px">AQI: <strong style="color:${level.color}">${props.aqi}</strong> (${level.label})</div>
    </div>`;
    return { html, lngLat: coords };
  };
  registerPopupHandlers(map, 'aq-marker-icon', getAqContent, { offset: 12, maxWidth: '260px' });
  registerPopupHandlers(map, 'aq-marker-label', getAqContent, { offset: 12, maxWidth: '260px' });
}

function waterLevelsToGeoJSON(stations: WaterLevelStation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations
      .filter((s) => s.lat && s.lon)
      .map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: {
          uuid: s.uuid,
          name: s.name,
          waterBody: s.waterBody,
          currentLevel: s.currentLevel,
          state: s.state,
          tidal: s.tidal,
        },
      })),
  };
}

function updateWaterLevelMarkers(map: maplibregl.Map, stations: WaterLevelStation[], isDark: boolean) {
  const geojson = waterLevelsToGeoJSON(stations);

  for (const id of ['wl-marker-label', 'wl-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('wl-markers')) map.removeSource('wl-markers');

  if (geojson.features.length === 0) return;

  map.addSource('wl-markers', { type: 'geojson', data: geojson });

  // Icon colored by water level state
  const iconMatch: unknown[] = ['match', ['get', 'state']];
  for (const state of Object.keys(WATER_STATE_COLORS)) {
    iconMatch.push(state, `wl-icon-${state}`);
  }
  iconMatch.push('wl-icon-unknown'); // fallback

  map.addLayer({
    id: 'wl-marker-icon',
    type: 'symbol',
    source: 'wl-markers',
    layout: {
      'icon-image': iconMatch as maplibregl.ExpressionSpecification,
      'icon-size': 0.95,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  map.addLayer({
    id: 'wl-marker-label',
    type: 'symbol',
    source: 'wl-markers',
    layout: {
      'text-field': ['concat', ['to-string', ['get', 'currentLevel']], ' cm'],
      'text-size': 10,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-offset': [0, 2.5],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
      'text-halo-color': isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
      'text-halo-width': 1,
    },
  });

  registerPopupHandlers(map, 'wl-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const stateColor = WATER_STATE_COLORS[props.state as string] ?? WATER_STATE_COLORS.unknown;
    const stateLabel = (props.state as string).replace('_', ' ');
    const html = `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:4px">${props.name}</div>
      <div style="font-size:12px;opacity:0.7">${props.waterBody}${props.tidal === 'true' || props.tidal === true ? ' (tidal)' : ''}</div>
      <div style="font-size:12px;margin-top:4px">Level: <strong style="color:${stateColor}">${props.currentLevel} cm</strong></div>
      <div style="font-size:11px;margin-top:2px;text-transform:capitalize;color:${stateColor}">${stateLabel}</div>
    </div>`;
    return { html, lngLat: coords };
  });
}

function updatePharmacyMarkers(map: maplibregl.Map, pharmacies: EmergencyPharmacy[], _isDark: boolean) {
  const geojson = pharmaciesToGeoJSON(pharmacies);

  for (const id of ['pharmacy-marker-label', 'pharmacy-marker-circle', 'pharmacy-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('pharmacy-markers')) map.removeSource('pharmacy-markers');

  if (geojson.features.length === 0) return;

  map.addSource('pharmacy-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'pharmacy-marker-icon',
    type: 'symbol',
    source: 'pharmacy-markers',
    minzoom: MAP_DENSITY.pharmacyMinZoom,
    layout: {
      'icon-image': 'pharmacy-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'pharmacy-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const [lon, lat] = coords;
    const dutyLabel = formatPharmacyDuty(props.validFrom, props.validUntil);
    const osmUrl = `https://www.openstreetmap.org/directions?route=;${lat},${lon}`;
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.name}</div>
      <div style="font-size:12px">${props.address}</div>
      ${props.phone ? `<div style="font-size:12px;margin-top:2px">Tel: ${props.phone}</div>` : ''}
      <div style="font-size:11px;opacity:0.6;margin-top:4px">${dutyLabel}</div>
      <a href="${osmUrl}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">Directions ↗</a>
    </div>`;
    return { html, lngLat: coords };
  });
}

function updateAedMarkers(map: maplibregl.Map, aeds: AedLocation[], _isDark: boolean) {
  const geojson = aedsToGeoJSON(aeds);

  for (const id of ['aed-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('aed-markers')) map.removeSource('aed-markers');

  if (geojson.features.length === 0) return;

  map.addSource('aed-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'aed-marker-icon',
    type: 'symbol',
    source: 'aed-markers',
    minzoom: MAP_DENSITY.aedMinZoom,
    layout: {
      'icon-image': 'aed-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'aed-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const [lon, lat] = coords;
    const indoorBadge = props.indoor === true || props.indoor === 'true'
      ? '<span style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">Indoor</span>'
      : '<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">Outdoor</span>';
    const accessLabel = props.access ? `<div style="font-size:11px;opacity:0.6">Access: ${props.access}</div>` : '';
    const osmUrl = `https://www.openstreetmap.org/directions?route=;${lat},${lon}`;
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">AED / Defibrillator${indoorBadge}</div>
      ${props.description ? `<div style="font-size:12px">${props.description}</div>` : ''}
      ${props.operator ? `<div style="font-size:12px;margin-top:2px">${props.operator}</div>` : ''}
      ${props.openingHours ? `<div style="font-size:11px;opacity:0.6;margin-top:2px">${props.openingHours}</div>` : ''}
      ${accessLabel}
      <a href="${osmUrl}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">Directions ↗</a>
    </div>`;
    return { html, lngLat: coords };
  });
}

function bathingToGeoJSON(spots: BathingSpot[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots
      .filter((s) => s.lat != null && s.lon != null)
      .map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id,
          name: s.name,
          district: s.district,
          waterBody: s.waterBody,
          measuredAt: s.measuredAt,
          waterTemp: s.waterTemp,
          visibility: s.visibility,
          quality: s.quality,
          algae: s.algae,
          advisory: s.advisory,
          classification: s.classification,
          detailUrl: s.detailUrl,
          inSeason: s.inSeason,
        },
      })),
  };
}

function updateBathingMarkers(map: maplibregl.Map, spots: BathingSpot[], _isDark: boolean) {
  const geojson = bathingToGeoJSON(spots);

  for (const id of ['bathing-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('bathing-markers')) map.removeSource('bathing-markers');

  if (geojson.features.length === 0) return;

  map.addSource('bathing-markers', { type: 'geojson', data: geojson });

  const iconMatch: unknown[] = ['match', ['get', 'quality']];
  for (const q of Object.keys(BATHING_QUALITY_COLORS)) {
    iconMatch.push(q, `bathing-icon-${q}`);
  }
  iconMatch.push('bathing-icon-good'); // fallback

  map.addLayer({
    id: 'bathing-marker-icon',
    type: 'symbol',
    source: 'bathing-markers',
    layout: {
      'icon-image': iconMatch as maplibregl.ExpressionSpecification,
      'icon-size': 0.9,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  registerPopupHandlers(map, 'bathing-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const qColor = BATHING_QUALITY_COLORS[props.quality as string] ?? BATHING_QUALITY_COLORS.good;
    const qLabel = (props.quality as string).charAt(0).toUpperCase() + (props.quality as string).slice(1);
    const seasonBadge = props.inSeason === true || props.inSeason === 'true'
      ? ''
      : '<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">Off-season</span>';
    const tempLine = props.waterTemp != null && props.waterTemp !== 'null'
      ? `<div style="font-size:12px;margin-top:4px">Water temp: <strong>${esc(String(props.waterTemp))}°C</strong></div>` : '';
    const visLine = props.visibility != null && props.visibility !== 'null'
      ? `<div style="font-size:12px">Visibility: ${esc(String(props.visibility))}m</div>` : '';
    const algaeLine = props.algae && props.algae !== 'null'
      ? `<div style="font-size:11px;color:#d97706;margin-top:4px">⚠ ${esc(String(props.algae))}</div>` : '';
    const advisoryLine = props.advisory && props.advisory !== 'null'
      ? `<div style="font-size:11px;opacity:0.7;margin-top:2px">${esc(String(props.advisory))}</div>` : '';
    const detailUrl = String(props.detailUrl ?? '');
    const detailLink = detailUrl.startsWith('https://')
      ? `<a href="${esc(detailUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">Details (LAGeSo) ↗</a>`
      : '';
    const html = `<div style="font-size:13px;max-width:300px">
      <div style="font-weight:600;margin-bottom:4px">${esc(String(props.name))}${seasonBadge}</div>
      <div style="font-size:12px;opacity:0.7">${esc(String(props.waterBody))} · ${esc(String(props.district))}</div>
      <div style="font-size:12px;margin-top:4px">Quality: <strong style="color:${qColor}">${qLabel}</strong>${props.classification && props.classification !== 'null' ? ` <span style="font-size:11px;opacity:0.6">(EU: ${esc(String(props.classification))})</span>` : ''}</div>
      ${tempLine}${visLine}${algaeLine}${advisoryLine}
      <div style="font-size:11px;opacity:0.5;margin-top:4px">Measured: ${esc(String(props.measuredAt))}</div>
      ${detailLink}
    </div>`;
    return { html, lngLat: coords };
  });
}

function updateTransitMarkers(map: maplibregl.Map, alerts: TransitAlert[], isDark: boolean) {
  const geojson = alertsToGeoJSON(alerts);

  // Remove existing layers/source — clean re-creation each time to avoid
  // stale event listeners accumulating on style swaps.
  for (const id of ['transit-marker-label', 'transit-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('transit-markers')) map.removeSource('transit-markers');

  if (geojson.features.length === 0) return;

  map.addSource('transit-markers', {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: 'transit-marker-icon',
    type: 'symbol',
    source: 'transit-markers',
    layout: {
      'icon-image': [
        'match', ['get', 'severity'],
        'high', 'transit-icon-high',
        'medium', 'transit-icon-medium',
        'transit-icon-low',
      ],
      'icon-size': [
        'case',
        ['==', ['get', 'severity'], 'high'], 1.15,
        ['==', ['get', 'severity'], 'medium'], 1.0,
        0.85,
      ],
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  map.addLayer({
    id: 'transit-marker-label',
    type: 'symbol',
    source: 'transit-markers',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 9,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-offset': [0, 2.8],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
      'text-halo-color': isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
      'text-halo-width': 1,
    },
  });

  const getTransitContent: PopupContentFn = (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties;
    if (!props) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const html = buildPopupHtml(props);
    if (!html) return null;
    return { html, lngLat: coords };
  };
  registerPopupHandlers(map, 'transit-marker-icon', getTransitContent, { offset: 12 });
  registerPopupHandlers(map, 'transit-marker-label', getTransitContent, { offset: 12 });
}

export function CityMap() {
  const city = useCityConfig();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const catLabel = useCallback((cat: string) => t(`category.${cat}`, cat), [t]);
  const { data: transitAlerts } = useTransit(city.id);
  const { data: newsDigest } = useNewsDigest(city.id);
  const { data: safetyReports } = useSafety(city.id);
  const { data: ninaWarnings } = useNina(city.id);
  const { data: pharmacyList } = usePharmacies(city.id);
  const { data: aedList } = useAeds(city.id);
  const { data: trafficIncidents } = useTrafficIncidents(city.id);
  const { data: constructionSites } = useConstruction(city.id);
  const { data: aqGrid } = useAirQualityGrid(city.id);
  const { data: waterLevelData } = useWaterLevels(city.id);
  const { data: bathingData } = useBathing(city.id);
  const politicalLayer = useCommandCenter((s) => s.politicalLayer);
  const activeLayers = useCommandCenter((s) => s.activeLayers);
  const newsSubLayers = useCommandCenter((s) => s.newsSubLayers);
  const emergencySubLayers = useCommandCenter((s) => s.emergencySubLayers);
  const politicalActive = activeLayers.has('political');
  const trafficSubLayers = useCommandCenter((s) => s.trafficSubLayers);
  const trafficActive = activeLayers.has('traffic') && trafficSubLayers.has('incidents');
  const constructionActive = activeLayers.has('traffic') && trafficSubLayers.has('roadworks');
  const roadsActive = trafficActive || constructionActive;
  const weatherActive = activeLayers.has('weather');
  const socioeconomicLayer = useCommandCenter((s) => s.socioeconomicLayer);
  const socioeconomicActive = activeLayers.has('socioeconomic') && city.id === 'berlin';
  const rentMapActive = socioeconomicActive && socioeconomicLayer === 'rent';
  const socialAtlasActive = socioeconomicActive && socioeconomicLayer === 'social-atlas';
  const waterActive = activeLayers.has('water');
  const waterSubLayers = useCommandCenter((s) => s.waterSubLayers);
  const { data: socialAtlasData } = useSocialAtlas(city.id, socialAtlasActive);
  const { data: bezirkeData } = usePolitical(city.id, 'bezirke');
  const { data: bundestagData } = usePolitical(city.id, 'bundestag');
  const { data: stateBezirkeData } = usePolitical(city.id, 'state-bezirke');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Track whether the current zoom is above/below the safety filter threshold.
  // We only track the boolean (above/below) to avoid unnecessary re-renders on every zoom change.
  const [safetyZoomClose, setSafetyZoomClose] = useState(false);

  const isDark = theme === 'dark';
  const mapConfig = city.map;

  const transitItems = (activeLayers.has('traffic') && trafficSubLayers.has('public-transport')) ? (transitAlerts ?? []) : [];
  const newsActive = activeLayers.has('news');
  const newsItems = (newsActive && newsSubLayers.has('news'))
    ? filterNewsForMap(newsDigest?.items ?? [], city.coordinates)
    : [];
  const safetyItemsRaw = (newsActive && newsSubLayers.has('police')) ? (safetyReports ?? []) : [];
  // At city-wide zoom, show only the last 24h of safety reports; at close zoom, show all
  const safetyItems = useMemo(
    () => filterSafetyByRecency(
      safetyItemsRaw,
      safetyZoomClose ? MAP_SAFETY.zoomThreshold : MAP_SAFETY.zoomThreshold - 1,
    ),
    [safetyItemsRaw, safetyZoomClose],
  );
  const warningItems = activeLayers.has('warnings') ? (ninaWarnings ?? []) : [];
  const emergencyActive = activeLayers.has('emergencies');
  const pharmacyItems = (emergencyActive && emergencySubLayers.has('pharmacies')) ? (pharmacyList ?? []) : [];
  const aedItems = (emergencyActive && emergencySubLayers.has('aeds')) ? (aedList ?? []) : [];
  const trafficItems = trafficActive ? (trafficIncidents ?? []) : [];
  const constructionItems = constructionActive ? (constructionSites ?? []) : [];
  const aqGridItems = activeLayers.has('air-quality') ? (aqGrid ?? EMPTY_AQ) : EMPTY_AQ;
  const waterLevelItems = (waterActive && waterSubLayers.has('levels')) ? (waterLevelData?.stations ?? EMPTY_WL) : EMPTY_WL;
  const bathingItems = (waterActive && waterSubLayers.has('bathing')) ? (bathingData ?? []) : [];
  const socialAtlasGeoJson = socialAtlasActive ? (socialAtlasData ?? null) : null;

  // Keep current values in refs so the style.load handler always reads fresh values
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;
  const cityIdRef = useRef(city.id);
  cityIdRef.current = city.id;
  const cityCoordRef = useRef(city.coordinates);
  cityCoordRef.current = city.coordinates;
  const catLabelRef = useRef(catLabel);
  catLabelRef.current = catLabel;
  const transitItemsRef = useRef(transitItems);
  transitItemsRef.current = transitItems;
  const newsItemsRef = useRef(newsItems);
  newsItemsRef.current = newsItems;
  const safetyItemsRef = useRef(safetyItems);
  safetyItemsRef.current = safetyItems;
  const warningItemsRef = useRef(warningItems);
  warningItemsRef.current = warningItems;
  const pharmacyItemsRef = useRef(pharmacyItems);
  pharmacyItemsRef.current = pharmacyItems;
  const aedItemsRef = useRef(aedItems);
  aedItemsRef.current = aedItems;
  const trafficItemsRef = useRef(trafficItems);
  trafficItemsRef.current = trafficItems;
  const constructionItemsRef = useRef(constructionItems);
  constructionItemsRef.current = constructionItems;
  const aqGridItemsRef = useRef(aqGridItems);
  aqGridItemsRef.current = aqGridItems;
  const waterLevelItemsRef = useRef(waterLevelItems);
  waterLevelItemsRef.current = waterLevelItems;
  const bathingItemsRef = useRef(bathingItems);
  bathingItemsRef.current = bathingItems;
  const socialAtlasGeoJsonRef = useRef(socialAtlasGeoJson);
  socialAtlasGeoJsonRef.current = socialAtlasGeoJson;
  const roadsActiveRef = useRef(roadsActive);
  roadsActiveRef.current = roadsActive;
  const weatherActiveRef = useRef(weatherActive);
  weatherActiveRef.current = weatherActive;
  const rentMapActiveRef = useRef(rentMapActive);
  rentMapActiveRef.current = rentMapActive;
  const waterActiveRef = useRef(waterActive);
  waterActiveRef.current = waterActive;
  const politicalActiveRef = useRef(politicalActive);
  politicalActiveRef.current = politicalActive;
  const politicalLayerRef = useRef(politicalLayer);
  politicalLayerRef.current = politicalLayer;

  // Create map once
  useEffect(() => {
    if (!containerRef.current) return;

    const bounds = mapConfig.bounds as maplibregl.LngLatBoundsLike;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDarkRef.current ? DARK_STYLE : LIGHT_STYLE,
      bounds,
      fitBoundsOptions: { padding: 20 },
      minZoom: mapConfig.minZoom ?? 9,
      maxZoom: mapConfig.maxZoom ?? 16,
      maxBounds: bounds,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );

    map.on('load', () => {
      simplifyMap(map);
      setTrafficRoadVisibility(map, roadsActiveRef.current, isDarkRef.current);
      setWaterAreaVisibility(map, waterActiveRef.current, isDarkRef.current);
      registerAllMapIcons(map, isDarkRef.current);
      addDistrictLayer(map, cityIdRef.current, isDarkRef.current);
      setupDistrictHover(map);
      updateTrafficLayers(map, trafficItemsRef.current, isDarkRef.current);
      updateConstructionLayers(map, constructionItemsRef.current, isDarkRef.current);
      updateTransitMarkers(map, transitItemsRef.current ?? [], isDarkRef.current);
      updateNewsMarkers(map, newsItemsRef.current, isDarkRef.current, cityCoordRef.current, catLabelRef.current);
      updateSafetyMarkers(map, safetyItemsRef.current, isDarkRef.current);
      updateWarningPolygons(map, warningItemsRef.current, isDarkRef.current);
      updatePharmacyMarkers(map, pharmacyItemsRef.current, isDarkRef.current);
      updateAedMarkers(map, aedItemsRef.current, isDarkRef.current);
      updateAqGridLayer(map, aqGridItemsRef.current, isDarkRef.current);
      updateWaterLevelMarkers(map, waterLevelItemsRef.current, isDarkRef.current);
      updateBathingMarkers(map, bathingItemsRef.current, isDarkRef.current);
      updateSocialAtlasLayer(map, socialAtlasGeoJsonRef.current, isDarkRef.current);
      setWeatherOverlay(map, weatherActiveRef.current);
      setRentMapOverlay(map, rentMapActiveRef.current);

      // Collapse the attribution control (MapLibre opens it by default)
      containerRef.current
        ?.querySelector('.maplibregl-ctrl-attrib')
        ?.classList.remove('maplibregl-compact-show');
    });

    // Track zoom threshold crossings for safety marker filtering
    map.on('zoomend', () => {
      const z = map.getZoom();
      setSafetyZoomClose(z >= MAP_SAFETY.zoomThreshold);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme / city change — swap style, re-simplify, re-add districts + markers
  const isFirstRender = useRef(true);
  useEffect(() => {
    // Skip on mount — the initial style is set in the constructor above
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(isDark ? DARK_STYLE : LIGHT_STYLE);
    map.once('style.load', () => {
      simplifyMap(map);
      setTrafficRoadVisibility(map, roadsActiveRef.current, isDark);
      setWaterAreaVisibility(map, waterActiveRef.current, isDark);
      registerAllMapIcons(map, isDark);

      // Restore the correct political/district GeoJSON after style swap
      if (politicalActiveRef.current) {
        const pl = politicalLayerRef.current;
        const resolved = DISTRICT_URLS[city.id];
        if (resolved) {
          fetch(resolved.url)
            .then((r) => r.json())
            .then((geojson: GeoJSON.FeatureCollection) => {
              if (map.getSource('districts')) return; // already added
              map.addSource('districts', { type: 'geojson', data: geojson, generateId: true });
              map.addLayer({
                id: 'district-fill', type: 'fill', source: 'districts',
                paint: {
                  'fill-color': isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  'fill-opacity': 0.35,
                },
              });
              map.addLayer({
                id: 'district-line', type: 'line', source: 'districts',
                paint: { 'line-color': isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)', 'line-width': 1.5, 'line-dasharray': [4, 2] },
              });
              map.addLayer({
                id: 'district-label', type: 'symbol', source: 'districts',
                layout: { 'text-field': ['get', resolved.nameField], 'text-size': 14, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'], 'text-anchor': 'center', 'text-allow-overlap': false },
                paint: { 'text-color': isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.7)', 'text-halo-color': isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)', 'text-halo-width': 1.5 },
              });
              activeNameFieldRef.current = resolved.nameField;
              const freshData = politicalDataRef.current;
              if (freshData) applyPoliticalStyling(map, freshData, isDark, resolved.nameField);
            })
            .catch(() => { /* GeoJSON fetch failed — fall back to default districts */ addDistrictLayer(map, city.id, isDark); });
        } else {
          addDistrictLayer(map, city.id, isDark);
        }
      } else {
        addDistrictLayer(map, city.id, isDark);
      }

      updateTrafficLayers(map, trafficItemsRef.current, isDark);
      updateConstructionLayers(map, constructionItemsRef.current, isDark);
      updateTransitMarkers(map, transitItemsRef.current ?? [], isDark);
      updateNewsMarkers(map, newsItemsRef.current, isDark, cityCoordRef.current, catLabelRef.current);
      updateSafetyMarkers(map, safetyItemsRef.current, isDark);
      updateWarningPolygons(map, warningItemsRef.current, isDark);
      updatePharmacyMarkers(map, pharmacyItemsRef.current, isDark);
      updateAedMarkers(map, aedItemsRef.current, isDark);
      updateAqGridLayer(map, aqGridItemsRef.current, isDark);
      updateWaterLevelMarkers(map, waterLevelItemsRef.current, isDark);
      updateBathingMarkers(map, bathingItemsRef.current, isDark);
      updateSocialAtlasLayer(map, socialAtlasGeoJsonRef.current, isDark);
      setWeatherOverlay(map, weatherActiveRef.current);
      setRentMapOverlay(map, rentMapActiveRef.current);
    });
  }, [isDark, city.id]);

  // Show/hide weather precipitation overlay when layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setWeatherOverlay(map, weatherActive);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [weatherActive]);

  // Show/hide Berlin Wohnlagenkarte (rent map) overlay when layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setRentMapOverlay(map, rentMapActive);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [rentMapActive]);

  // Update transit markers when alerts or layer toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateTransitMarkers(map, transitItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitItems]);

  // Update news markers when data or layer toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateNewsMarkers(map, newsItems, isDarkRef.current, cityCoordRef.current, catLabelRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsItems]);

  // Update safety markers when data or layer toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateSafetyMarkers(map, safetyItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safetyItems]);

  // Update NINA warning polygons
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateWarningPolygons(map, warningItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warningItems]);

  // Update emergency markers (pharmacies + AEDs) — combined into a single effect
  // to ensure both update atomically when the emergency layer toggles on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      updatePharmacyMarkers(map, pharmacyItems, isDarkRef.current);
      updateAedMarkers(map, aedItems, isDarkRef.current);
    };
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergencyActive, emergencySubLayers, pharmacyList, aedList]);

  // Update traffic incident layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateTrafficLayers(map, trafficItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trafficItems]);

  // Update construction layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateConstructionLayers(map, constructionItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constructionItems]);

  // Show/hide major road layers when traffic or construction data layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setTrafficRoadVisibility(map, roadsActive, isDarkRef.current);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    // Style not loaded yet — defer until idle, but clean up on re-render/unmount
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [roadsActive]);

  // Show/hide water area layers when water-levels data layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setWaterAreaVisibility(map, waterActive, isDarkRef.current);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [waterActive]);

  // Update air quality grid circles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateAqGridLayer(map, aqGridItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aqGridItems]);

  // Update water level markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateWaterLevelMarkers(map, waterLevelItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waterLevelItems]);

  // Update bathing water markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateBathingMarkers(map, bathingItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bathingItems]);

  // Update social atlas choropleth (lazy — geojson only available when layer is toggled on)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateSocialAtlasLayer(map, socialAtlasGeoJson, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socialAtlasGeoJson]);

  // Political layer: swap GeoJSON source + apply/reset styling
  const politicalData = politicalLayer === 'bundestag'
    ? bundestagData
    : politicalLayer === 'bezirke'
      ? bezirkeData
      : stateBezirkeData;
  const politicalDataRef = useRef(politicalData);
  politicalDataRef.current = politicalData;
  const activeNameFieldRef = useRef('name');
  const politicalGeoFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const politicalWasActiveRef = useRef(false);

  // Effect 1: swap GeoJSON source when political layer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Cleanup: only runs when political was previously active (avoids calling
    // map.getLayer() before the style is parsed on the very first render).
    // Skips the isStyleLoaded() guard because other effects in the same render
    // cycle may have added sources, temporarily making isStyleLoaded() false.
    if (!politicalActive) {
      if (politicalWasActiveRef.current) {
        removePoliticalMarkers(map);
        politicalGeoFeaturesRef.current = [];
        addDistrictLayer(map, cityIdRef.current, isDarkRef.current);
        activeNameFieldRef.current = DISTRICT_URLS[cityIdRef.current]?.nameField ?? 'name';
        politicalWasActiveRef.current = false;
      }
      return;
    }

    // Creation path requires the style to be fully loaded
    if (!map.isStyleLoaded()) return;

    politicalWasActiveRef.current = true;

    // All political sub-layers use the same Bezirke boundaries
    const resolved = DISTRICT_URLS[cityIdRef.current];
    if (!resolved) return;

    activeNameFieldRef.current = resolved.nameField;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(resolved.url, { signal: controller.signal });
        const geojson: GeoJSON.FeatureCollection = await res.json();
        if (controller.signal.aborted) return;

        // Remove existing layers/source (including markers)
        removePoliticalMarkers(map);
        for (const id of ['district-label', 'district-line', 'district-fill']) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource('districts')) map.removeSource('districts');

        map.addSource('districts', { type: 'geojson', data: geojson, generateId: true });
        map.addLayer({
          id: 'district-fill',
          type: 'fill',
          source: 'districts',
          paint: {
            'fill-color': isDarkRef.current ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            'fill-opacity': 0.35,
          },
        });
        map.addLayer({
          id: 'district-line',
          type: 'line',
          source: 'districts',
          paint: {
            'line-color': isDarkRef.current ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
            'line-width': 1.5,
            'line-dasharray': [4, 2],
          },
        });
        map.addLayer({
          id: 'district-label',
          type: 'symbol',
          source: 'districts',
          layout: {
            'text-field': ['get', resolved.nameField],
            'text-size': 14,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-anchor': 'center',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': isDarkRef.current ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.7)',
            'text-halo-color': isDarkRef.current ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
            'text-halo-width': 1.5,
          },
        });

        // Store GeoJSON features for marker creation
        politicalGeoFeaturesRef.current = geojson.features;

        // Apply party colors + markers if data is already available
        const freshData = politicalDataRef.current;
        if (freshData) {
          applyPoliticalStyling(map, freshData, isDarkRef.current, resolved.nameField);
          updatePoliticalMarkers(map, freshData, geojson.features, politicalLayer as 'bezirke' | 'bundestag' | 'landesparlament', resolved.nameField, isDarkRef.current);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('[political] GeoJSON swap error:', e);
      }
    })();

    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [politicalActive, politicalLayer]);

  // Effect 2: apply party colors + markers when political data arrives/changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !politicalActive || !politicalData) return;
    applyPoliticalStyling(map, politicalData, isDarkRef.current, activeNameFieldRef.current);
    if (politicalGeoFeaturesRef.current.length) {
      updatePoliticalMarkers(map, politicalData, politicalGeoFeaturesRef.current, politicalLayer, activeNameFieldRef.current, isDarkRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [politicalData]);

  // Political popup on district click
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!politicalActive || !e.features?.length) return;
      const data = politicalDataRef.current;
      if (!data?.length) return;
      const nameField = activeNameFieldRef.current;
      const name = e.features[0].properties?.[nameField] ?? '';
      if (!name) return;
      const html = buildPoliticalPopupHtml(name, data);
      showMapPopup(map, e.lngLat, html, { maxWidth: '320px', sticky: true });
    };

    map.on('click', 'district-fill', handler);
    return () => { map.off('click', 'district-fill', handler); };
  }, [politicalActive]);

  // Political marker popup on hover/click (registered once, uses refs for fresh data)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const getPopupHtml = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features?.length) return null;
      const name = e.features[0].properties?.name as string | undefined;
      if (!name) return null;
      const data = politicalDataRef.current;
      if (!data?.length) return null;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      return { html: buildPoliticalPopupHtml(name, data), coords };
    };

    const onEnter = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const result = getPopupHtml(e);
      if (!result) return;
      map.getCanvas().style.cursor = 'pointer';
      showMapPopup(map, result.coords, result.html, { maxWidth: '320px', sticky: false });
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      _clearHoverTimer();
      _hoverTimer = setTimeout(_closeHoverPopup, 300);
    };
    const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const result = getPopupHtml(e);
      if (!result) return;
      showMapPopup(map, result.coords, result.html, { maxWidth: '320px', sticky: true });
    };

    map.on('mouseenter', POLITICAL_MARKER_LAYER, onEnter);
    map.on('mouseleave', POLITICAL_MARKER_LAYER, onLeave);
    map.on('click', POLITICAL_MARKER_LAYER, onClick);
    return () => {
      map.off('mouseenter', POLITICAL_MARKER_LAYER, onEnter);
      map.off('mouseleave', POLITICAL_MARKER_LAYER, onLeave);
      map.off('click', POLITICAL_MARKER_LAYER, onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full min-h-[300px]">
      <div
        ref={containerRef}
        data-testid="map-container"
        className="w-full h-full"
      />
    </div>
  );
}
