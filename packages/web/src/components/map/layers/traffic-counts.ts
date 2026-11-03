/**
 * Traffic counting sites: a circle per site and mode, coloured by the hour's
 * count against the usual count for that hour and weekday, with the count
 * written in at street zoom (.context/traffic-counts.md). Bicycle sites have a
 * dark ring, car sites a white one.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { TrafficCountData, TrafficCountMode } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr, sourceText } from '../popups.js';
import { TRAFFIC_COUNT_LEVELS, TRAFFIC_COUNT_NONE_COLOR, trafficCountLevel } from '../constants.js';

const SOURCE = 'traffic-counts';
export const TRAFFIC_COUNT_CIRCLE_LAYER = 'traffic-count-circle';
const COUNT_LAYER = 'traffic-count-label';
/** The counts are written next to the circles from this zoom on; below it they would only overlap. */
const COUNT_MIN_ZOOM = 14;

const LEVEL_COLOR: Record<string, string> = {
  ...Object.fromEntries(TRAFFIC_COUNT_LEVELS.map((l) => [l.key, l.color])),
  none: TRAFFIC_COUNT_NONE_COLOR,
};

/** "23:00–00:00" in local time, with the date when it is not today, in the UI language. */
function formatHour(iso: string): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 3_600_000);
  const locale = i18n.language;
  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const range = `${time(start)}–${time(end)}`;
  if (start.toDateString() === new Date().toDateString()) return range;
  return `${start.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, ${range}`;
}

/**
 * Popup markup for a counting site, from its feature properties. The site
 * name comes from the city's site list (`sourceText`), the words from the
 * current UI language; all of it is escaped (see `escapeHtml`).
 */
export function trafficCountPopupHtml(p: Record<string, unknown>, isDark: boolean): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const muted = isDark ? '#aaa' : '#666';
  const mode = p.mode === 'bike' ? 'bike' : 'car';
  const count = Number(p.count);
  const typical = p.typical === null || p.typical === undefined || p.typical === '' ? null : Number(p.typical);
  const level = trafficCountLevel(count, typical, mode);
  const fmt = (n: number) => ltr(escapeHtml(n.toLocaleString(i18n.language)));
  const name = p.name ? sourceText(p.name) : t('mapPopup.trafficCount.site', { site: String(p.site ?? '') });
  let comparison = '';
  if (typical !== null && level !== 'none') {
    const signed = new Intl.NumberFormat(i18n.language, { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 0 })
      .format(count / typical - 1);
    comparison = `<div>${t('mapPopup.trafficCount.typical')}: ${fmt(typical)} (${ltr(escapeHtml(signed))})</div>`;
  } else if (typical !== null) {
    comparison = `<div>${t('mapPopup.trafficCount.typical')}: ${fmt(typical)}</div>`
      + `<div style="font-size:11px;color:${muted}">${t('mapPopup.trafficCount.tooFew')}</div>`;
  } else {
    comparison = `<div style="font-size:11px;color:${muted}">${t('mapPopup.trafficCount.noTypical')}</div>`;
  }
  return `<div style="font-size:13px;max-width:260px">
      <div style="font-weight:600;margin-bottom:2px">${name}</div>
      <div style="font-size:11px;color:${muted};margin-bottom:4px">${t(`mapPopup.trafficCount.${mode}`)}</div>
      <div>${t('mapPopup.trafficCount.count')}: <strong>${fmt(count)}</strong></div>
      ${comparison}
      <div style="font-size:11px;color:${muted};margin-top:2px">${ltr(escapeHtml(formatHour(String(p.hour))))} · ${t('mapPopup.trafficCount.counters', { count: Number(p.counters) })}</div>
    </div>`;
}

function toGeoJSON(data: TrafficCountData | null, modes: ReadonlySet<TrafficCountMode>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = (data?.sites ?? [])
    .filter((s) => modes.has(s.mode))
    .map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        mode: s.mode,
        site: s.site,
        name: s.name,
        hour: s.hour,
        count: s.count,
        typical: s.typical,
        counters: s.counters,
        color: LEVEL_COLOR[trafficCountLevel(s.count, s.typical, s.mode)],
      },
    }));
  return { type: 'FeatureCollection', features };
}

export function updateTrafficCountMarkers(
  map: maplibregl.Map,
  data: TrafficCountData | null,
  modes: ReadonlySet<TrafficCountMode>,
  isDark: boolean,
) {
  for (const id of [COUNT_LAYER, TRAFFIC_COUNT_CIRCLE_LAYER]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);

  const geojson = toGeoJSON(data, modes);
  if (geojson.features.length === 0) return;

  map.addSource(SOURCE, { type: 'geojson', data: geojson });

  const isBike = ['==', ['get', 'mode'], 'bike'] as unknown as maplibregl.ExpressionSpecification;
  const light = isDark ? '#1f2937' : '#ffffff';
  const dark = isDark ? '#f9fafb' : '#1f2937';
  map.addLayer({
    id: TRAFFIC_COUNT_CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 8] as unknown as maplibregl.ExpressionSpecification,
      'circle-color': ['get', 'color'] as unknown as maplibregl.ExpressionSpecification,
      'circle-opacity': 0.95,
      'circle-stroke-color': ['case', isBike, dark, light] as unknown as maplibregl.ExpressionSpecification,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  map.addLayer({
    id: COUNT_LAYER,
    type: 'symbol',
    source: SOURCE,
    minzoom: COUNT_MIN_ZOOM,
    layout: {
      'text-field': ['to-string', ['get', 'count']] as unknown as maplibregl.ExpressionSpecification,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': 11,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': isDark ? '#e5e7eb' : '#1f2937',
      'text-halo-color': isDark ? '#111827' : '#ffffff',
      'text-halo-width': 1.2,
    },
  });

  registerPopupHandlers(map, TRAFFIC_COUNT_CIRCLE_LAYER, (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: trafficCountPopupHtml(e.features[0].properties!, isDark), lngLat: coords };
  }, { offset: 10, maxWidth: '280px' });
}
