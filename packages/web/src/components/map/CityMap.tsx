/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive city map using MapLibre GL with CARTO tiles.
 *
 * Reference: .worldmonitor/public/map-styles/ — bundled CARTO map styles
 * Does NOT port worldmonitor's DeckGLMap component.
 */

import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTheme } from '../../hooks/useTheme.js';
import { useTransit } from '../../hooks/useTransit.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { useSafety } from '../../hooks/useSafety.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import type { TransitAlert, NewsItem, SafetyReport } from '../../lib/api.js';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

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

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
};

function simplifyMap(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (
      !KEEP_LAYERS.has(layer.id) &&
      !layer.id.startsWith('district-') &&
      !layer.id.startsWith('transit-') &&
      !layer.id.startsWith('news-') &&
      !layer.id.startsWith('safety-')
    ) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
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

const NEWS_CATEGORY_COLORS: Record<string, string> = {
  transit: '#3b82f6',
  politics: '#8b5cf6',
  culture: '#ec4899',
  crime: '#ef4444',
  weather: '#06b6d4',
  economy: '#10b981',
  sports: '#f59e0b',
  local: '#6366f1',
};

function newsToGeoJSON(items: NewsItem[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const item of items) {
    if (!item.location) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.location.lon, item.location.lat] },
      properties: {
        title: item.title,
        category: item.category,
        sourceName: item.sourceName,
        url: item.url,
        color: NEWS_CATEGORY_COLORS[item.category] ?? '#6366f1',
        locationLabel: item.location.label ?? '',
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

function updateNewsMarkers(map: maplibregl.Map, items: NewsItem[], isDark: boolean) {
  const geojson = newsToGeoJSON(items);

  for (const id of ['news-marker-label', 'news-marker-circle']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('news-markers')) map.removeSource('news-markers');

  if (geojson.features.length === 0) return;

  map.addSource('news-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'news-marker-circle',
    type: 'circle',
    source: 'news-markers',
    paint: {
      'circle-radius': 6,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': isDark ? '#1f2937' : '#ffffff',
    },
  });

  map.on('click', 'news-marker-circle', (e) => {
    if (!e.features?.length) return;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
      <div style="opacity:0.6;font-size:11px">${props.sourceName} · ${props.category}</div>
      ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
      <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Read more →</a>
    </div>`;
    new maplibregl.Popup({ offset: 10, maxWidth: '300px' }).setLngLat(coords).setHTML(html).addTo(map);
  });

  map.on('mouseenter', 'news-marker-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'news-marker-circle', () => { map.getCanvas().style.cursor = ''; });
}

function updateSafetyMarkers(map: maplibregl.Map, reports: SafetyReport[], isDark: boolean) {
  const geojson = safetyToGeoJSON(reports);

  for (const id of ['safety-marker-label', 'safety-marker-circle']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('safety-markers')) map.removeSource('safety-markers');

  if (geojson.features.length === 0) return;

  map.addSource('safety-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'safety-marker-circle',
    type: 'circle',
    source: 'safety-markers',
    paint: {
      'circle-radius': 6,
      'circle-color': '#f97316',
      'circle-stroke-width': 2,
      'circle-stroke-color': isDark ? '#1f2937' : '#ffffff',
    },
  });

  map.on('click', 'safety-marker-circle', (e) => {
    if (!e.features?.length) return;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
      ${props.district ? `<div style="opacity:0.6;font-size:11px">${props.district}</div>` : ''}
      ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
      <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Details →</a>
    </div>`;
    new maplibregl.Popup({ offset: 10, maxWidth: '300px' }).setLngLat(coords).setHTML(html).addTo(map);
  });

  map.on('mouseenter', 'safety-marker-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'safety-marker-circle', () => { map.getCanvas().style.cursor = ''; });
}

function updateTransitMarkers(map: maplibregl.Map, alerts: TransitAlert[], isDark: boolean) {
  const geojson = alertsToGeoJSON(alerts);

  // Remove existing layers/source — clean re-creation each time to avoid
  // stale event listeners accumulating on style swaps.
  for (const id of ['transit-marker-label', 'transit-marker-circle']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('transit-markers')) map.removeSource('transit-markers');

  if (geojson.features.length === 0) return;

  map.addSource('transit-markers', {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: 'transit-marker-circle',
    type: 'circle',
    source: 'transit-markers',
    paint: {
      'circle-radius': [
        'case',
        ['>=', ['get', 'count'], 4], 12,
        ['>=', ['get', 'count'], 2], 10,
        7,
      ],
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': isDark ? '#1f2937' : '#ffffff',
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
      'text-offset': [0, 1.8],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
      'text-halo-color': isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
      'text-halo-width': 1,
    },
  });

  // Click handler for popups
  map.on('click', 'transit-marker-circle', (e) => {
    if (!e.features?.length) return;
    const props = e.features[0].properties;
    if (!props) return;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];

    new maplibregl.Popup({ offset: 12, maxWidth: '300px' })
      .setLngLat(coords)
      .setHTML(buildPopupHtml(props))
      .addTo(map);
  });

  map.on('mouseenter', 'transit-marker-circle', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'transit-marker-circle', () => {
    map.getCanvas().style.cursor = '';
  });
}

export function CityMap() {
  const city = useCityConfig();
  const { theme } = useTheme();
  const { data: transitAlerts } = useTransit(city.id);
  const { data: newsDigest } = useNewsDigest(city.id);
  const { data: safetyReports } = useSafety(city.id);
  const activeLayers = useCommandCenter((s) => s.activeLayers);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const isDark = theme === 'dark';
  const mapConfig = city.map;

  const newsItems = activeLayers.has('news') ? (newsDigest?.items ?? []) : [];
  const safetyItems = activeLayers.has('safety') ? (safetyReports ?? []) : [];

  // Keep current values in refs so the style.load handler always reads fresh values
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;
  const cityIdRef = useRef(city.id);
  cityIdRef.current = city.id;
  const transitAlertsRef = useRef(transitAlerts);
  transitAlertsRef.current = transitAlerts;
  const newsItemsRef = useRef(newsItems);
  newsItemsRef.current = newsItems;
  const safetyItemsRef = useRef(safetyItems);
  safetyItemsRef.current = safetyItems;

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
      addDistrictLayer(map, cityIdRef.current, isDarkRef.current);
      setupDistrictHover(map);
      updateTransitMarkers(map, transitAlertsRef.current ?? [], isDarkRef.current);
      updateNewsMarkers(map, newsItemsRef.current, isDarkRef.current);
      updateSafetyMarkers(map, safetyItemsRef.current, isDarkRef.current);

      // Collapse the attribution control (MapLibre opens it by default)
      containerRef.current
        ?.querySelector('.maplibregl-ctrl-attrib')
        ?.classList.remove('maplibregl-compact-show');
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
    map.once('styledata', () => {
      simplifyMap(map);
      addDistrictLayer(map, city.id, isDark);
      updateTransitMarkers(map, transitAlertsRef.current ?? [], isDark);
      updateNewsMarkers(map, newsItemsRef.current, isDark);
      updateSafetyMarkers(map, safetyItemsRef.current, isDark);
    });
  }, [isDark, city.id]);

  // Update transit markers when alerts change (theme handled by style-swap above)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateTransitMarkers(map, transitAlerts ?? [], isDarkRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitAlerts]);

  // Update news markers when data or layer toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateNewsMarkers(map, newsItems, isDarkRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsItems]);

  // Update safety markers when data or layer toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateSafetyMarkers(map, safetyItems, isDarkRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safetyItems]);

  return (
    <div
      ref={containerRef}
      data-testid="map-container"
      className="w-full h-full min-h-[300px]"
    />
  );
}
