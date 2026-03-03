/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Choropleth map layers: Social Atlas and Population demographics.
 */

import maplibregl from 'maplibre-gl';
import type { SocialAtlasFeatureProps, PopulationFeatureProps } from '../../../lib/api.js';
import { SOCIAL_ATLAS_COLOR_RAMPS, POPULATION_COLOR_RAMPS, type SocialAtlasMetric, type PopulationMetric } from '../constants.js';
import { showMapPopup, scheduleHoverClose, type MapLayerEvent } from '../popups.js';

// --- Social Atlas module-level handler state ---------------------------------

let _saMouseMove: ((e: maplibregl.MapMouseEvent) => void) | null = null;
let _saMouseLeave: (() => void) | null = null;
let _saClick: ((e: maplibregl.MapMouseEvent) => void) | null = null;

export function updateSocialAtlasLayer(
  map: maplibregl.Map,
  geojson: GeoJSON.FeatureCollection | null,
  metric: SocialAtlasMetric,
  isDark: boolean,
) {
  // Remove previous event listeners to prevent accumulation
  if (_saMouseMove) map.off('mousemove', 'social-atlas-fill', _saMouseMove);
  if (_saMouseLeave) map.off('mouseleave', 'social-atlas-fill', _saMouseLeave);
  if (_saClick) map.off('click', 'social-atlas-fill', _saClick);
  _saMouseMove = null;
  _saMouseLeave = null;
  _saClick = null;

  for (const id of ['social-atlas-fill', 'social-atlas-line']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('social-atlas-areas')) map.removeSource('social-atlas-areas');

  if (!geojson || geojson.features.length === 0) return;

  const ramp = SOCIAL_ATLAS_COLOR_RAMPS[metric];
  map.addSource('social-atlas-areas', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'social-atlas-fill',
    type: 'fill',
    source: 'social-atlas-areas',
    paint: {
      'fill-color': [
        'interpolate', ['linear'],
        ['get', ramp.property],
        ...ramp.stops.flatMap(([stop, color]) => [stop, color]),
      ] as maplibregl.ExpressionSpecification,
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
    return `<div style="font-size:13px;max-width:300px">
      <div style="font-weight:600;margin-bottom:6px">${p.plrName}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr><td style="padding:2px 0;opacity:0.7">Unemployment</td><td style="text-align:right;font-weight:500">${p.unemployment?.toFixed(1) ?? '–'}%</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Single-parent HH</td><td style="text-align:right;font-weight:500">${p.singleParent?.toFixed(1) ?? '–'}%</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Welfare recipients</td><td style="text-align:right;font-weight:500">${p.welfare?.toFixed(1) ?? '–'}%</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Child poverty</td><td style="text-align:right;font-weight:500">${p.childPoverty?.toFixed(1) ?? '–'}%</td></tr>
      </table>
    </div>`;
  }

  let hoveredPlrId: string | null = null;

  _saMouseMove = (e) => {
    const me = e as MapLayerEvent;
    if (!me.features?.length) return;
    const p = me.features[0].properties as unknown as SocialAtlasFeatureProps;
    if (p.plrId === hoveredPlrId) return;
    hoveredPlrId = p.plrId;
    map.getCanvas().style.cursor = 'pointer';
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], buildSocialAtlasPopup(p), { sticky: false });
  };

  _saMouseLeave = () => {
    map.getCanvas().style.cursor = '';
    hoveredPlrId = null;
    scheduleHoverClose();
  };

  _saClick = (e) => {
    const me = e as MapLayerEvent;
    if (!me.features?.length) return;
    const p = me.features[0].properties as unknown as SocialAtlasFeatureProps;
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], buildSocialAtlasPopup(p), { sticky: true });
  };

  map.on('mousemove', 'social-atlas-fill', _saMouseMove);
  map.on('mouseleave', 'social-atlas-fill', _saMouseLeave);
  map.on('click', 'social-atlas-fill', _saClick);
}

// --- Population module-level handler state -----------------------------------

let _popMouseMove: ((e: maplibregl.MapMouseEvent) => void) | null = null;
let _popMouseLeave: (() => void) | null = null;
let _popClick: ((e: maplibregl.MapMouseEvent) => void) | null = null;

export function updatePopulationLayer(
  map: maplibregl.Map,
  geojson: GeoJSON.FeatureCollection | null,
  metric: PopulationMetric,
  isDark: boolean,
) {
  // Remove previous event listeners to prevent accumulation
  if (_popMouseMove) map.off('mousemove', 'population-fill', _popMouseMove);
  if (_popMouseLeave) map.off('mouseleave', 'population-fill', _popMouseLeave);
  if (_popClick) map.off('click', 'population-fill', _popClick);
  _popMouseMove = null;
  _popMouseLeave = null;
  _popClick = null;

  for (const id of ['population-fill', 'population-line']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('population-areas')) map.removeSource('population-areas');

  if (!geojson || geojson.features.length === 0) return;

  const ramp = POPULATION_COLOR_RAMPS[metric];
  map.addSource('population-areas', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'population-fill',
    type: 'fill',
    source: 'population-areas',
    paint: {
      'fill-color': [
        'interpolate', ['linear'],
        ['get', ramp.property],
        ...ramp.stops.flatMap(([stop, color]) => [stop, color]),
      ] as maplibregl.ExpressionSpecification,
      'fill-opacity': isDark ? 0.35 : 0.4,
    },
  });

  map.addLayer({
    id: 'population-line',
    type: 'line',
    source: 'population-areas',
    paint: {
      'line-color': isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
      'line-width': 0.5,
    },
  });

  function buildPopulationPopup(p: PopulationFeatureProps): string {
    return `<div style="font-size:13px;max-width:300px">
      <div style="font-weight:600;margin-bottom:6px">${p.plrName}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr><td style="padding:2px 0;opacity:0.7">Population</td><td style="text-align:right;font-weight:500">${p.population?.toLocaleString() ?? '–'}</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Density</td><td style="text-align:right;font-weight:500">${p.density?.toLocaleString() ?? '–'}/km²</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Foreign pop.</td><td style="text-align:right;font-weight:500">${p.foreignPct?.toFixed(1) ?? '–'}%</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Aged 65+</td><td style="text-align:right;font-weight:500">${p.elderlyPct?.toFixed(1) ?? '–'}%</td></tr>
        <tr><td style="padding:2px 0;opacity:0.7">Under 18</td><td style="text-align:right;font-weight:500">${p.youthPct?.toFixed(1) ?? '–'}%</td></tr>
      </table>
    </div>`;
  }

  let hoveredPlrId: string | null = null;

  _popMouseMove = (e) => {
    const me = e as MapLayerEvent;
    if (!me.features?.length) return;
    const p = me.features[0].properties as unknown as PopulationFeatureProps;
    if (p.plrId === hoveredPlrId) return;
    hoveredPlrId = p.plrId;
    map.getCanvas().style.cursor = 'pointer';
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], buildPopulationPopup(p), { sticky: false });
  };

  _popMouseLeave = () => {
    map.getCanvas().style.cursor = '';
    hoveredPlrId = null;
    scheduleHoverClose();
  };

  _popClick = (e) => {
    const me = e as MapLayerEvent;
    if (!me.features?.length) return;
    const p = me.features[0].properties as unknown as PopulationFeatureProps;
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], buildPopulationPopup(p), { sticky: true });
  };

  map.on('mousemove', 'population-fill', _popMouseMove);
  map.on('mouseleave', 'population-fill', _popMouseLeave);
  map.on('click', 'population-fill', _popClick);
}
