/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Spider animation system — click a heap of stacked markers to scatter them
 * outward with connecting legs. Click elsewhere to collapse.
 */

import maplibregl from 'maplibre-gl';
import { SPIDER_BASE_RADIUS, SPIDER_PER_ITEM } from './constants.js';

// --- Types -------------------------------------------------------------------

export interface SpiderState {
  groups: Map<string, number[]>;       // groupKey → feature indices
  origCoords: Map<number, [number, number]>;
  expandedKey: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SpiderHandlerSet { handlers: Array<{ event: string; layer?: string; fn: any }> }

// --- Module-level state for news & safety spider groups ----------------------

export const _newsSpider: SpiderState = { groups: new Map(), origCoords: new Map(), expandedKey: null };
export const _newsH: SpiderHandlerSet = { handlers: [] };
export const _safetySpider: SpiderState = { groups: new Map(), origCoords: new Map(), expandedKey: null };
export const _safetyH: SpiderHandlerSet = { handlers: [] };

// --- Functions ---------------------------------------------------------------

export function cleanupSpiderHandlers(map: maplibregl.Map, hset: SpiderHandlerSet) {
  for (const h of hset.handlers) {
    if (h.layer) map.off(h.event as 'click', h.layer, h.fn);
    else map.off(h.event as 'click', h.fn);
  }
  hset.handlers = [];
}

/** Tag features with group info and store original coordinates */
export function initSpiderState(fc: GeoJSON.FeatureCollection, state: SpiderState) {
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
export function computeSpiderPositions(
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
        (feat.geometry as GeoJSON.Point).coordinates = [orig[0], orig[1]];
      }
    }
  }
  return { type: 'FeatureCollection', features: lineFeatures };
}

/** Expand ALL spider groups at once (for auto-expand mode) */
export function expandAllSpiderGroups(
  features: GeoJSON.Feature[],
  state: SpiderState,
): GeoJSON.FeatureCollection {
  const lineFeatures: GeoJSON.Feature[] = [];
  for (const [, indices] of state.groups) {
    if (indices.length <= 1) continue;
    const orig = state.origCoords.get(indices[0])!;
    const radius = SPIDER_BASE_RADIUS + SPIDER_PER_ITEM * indices.length;

    for (let j = 0; j < indices.length; j++) {
      const feat = features[indices[j]];
      feat.properties!._isExpanded = 1;
      const angle = (2 * Math.PI * j) / indices.length - Math.PI / 2;
      const lon = orig[0] + radius * Math.cos(angle);
      const lat = orig[1] + radius * Math.sin(angle);
      (feat.geometry as GeoJSON.Point).coordinates = [lon, lat];
      lineFeatures.push({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: [[orig[0], orig[1]], [lon, lat]] },
      });
    }
  }
  return { type: 'FeatureCollection', features: lineFeatures };
}

export function updateSpiderSources(
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
export function addSpiderHandler(map: maplibregl.Map, hset: SpiderHandlerSet, event: string, layerOrFn: string | ((...a: any[]) => void), fn?: (...a: any[]) => void) {
  if (typeof layerOrFn === 'string') {
    map.on(event as 'click', layerOrFn, fn!);
    hset.handlers.push({ event, layer: layerOrFn, fn: fn! });
  } else {
    map.on(event as 'click', layerOrFn);
    hset.handlers.push({ event, fn: layerOrFn });
  }
}
