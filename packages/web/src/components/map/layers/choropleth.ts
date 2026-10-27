/**
 * Choropleth map layers: Social Atlas and Population demographics.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { SocialAtlasFeatureProps, PopulationFeatureProps } from '../../../lib/api.js';
import { SOCIAL_ATLAS_COLOR_RAMPS, POPULATION_COLOR_RAMPS, type SocialAtlasMetric, type PopulationMetric } from '../constants.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { showMapPopup, scheduleHoverClose, ltr, type MapLayerEvent } from '../popups.js';

/**
 * One label/value row of a choropleth popup; the label is a translation key.
 * The value is kept left-to-right so "12,000/km²" stays whole in Arabic.
 */
function row(labelKey: string, value: string): string {
  return `<tr><td style="padding:2px 0;opacity:0.7">${escapeHtml(i18n.t(labelKey))}</td><td style="text-align:end;font-weight:500">${ltr(escapeHtml(value))}</td></tr>`;
}

/**
 * Popup markup for a social-atlas planning area. The area name comes from the
 * MSS WFS and the labels from the current UI language; all of it is escaped
 * (see `escapeHtml`).
 */
export function socialAtlasPopupHtml(p: SocialAtlasFeatureProps): string {
  return `<div style="font-size:13px;max-width:300px">
      <div style="font-weight:600;margin-bottom:6px">${escapeHtml(p.plrName)}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        ${row('mapPopup.socialAtlas.unemployment', `${p.unemployment?.toFixed(1) ?? '–'}%`)}
        ${row('mapPopup.socialAtlas.singleParent', `${p.singleParent?.toFixed(1) ?? '–'}%`)}
        ${row('mapPopup.socialAtlas.welfare', `${p.welfare?.toFixed(1) ?? '–'}%`)}
        ${row('mapPopup.socialAtlas.childPoverty', `${p.childPoverty?.toFixed(1) ?? '–'}%`)}
      </table>
    </div>`;
}

/**
 * Popup markup for a population planning area, escaped like
 * `socialAtlasPopupHtml`. The labels are the population tile's, and the
 * counts are grouped the way the current UI language writes them.
 */
export function populationPopupHtml(p: PopulationFeatureProps): string {
  const locale = i18n.language;
  return `<div style="font-size:13px;max-width:300px">
      <div style="font-weight:600;margin-bottom:6px">${escapeHtml(p.plrName)}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        ${row('panel.population.title', p.population?.toLocaleString(locale) ?? '–')}
        ${row('panel.population.densityLabel', `${p.density?.toLocaleString(locale) ?? '–'}/km²`)}
        ${row('panel.population.foreign', `${p.foreignPct?.toFixed(1) ?? '–'}%`)}
        ${row('panel.population.elderly', `${p.elderlyPct?.toFixed(1) ?? '–'}%`)}
        ${row('panel.population.youth', `${p.youthPct?.toFixed(1) ?? '–'}%`)}
      </table>
    </div>`;
}

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

  let hoveredPlrId: string | null = null;

  _saMouseMove = (e) => {
    const me = e as MapLayerEvent;
    if (!me.features?.length) return;
    const p = me.features[0].properties as unknown as SocialAtlasFeatureProps;
    if (p.plrId === hoveredPlrId) return;
    hoveredPlrId = p.plrId;
    map.getCanvas().style.cursor = 'pointer';
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], socialAtlasPopupHtml(p), { sticky: false });
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
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], socialAtlasPopupHtml(p), { sticky: true });
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

  let hoveredPlrId: string | null = null;

  _popMouseMove = (e) => {
    const me = e as MapLayerEvent;
    if (!me.features?.length) return;
    const p = me.features[0].properties as unknown as PopulationFeatureProps;
    if (p.plrId === hoveredPlrId) return;
    hoveredPlrId = p.plrId;
    map.getCanvas().style.cursor = 'pointer';
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], populationPopupHtml(p), { sticky: false });
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
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], populationPopupHtml(p), { sticky: true });
  };

  map.on('mousemove', 'population-fill', _popMouseMove);
  map.on('mouseleave', 'population-fill', _popMouseLeave);
  map.on('click', 'population-fill', _popClick);
}
