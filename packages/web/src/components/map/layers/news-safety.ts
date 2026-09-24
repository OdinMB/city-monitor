/**
 * News and safety map marker layers with spider animation.
 */

import * as maplibregl from 'maplibre-gl';
import type { NewsItem, SafetyReport } from '../../../lib/api.js';
import { NEWS_CATEGORY_COLORS } from '../../../lib/map-icons.js';
import { MAP_NEWS } from '../../../lib/map-settings.js';
import { showMapPopup, scheduleHoverClose } from '../popups.js';
import {
  _newsSpider, _newsH, _safetySpider, _safetyH,
  cleanupSpiderHandlers, initSpiderState, expandAllSpiderGroups, addSpiderHandler,
} from '../spider.js';

/**
 * Select the most important news items for map display.
 *
 * Items geocoded outside the city bounding box are rejected as mis-geocoded.
 * Locationless items can still fill the base slots (placed at city center)
 * if they are important enough.
 *
 * All categories (including crime) share the same budget:
 * 1. Guarantee the top N items from each category (so no category is invisible)
 * 2. Fill remaining slots by global importance ranking
 * 3. Spatial bonus: greedily add items farthest from existing markers,
 *    stopping when the gap would be too small (minSpatialGapSq)
 */
export function filterNewsForMap(
  items: NewsItem[],
  fallback: { lat: number; lon: number },
  bbox?: { north: number; south: number; east: number; west: number },
): NewsItem[] {
  const inBounds = (loc: { lat: number; lon: number }) =>
    !bbox || (loc.lat >= bbox.south && loc.lat <= bbox.north && loc.lon >= bbox.west && loc.lon <= bbox.east);

  // Reject items geocoded outside the city (mis-geocoded outliers).
  // Items without a location are kept — they land at city center.
  const eligible = items.filter((i) => !i.location || inBounds(i.location));

  const byImportance = [...eligible].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));

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

  // Phase 3: spatial bonus — greedily add items that are farthest from any
  // existing marker so that large empty areas on the map get filled first.
  // Only items WITH a location are eligible (locationless ones already sit at
  // city center and wouldn't help fill gaps).
  const placed: Array<{ lat: number; lon: number }> = [];
  for (const item of result) {
    placed.push(item.location ?? fallback);
  }

  const candidates = byImportance.filter(
    (item) => !resultSet.has(item.id)
      && item.location
      && (item.importance ?? 0) >= MAP_NEWS.minImportanceSpatial,
  );

  // Greedy: always pick the candidate farthest from the nearest placed marker.
  // Stop once even the best candidate is closer than minSpatialGapSq — adding
  // more items would just pile onto already-covered areas.
  for (let bonus = 0; bonus < MAP_NEWS.spatialBonusMax && candidates.length > 0; bonus++) {
    let bestIdx = -1;
    let bestDist = -1;
    for (let i = 0; i < candidates.length; i++) {
      const loc = candidates[i].location!;
      let minDist = Infinity;
      for (const p of placed) {
        const dlat = loc.lat - p.lat;
        const dlon = loc.lon - p.lon;
        const d = dlat * dlat + dlon * dlon;
        if (d < minDist) minDist = d;
      }
      if (minDist > bestDist) {
        bestDist = minDist;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestDist < MAP_NEWS.minSpatialGapSq) break;
    const winner = candidates.splice(bestIdx, 1)[0];
    result.push(winner);
    resultSet.add(winner.id);
    placed.push(winner.location!);
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
