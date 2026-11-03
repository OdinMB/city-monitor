/**
 * Street counts of citizen Telraam sensors (Berlin zählt Mobilität): a circle
 * per counted segment, sized by the vehicles it counted on the day shown and
 * coloured by the share of bikes among them (.context/telraam-counts.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { TelraamCountsData } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr, sourceText } from '../popups.js';
import { TELRAAM_BIKE_SHARE } from '../constants.js';

const SOURCE = 'telraam-counts';
const CIRCLE_LAYER = 'telraam-circle';

/** Bikes as a share of the vehicles counted (bikes, cars, heavy vehicles); 0 when none were. */
export function bikeShare(p: { bikes: number; cars: number; heavy: number }): number {
  const vehicles = p.bikes + p.cars + p.heavy;
  return vehicles > 0 ? p.bikes / vehicles : 0;
}

/** The change from the usual value in whole percent ("+12 %", "−8 %"), or null without a usual value. */
export function changeFromUsual(value: number, usual: number | null): string | null {
  if (usual === null || !(usual > 0)) return null;
  const pct = Math.round(((value - usual) / usual) * 100);
  if (pct === 0) return '±0 %';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

/** "Monday, 2 November" for a YYYY-MM-DD day, in the UI language. */
function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * Popup markup for a counted segment, from its feature properties. The street
 * and district come from OpenStreetMap (`sourceText`), the words from the
 * current UI language; all of it is escaped (see `escapeHtml`).
 */
export function telraamPopupHtml(p: Record<string, unknown>, isDark: boolean): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const muted = isDark ? '#aaa' : '#666';
  const fmt = (v: number) => v.toLocaleString(i18n.language);
  const days = n(p.usualDays);
  const row = (label: string, value: number, usual: number | null) => {
    const change = days !== null ? changeFromUsual(value, usual) : null;
    return `<tr><td style="padding-inline-end:8px">${t(label)}</td><td style="text-align:end"><strong>${ltr(escapeHtml(fmt(value)))}</strong></td>`
      + `<td style="padding-inline-start:8px;color:${muted};font-size:11px">${change !== null ? ltr(escapeHtml(change)) : ''}</td></tr>`;
  };
  const cars = Number(p.cars);
  const bikes = Number(p.bikes);
  const pedestrians = Number(p.pedestrians);
  const heavy = Number(p.heavy);
  const share = Math.round(bikeShare({ bikes, cars, heavy }) * 100);
  const segmentUrl = `https://telraam.net/en/location/${encodeURIComponent(String(p.id))}`;
  return `<div style="font-size:13px;max-width:260px">
      <div style="font-weight:600">${p.street ? sourceText(p.street) : t('mapPopup.telraam.unnamed')}</div>
      ${p.district ? `<div style="font-size:11px;color:${muted}">${sourceText(p.district)}</div>` : ''}
      <div style="font-size:11px;color:${muted};margin:4px 0">${t('mapPopup.telraam.day', { day: formatDay(String(p.date)), hours: Number(p.hours) })}</div>
      <table style="border-collapse:collapse">
        ${row('mapPopup.telraam.cars', cars, n(p.usualCars))}
        ${row('mapPopup.telraam.bikes', bikes, n(p.usualBikes))}
        ${row('mapPopup.telraam.pedestrians', pedestrians, n(p.usualPedestrians))}
        ${row('mapPopup.telraam.heavy', heavy, n(p.usualHeavy))}
      </table>
      <div style="margin-top:4px">${t('mapPopup.telraam.bikeShare')}: <strong>${ltr(escapeHtml(`${share} %`))}</strong></div>
      <div style="font-size:11px;color:${muted};margin-top:2px">${days !== null ? t('mapPopup.telraam.vsUsual') : t('mapPopup.telraam.noUsual')}</div>
      <div style="font-size:10px;color:${isDark ? '#888' : '#999'};margin-top:4px">${t('mapPopup.telraam.citizen')} · <a href="${escapeHtml(segmentUrl)}" target="_blank" rel="noopener noreferrer" style="color:inherit">Telraam ↗</a> · Berlin zählt Mobilität</div>
    </div>`;
}

function toGeoJSON(data: TelraamCountsData | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = (data?.segments ?? []).map((s) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: {
      id: s.id,
      street: s.street,
      district: s.district,
      date: data!.date,
      hours: s.hours,
      cars: s.cars,
      bikes: s.bikes,
      pedestrians: s.pedestrians,
      heavy: s.heavy,
      vehicles: s.cars + s.bikes + s.heavy,
      share: bikeShare(s),
      // MapLibre flattens properties: the usual values travel one by one
      usualCars: s.usual?.cars ?? null,
      usualBikes: s.usual?.bikes ?? null,
      usualPedestrians: s.usual?.pedestrians ?? null,
      usualHeavy: s.usual?.heavy ?? null,
      usualDays: s.usual?.days ?? null,
    },
  }));
  return { type: 'FeatureCollection', features };
}

export function updateTelraamMarkers(map: maplibregl.Map, data: TelraamCountsData | null, isDark: boolean) {
  if (map.getLayer(CIRCLE_LAYER)) map.removeLayer(CIRCLE_LAYER);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);

  const geojson = toGeoJSON(data);
  if (geojson.features.length === 0) return;

  map.addSource(SOURCE, { type: 'geojson', data: geojson });

  const vehicles = ['get', 'vehicles'] as unknown as maplibregl.ExpressionSpecification;
  const [first, ...rest] = TELRAAM_BIKE_SHARE;
  map.addLayer({
    id: CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE,
    // Busy streets drawn last, on top
    layout: { 'circle-sort-key': vehicles },
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, ['interpolate', ['linear'], vehicles, 0, 3, 10000, 7],
        14, ['interpolate', ['linear'], vehicles, 0, 6, 10000, 14],
      ] as unknown as maplibregl.ExpressionSpecification,
      'circle-color': ['step', ['get', 'share'], first.color, ...rest.flatMap((c) => [c.from, c.color])] as unknown as maplibregl.ExpressionSpecification,
      'circle-opacity': 0.9,
      'circle-stroke-color': isDark ? '#1f2937' : '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });

  registerPopupHandlers(map, CIRCLE_LAYER, (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: telraamPopupHtml(e.features[0].properties!, isDark), lngLat: coords };
  }, { offset: 10, maxWidth: '280px' });
}
