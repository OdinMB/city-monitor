/**
 * Last year's injury accidents from the Unfallatlas: a heat map of where they
 * cluster at city zoom, and a circle per accident coloured by its worst injury
 * from zoom 12. Accidents with someone killed are drawn as circles at every
 * zoom, so the heat map never hides them (.context/traffic-accidents.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { TrafficAccident, TrafficAccidentData } from '../../../lib/api.js';
import type { AccidentFilter } from '../../../hooks/useCommandCenter.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr } from '../popups.js';
import { ACCIDENT_SEVERITY } from '../constants.js';

const SOURCE = 'traffic-accidents';
const HEAT_LAYER = 'accident-heat';
const CIRCLE_LAYER = 'accident-circle';
const FATAL_LAYER = 'accident-fatal';
/** Single accidents are drawn from this zoom on; below it the heat map shows where they gather. */
const CIRCLE_MIN_ZOOM = 12;

/**
 * Who was involved, as bits of a `TrafficAccident`'s last field (the server's
 * ACCIDENT_PARTICIPANTS in lib/unfallatlas.ts), with the `mapPopup.accident.participant` key.
 */
export const ACCIDENT_PARTICIPANTS = [
  ['bike', 1],
  ['car', 2],
  ['pedestrian', 4],
  ['motorcycle', 8],
  ['goods', 16],
  ['other', 32],
] as const;

const BIKE_BIT = 1;
const PEDESTRIAN_BIT = 4;

/** Whether an accident belongs to the sidebar's filter. */
export function matchesAccidentFilter(accident: TrafficAccident, filter: AccidentFilter): boolean {
  if (filter === 'bike') return (accident[8] & BIKE_BIT) !== 0;
  if (filter === 'pedestrian') return (accident[8] & PEDESTRIAN_BIT) !== 0;
  return true;
}

/** Accidents per severity (index 1–3) among those the filter keeps. */
export function countBySeverity(accidents: readonly TrafficAccident[], filter: AccidentFilter): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const a of accidents) if (matchesAccidentFilter(a, filter)) counts[a[2]]++;
  return counts;
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

/**
 * Popup markup for an accident from its feature properties (`s` severity, `m`
 * month, `w` weekday 1 = Sunday, `h` hour, `k` kind, `t` type, `p`
 * participants). Every word comes from the UI language; month and weekday
 * names from the browser's Intl in that language.
 */
export function accidentPopupHtml(p: Record<string, unknown>, year: number, isDark: boolean): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const locale = i18n.language;
  const severity = num(p.s);
  const month = num(p.m);
  const weekday = num(p.w);
  const hour = num(p.h);
  const participants = num(p.p);
  const color = ACCIDENT_SEVERITY.find((c) => c.severity === severity)?.color ?? '#999';
  const muted = isDark ? '#aaa' : '#666';

  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  // 1 January 2023 was a Sunday, the Unfallatlas's weekday 1
  const dayName = new Date(Date.UTC(2023, 0, weekday)).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
  const pad = (n: number) => String(n).padStart(2, '0');
  const band = `${pad(hour)}:00–${pad(hour + 1)}:00`;
  const involved = ACCIDENT_PARTICIPANTS
    .filter(([, bit]) => (participants & bit) !== 0)
    .map(([key]) => t(`mapPopup.accident.participant.${key}`));

  return `<div style="font-size:13px;max-width:260px">
      <div style="font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span>${t(`mapPopup.accident.severity.${severity}`)}</div>
      <div>${t(`mapPopup.accident.type.${num(p.t)}`)}</div>
      <div style="font-size:12px;color:${muted}">${t(`mapPopup.accident.kind.${num(p.k)}`)}</div>
      <div style="margin-top:4px">${escapeHtml(monthName)} · ${escapeHtml(dayName)}, ${ltr(escapeHtml(band))}</div>
      ${involved.length > 0 ? `<div>${t('mapPopup.accident.involved')}: ${involved.join(', ')}</div>` : ''}
      <div style="font-size:10px;color:${isDark ? '#888' : '#999'};margin-top:4px">${t('mapPopup.accident.source', { year })}</div>
    </div>`;
}

function toGeoJSON(data: TrafficAccidentData | null, filter: AccidentFilter): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const a of data?.accidents ?? []) {
    if (!matchesAccidentFilter(a, filter)) continue;
    const [lon, lat, s, m, w, h, k, t, p] = a;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { s, m, w, h, k, t, p } });
  }
  return { type: 'FeatureCollection', features };
}

/** What the popups show; the handlers are registered once per map and read this. */
const popupState = new WeakMap<maplibregl.Map, { year: number; isDark: boolean }>();

export function updateTrafficAccidentLayer(map: maplibregl.Map, data: TrafficAccidentData | null, filter: AccidentFilter, isDark: boolean) {
  for (const id of [FATAL_LAYER, CIRCLE_LAYER, HEAT_LAYER]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);

  const geojson = toGeoJSON(data, filter);
  if (!data || geojson.features.length === 0) return;

  map.addSource(SOURCE, { type: 'geojson', data: geojson });

  const [killed, serious, slight] = ACCIDENT_SEVERITY.map((c) => c.color);
  const severity = ['get', 's'] as unknown as maplibregl.ExpressionSpecification;
  const color = ['match', severity, 1, killed, 2, serious, slight] as unknown as maplibregl.ExpressionSpecification;
  const stroke = isDark ? '#f9fafb' : '#ffffff';

  map.addLayer({
    id: HEAT_LAYER,
    type: 'heatmap',
    source: SOURCE,
    maxzoom: CIRCLE_MIN_ZOOM + 1,
    paint: {
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 12, 12] as unknown as maplibregl.ExpressionSpecification,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 12, 1] as unknown as maplibregl.ExpressionSpecification,
      // Transparent where there are none, then yellow through orange to deep red
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(250,204,21,0)', 0.2, 'rgba(250,204,21,0.55)', 0.5, 'rgba(249,115,22,0.75)', 1, 'rgba(153,27,27,0.9)',
      ] as unknown as maplibregl.ExpressionSpecification,
      // Fades out while the single accidents fade in
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], CIRCLE_MIN_ZOOM, 0.85, CIRCLE_MIN_ZOOM + 1, 0] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  map.addLayer({
    id: CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE,
    minzoom: CIRCLE_MIN_ZOOM,
    layout: {
      // The worst accidents on top
      'circle-sort-key': ['-', 4, severity] as unknown as maplibregl.ExpressionSpecification,
    },
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        CIRCLE_MIN_ZOOM, ['match', severity, 1, 5, 2, 3.5, 2.5],
        16, ['match', severity, 1, 9, 2, 7, 5.5],
      ] as unknown as maplibregl.ExpressionSpecification,
      'circle-color': color,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], CIRCLE_MIN_ZOOM, 0.4, CIRCLE_MIN_ZOOM + 1, 0.9] as unknown as maplibregl.ExpressionSpecification,
      'circle-stroke-color': stroke,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], CIRCLE_MIN_ZOOM, 0.3, 16, 1] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  map.addLayer({
    id: FATAL_LAYER,
    type: 'circle',
    source: SOURCE,
    maxzoom: CIRCLE_MIN_ZOOM,
    filter: ['==', severity, 1] as unknown as maplibregl.FilterSpecification,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, CIRCLE_MIN_ZOOM, 5] as unknown as maplibregl.ExpressionSpecification,
      'circle-color': killed,
      'circle-stroke-color': stroke,
      'circle-stroke-width': 1,
    },
  });

  const registered = popupState.has(map);
  popupState.set(map, { year: data.year, isDark });
  if (registered) return;
  for (const layer of [CIRCLE_LAYER, FATAL_LAYER]) {
    registerPopupHandlers(map, layer, (e) => {
      const state = popupState.get(map);
      if (!e.features?.length || !state) return null;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      return { html: accidentPopupHtml(e.features[0].properties!, state.year, state.isDark), lngLat: coords };
    }, { offset: 8, maxWidth: '280px' });
  }
}
