/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * News and safety map marker layers with spider animation.
 */

import maplibregl from 'maplibre-gl';
import type { NewsItem, SafetyReport } from '../../../lib/api.js';
import { NEWS_CATEGORY_COLORS } from '../../../lib/map-icons.js';
import { MAP_NEWS } from '../../../lib/map-settings.js';
import { showMapPopup, scheduleHoverClose } from '../popups.js';
import {
  _newsSpider, _newsH, _safetySpider, _safetyH,
  cleanupSpiderHandlers, initSpiderState, expandAllSpiderGroups, addSpiderHandler,
} from '../spider.js';

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
export function filterNewsForMap(items: NewsItem[], fallback: { lat: number; lon: number }): NewsItem[] {
  const byImportance = [...items].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));

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

  // Phase 2: fill remaining slots by importance, capping locationless items
  // (locationless items all cluster at city center, wasting map coverage)
  const resultSet = new Set<string>();
  const result: NewsItem[] = [];
  let noLocCount = 0;

  const canAdd = (item: NewsItem): boolean => {
    if (item.location) return true;
    return noLocCount < MAP_NEWS.maxWithoutLocation;
  };

  for (const item of byImportance) {
    if (result.length >= MAP_NEWS.maxTotal) break;
    if (picked.has(item.id) && canAdd(item)) {
      result.push(item);
      resultSet.add(item.id);
      if (!item.location) noLocCount++;
    }
  }
  for (const item of byImportance) {
    if (result.length >= MAP_NEWS.maxTotal) break;
    if (!resultSet.has(item.id) && canAdd(item)) {
      result.push(item);
      resultSet.add(item.id);
      if (!item.location) noLocCount++;
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
    if ((item.importance ?? 0) < MAP_NEWS.minImportanceSpatial) continue;
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

export function updateNewsMarkers(map: maplibregl.Map, items: NewsItem[], _isDark: boolean, fallback: { lat: number; lon: number }, categoryLabel: (cat: string) => string) {
  const geojson = newsToGeoJSON(items, fallback, categoryLabel);

  cleanupSpiderHandlers(map, _newsH);
  for (const id of ['news-marker-count', 'news-marker-label', 'news-marker-circle', 'news-marker-icon', 'news-spider-lines']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('news-markers')) map.removeSource('news-markers');
  if (map.getSource('news-spider-lines')) map.removeSource('news-spider-lines');

  if (geojson.features.length === 0) return;

  initSpiderState(geojson, _newsSpider);

  // Auto-expand all stacked groups so individual markers are always visible
  const spiderLines = expandAllSpiderGroups(geojson.features, _newsSpider);

  map.addSource('news-spider-lines', { type: 'geojson', data: spiderLines });
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
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
    },
  });

  // Hover popup
  addSpiderHandler(map, _newsH, 'mouseenter', 'news-marker-icon', (e: maplibregl.MapMouseEvent) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = map.queryRenderedFeatures(e.point, { layers: ['news-marker-icon'] });
    if (!f.length) return;
    const props = f[0].properties!;
    const coords = (f[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const imp = Number(props.importance) || 0;
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
      <div style="opacity:0.6;font-size:11px">${props.sourceName} · ${props.categoryLabel}${imp ? ` · ${Math.round(imp * 100)}%` : ''}</div>
      ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
      <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Read more →</a>
    </div>`;
    showMapPopup(map, coords, html, { sticky: false });
  });

  addSpiderHandler(map, _newsH, 'mouseleave', 'news-marker-icon', () => {
    map.getCanvas().style.cursor = '';
    scheduleHoverClose();
  });

  // Sticky popup on click
  addSpiderHandler(map, _newsH, 'click', 'news-marker-icon', (e: maplibregl.MapMouseEvent) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['news-marker-icon'] });
    if (!f.length) return;
    const props = f[0].properties!;
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
}

export function updateSafetyMarkers(map: maplibregl.Map, reports: SafetyReport[], _isDark: boolean) {
  const geojson = safetyToGeoJSON(reports);

  cleanupSpiderHandlers(map, _safetyH);
  for (const id of ['safety-marker-count', 'safety-marker-label', 'safety-marker-circle', 'safety-marker-icon', 'safety-spider-lines']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('safety-markers')) map.removeSource('safety-markers');
  if (map.getSource('safety-spider-lines')) map.removeSource('safety-spider-lines');

  if (geojson.features.length === 0) return;

  initSpiderState(geojson, _safetySpider);

  // Auto-expand all stacked groups
  const spiderLines = expandAllSpiderGroups(geojson.features, _safetySpider);

  map.addSource('safety-spider-lines', { type: 'geojson', data: spiderLines });
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
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
    },
  });

  // Hover popup
  addSpiderHandler(map, _safetyH, 'mouseenter', 'safety-marker-icon', (e: maplibregl.MapMouseEvent) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = map.queryRenderedFeatures(e.point, { layers: ['safety-marker-icon'] });
    if (!f.length) return;
    const props = f[0].properties!;
    const coords = (f[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
      ${props.district ? `<div style="opacity:0.6;font-size:11px">${props.district}</div>` : ''}
      ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
      <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Details →</a>
    </div>`;
    showMapPopup(map, coords, html, { sticky: false });
  });

  addSpiderHandler(map, _safetyH, 'mouseleave', 'safety-marker-icon', () => {
    map.getCanvas().style.cursor = '';
    scheduleHoverClose();
  });

  // Sticky popup on click
  addSpiderHandler(map, _safetyH, 'click', 'safety-marker-icon', (e: maplibregl.MapMouseEvent) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['safety-marker-icon'] });
    if (!f.length) return;
    const props = f[0].properties!;
    const coords = (f[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.title}</div>
      ${props.district ? `<div style="opacity:0.6;font-size:11px">${props.district}</div>` : ''}
      ${props.locationLabel ? `<div style="font-size:11px;margin-top:2px">📍 ${props.locationLabel}</div>` : ''}
      <a href="${props.url}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Details →</a>
    </div>`;
    showMapPopup(map, coords, html, { sticky: true });
  });
}
