/**
 * EV charging stations: a circle per station, coloured and sized by power
 * class (normal, fast, high power), with a ring for the live status where the
 * city has it (Hamburg) (.context/ev-charging.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { EvChargingData, EvChargingStation, EvLivePoint, EvPointStatus } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr, sourceText } from '../popups.js';
import { EV_LIVE_STATES, EV_POWER_CLASSES } from '../constants.js';

const SOURCE = 'ev-stations';
const CIRCLE_LAYER = 'ev-station-circle';
/** From this power a station is high-power charging (HPC). */
const HPC_KW = 150;

export type EvPowerClass = 'normal' | 'fast' | 'hpc';

export function powerClass(s: Pick<EvChargingStation, 'fast' | 'maxKw'>): EvPowerClass {
  if ((s.maxKw ?? 0) >= HPC_KW) return 'hpc';
  return s.fast ? 'fast' : 'normal';
}

/**
 * What the ring says about a station's charge points: `available` when one is
 * free, `occupied` when none is free but one is in use, `outOfOrder` when all
 * are, `unknown` otherwise; null without a live status.
 */
export function liveState(points: readonly EvLivePoint[] | undefined): EvPointStatus | null {
  if (!points || points.length === 0) return null;
  if (points.some((p) => p.status === 'available')) return 'available';
  if (points.some((p) => p.status === 'occupied')) return 'occupied';
  if (points.every((p) => p.status === 'outOfOrder')) return 'outOfOrder';
  return 'unknown';
}

/** "14:05" today, "2 Nov, 23:40" on another day, in the UI language. */
function formatSince(seconds: number): string {
  const d = new Date(seconds * 1000);
  const locale = i18n.language;
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, ${time}`;
}

/** "2026-09-01" → "1 Sep 2026" in the UI language. */
function formatEdition(edition: string): string {
  const d = new Date(`${edition}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return edition;
  return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A charge point's own number from its EVSE id ("DE*HHM*E977*02" → "02"). */
function pointLabel(id: string): string {
  const parts = id.split('*');
  return parts.length >= 4 ? parts.at(-1)! : id;
}

/**
 * Popup markup for a station. Operator and address come from the register
 * (`sourceText`), the words from the current UI language; all of it is
 * escaped (see `escapeHtml`).
 */
export function evStationPopupHtml(s: EvChargingStation, edition: string | null, isDark: boolean): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const muted = isDark ? '#aaa' : '#666';
  const cls = powerClass(s);
  const color = EV_POWER_CLASSES.find((c) => c.key === cls)!.color;
  const plugs = s.plugs.map((p) => t(`mapPopup.ev.plug.${p}`)).join(', ');

  let live = '';
  if (s.live && s.live.length > 0) {
    const free = s.live.filter((p) => p.status === 'available').length;
    const rows = s.live.map((p) => {
      const stateColor = EV_LIVE_STATES.find((st) => st.key === p.status)?.color ?? muted;
      const since = p.since !== null ? ` <span style="color:${muted}">${t('mapPopup.ev.since')} ${ltr(escapeHtml(formatSince(p.since)))}</span>` : '';
      return `<div style="display:flex;gap:6px;align-items:center"><span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:${stateColor};flex-shrink:0"></span>${ltr(escapeHtml(pointLabel(p.id)))}: ${t(`mapPopup.ev.status.${p.status}`)}${since}</div>`;
    }).join('');
    live = `<div style="margin-top:6px;font-weight:600">${t('mapPopup.ev.live', { free, total: s.live.length })}</div>${rows}`;
  }

  return `<div style="font-size:13px;max-width:260px">
      <div style="font-weight:600;margin-bottom:2px">${sourceText(s.operator)}</div>
      ${s.address ? `<div style="color:${muted};margin-bottom:4px">${sourceText(s.address)}</div>` : ''}
      <div><span style="color:${color};font-weight:600">${t(`sidebar.evLegend.${cls}`)}</span>${s.maxKw !== null ? ` · ${t('mapPopup.ev.upTo')} ${ltr(escapeHtml(`${s.maxKw} kW`))}` : ''}</div>
      <div>${t('mapPopup.ev.points')}: ${ltr(escapeHtml(s.points))}</div>
      ${plugs ? `<div>${t('mapPopup.ev.plugs')}: ${plugs}</div>` : ''}
      ${live}
      ${edition ? `<div style="font-size:10px;color:${isDark ? '#888' : '#999'};margin-top:4px">${t('mapPopup.ev.register')} ${ltr(escapeHtml(formatEdition(edition)))}</div>` : ''}
    </div>`;
}

function toGeoJSON(data: EvChargingData | null): GeoJSON.FeatureCollection {
  const rank: Record<EvPowerClass, number> = { normal: 0, fast: 1, hpc: 2 };
  const features: GeoJSON.Feature[] = (data?.stations ?? []).map((s, i) => {
    const cls = powerClass(s);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      // The popup looks the station up by index; maplibre would flatten its arrays
      properties: { i, cls, rank: rank[cls], live: liveState(s.live) ?? 'none' },
    };
  });
  return { type: 'FeatureCollection', features };
}

export function updateEvChargingMarkers(map: maplibregl.Map, data: EvChargingData | null, isDark: boolean) {
  if (map.getLayer(CIRCLE_LAYER)) map.removeLayer(CIRCLE_LAYER);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);

  const geojson = toGeoJSON(data);
  if (geojson.features.length === 0) return;

  map.addSource(SOURCE, { type: 'geojson', data: geojson });

  const [normal, fast, hpc] = EV_POWER_CLASSES.map((c) => c.color);
  const [available, occupied, outOfOrder] = EV_LIVE_STATES.map((c) => c.color);
  const cls = ['get', 'cls'];
  const live = ['get', 'live'];
  const plainStroke = isDark ? '#1f2937' : '#ffffff';
  map.addLayer({
    id: CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE,
    // High-power chargers on top where circles overlap
    layout: { 'circle-sort-key': ['get', 'rank'] as unknown as maplibregl.ExpressionSpecification },
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, ['match', cls, 'hpc', 4, 'fast', 3.5, 2.5],
        15, ['match', cls, 'hpc', 10, 'fast', 8.5, 6.5],
      ] as unknown as maplibregl.ExpressionSpecification,
      'circle-color': ['match', cls, 'hpc', hpc, 'fast', fast, normal] as unknown as maplibregl.ExpressionSpecification,
      'circle-opacity': 0.9,
      'circle-stroke-color': [
        'match', live, 'available', available, 'occupied', occupied, 'outOfOrder', outOfOrder, 'unknown', '#94a3b8', plainStroke,
      ] as unknown as maplibregl.ExpressionSpecification,
      // A live ring stands out from the plain outline
      'circle-stroke-width': [
        'interpolate', ['linear'], ['zoom'],
        10, ['match', live, 'none', 0.5, 1.5],
        15, ['match', live, 'none', 1.5, 3],
      ] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  registerPopupHandlers(map, CIRCLE_LAYER, (e) => {
    const f = e.features?.[0];
    const station = f ? data?.stations[Number(f.properties?.i)] : undefined;
    if (!f || !station) return null;
    const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: evStationPopupHtml(station, data?.edition ?? null, isDark), lngLat: coords };
  }, { offset: 10, maxWidth: '280px' });
}
