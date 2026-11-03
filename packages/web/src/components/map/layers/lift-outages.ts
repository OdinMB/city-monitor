/**
 * Lifts and escalators out of service: a circle per unit that has a position,
 * red for a lift, amber for an escalator, lifts drawn on top. The same data as
 * the dashboard tile (.context/lift-outages.md), so nothing extra is fetched.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { LiftOutage, LiftOutageData } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, sourceText } from '../popups.js';
import { LIFT_KIND_COLORS } from '../constants.js';

const SOURCE = 'lift-outages';
const CIRCLE_LAYER = 'lift-outage-circle';

/** DB's planned return date (YYYY-MM-DD) as a short day and month in the UI language. */
function formatResumeDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const present = (v: unknown): v is string => typeof v === 'string' && v !== '' && v !== 'null';

/**
 * Popup markup for an outage, from its feature properties. Station, unit and
 * note come from the operator (German, `sourceText`), the rest in the UI
 * language; all of it is escaped (see `escapeHtml`).
 */
export function liftOutagePopupHtml(p: Record<string, unknown>, isDark: boolean): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const kind = p.kind === 'escalator' ? 'escalator' : 'lift';
  const muted = isDark ? '#aaa' : '#666';
  const db = p.operator === 'db'
    ? ` <span style="font-size:10px;font-weight:600;padding:0 3px;border-radius:3px;background:${isDark ? '#374151' : '#f3f4f6'}">${t('panel.liftOutages.db')}</span>`
    : '';
  return `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:2px">${sourceText(p.station)}${db}</div>
      <div style="display:flex;align-items:center;gap:4px;font-size:12px"><span style="flex:none;width:8px;height:8px;border-radius:50%;background:${LIFT_KIND_COLORS[kind]}"></span><span>${t(`mapPopup.lifts.${kind}`)}</span></div>
      ${present(p.unit) ? `<div style="font-size:12px;margin-top:2px">${sourceText(p.unit)}</div>` : ''}
      ${present(p.info) ? `<div style="font-size:12px;margin-top:2px;color:${muted}">${sourceText(p.info)}</div>` : ''}
      ${present(p.resumeDate) ? `<div style="font-size:11px;margin-top:2px;color:${muted}">${t('panel.liftOutages.until', { date: formatResumeDate(p.resumeDate) })}</div>` : ''}
    </div>`;
}

export function liftOutagesToGeoJSON(outages: readonly LiftOutage[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const o of outages) {
    if (o.lat === null || o.lon === null) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [o.lon, o.lat] },
      properties: {
        kind: o.kind,
        station: o.station,
        unit: o.unit,
        info: o.info ?? '',
        operator: o.operator ?? '',
        resumeDate: o.resumeDate ?? '',
        // Lifts above escalators where they share a station
        order: o.kind === 'lift' ? 1 : 0,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function updateLiftOutageMarkers(map: maplibregl.Map, data: LiftOutageData | null, isDark: boolean) {
  if (map.getLayer(CIRCLE_LAYER)) map.removeLayer(CIRCLE_LAYER);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);

  const geojson = liftOutagesToGeoJSON(data?.outages ?? []);
  if (geojson.features.length === 0) return;

  map.addSource(SOURCE, { type: 'geojson', data: geojson });
  map.addLayer({
    id: CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE,
    layout: { 'circle-sort-key': ['get', 'order'] as unknown as maplibregl.ExpressionSpecification },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 13, 7, 16, 10] as unknown as maplibregl.ExpressionSpecification,
      'circle-color': ['match', ['get', 'kind'], 'lift', LIFT_KIND_COLORS.lift, LIFT_KIND_COLORS.escalator] as unknown as maplibregl.ExpressionSpecification,
      'circle-opacity': 0.9,
      'circle-stroke-color': isDark ? '#1f2937' : '#ffffff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  registerPopupHandlers(map, CIRCLE_LAYER, (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: liftOutagePopupHtml(e.features[0].properties!, isDark), lngLat: coords };
  }, { offset: 8, maxWidth: '260px' });
}
