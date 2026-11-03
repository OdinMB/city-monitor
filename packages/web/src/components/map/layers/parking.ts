/**
 * Car parks with live free spaces: a circle per car park, coloured by the share
 * of spaces free, with the free count written in at street zoom
 * (.context/parking.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { ParkingData, ParkingFacility } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr, sourceText } from '../popups.js';
import { PARKING_OCCUPANCY } from '../constants.js';

const SOURCE = 'parking';
const CIRCLE_LAYER = 'parking-circle';
const COUNT_LAYER = 'parking-count';
/** The free counts are written into the circles from this zoom on. */
const COUNT_MIN_ZOOM = 13;

/** The legend band of a car park: closed or faulty, else by the share of spaces free. */
export function parkingBand(f: Pick<ParkingFacility, 'free' | 'total' | 'status'>): (typeof PARKING_OCCUPANCY)[number]['key'] {
  if (f.status !== 'open' || f.total <= 0) return 'closed';
  const share = f.free / f.total;
  for (const band of PARKING_OCCUPANCY) {
    if (band.minShare !== null && share >= band.minShare) return band.key;
  }
  return 'few';
}

const TREND_ARROW: Record<string, string> = { filling: '↘', emptying: '↗', steady: '→' };

/** "03:05" today, "2 Nov, 23:40" on another day, in German time and the UI language. */
function formatUpdated(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const locale = i18n.language;
  const timeZone = 'Europe/Berlin';
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone });
  if (day(d) === day(now)) return time;
  return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone })}, ${time}`;
}

const present = (v: unknown) => v !== null && v !== undefined && v !== '' && v !== 'null';

/**
 * Popup markup for a car park, from its feature properties. The name comes
 * from the city's data (`sourceText`), the words from the current UI language;
 * all of it is escaped (see `escapeHtml`).
 */
export function parkingPopupHtml(p: Record<string, unknown>, isDark: boolean, now = new Date()): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const muted = isDark ? '#aaa' : '#666';
  const free = Number(p.free);
  const total = Number(p.total);
  const status = String(p.status ?? 'open');
  const band = parkingBand({ free, total, status: status as ParkingFacility['status'] });
  const color = PARKING_OCCUPANCY.find((b) => b.key === band)!.color;
  const kind = String(p.kind ?? '');
  const trend = present(p.trend) ? String(p.trend) : null;
  const updated = present(p.updated) ? formatUpdated(String(p.updated), now) : '';
  const statusLine = status === 'closed' || status === 'fault'
    ? `<div style="font-size:12px;margin-top:2px;color:${color}">${t(`mapPopup.parking.status.${status}`)}</div>`
    : '';
  const trendLine = trend && TREND_ARROW[trend]
    ? `<div style="font-size:12px;margin-top:2px">${TREND_ARROW[trend]} ${t(`mapPopup.parking.trend.${trend}`)}</div>`
    : '';
  return `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:2px">${sourceText(p.name)}</div>
      ${['garage', 'underground', 'lot'].includes(kind) ? `<div style="font-size:12px;opacity:0.7">${t(`mapPopup.parking.kind.${kind}`)}</div>` : ''}
      ${Number.isFinite(free) && Number.isFinite(total) ? `<div style="font-size:12px;margin-top:4px">${t('mapPopup.parking.free')}: <strong style="color:${color}">${ltr(escapeHtml(`${free.toLocaleString(i18n.language)} / ${total.toLocaleString(i18n.language)}`))}</strong></div>` : ''}
      ${statusLine}${trendLine}
      ${updated ? `<div style="font-size:11px;color:${muted};margin-top:2px">${t('mapPopup.parking.updated')}: ${ltr(escapeHtml(updated))}</div>` : ''}
    </div>`;
}

function toGeoJSON(data: ParkingData | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = (data?.facilities ?? []).map((f) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
    properties: {
      name: f.name,
      kind: f.kind,
      free: f.free,
      total: f.total,
      status: f.status,
      trend: f.trend,
      updated: f.updated,
      band: parkingBand(f),
    },
  }));
  return { type: 'FeatureCollection', features };
}

export function updateParkingMarkers(map: maplibregl.Map, data: ParkingData | null, isDark: boolean) {
  for (const id of [COUNT_LAYER, CIRCLE_LAYER]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);

  const geojson = toGeoJSON(data);
  if (geojson.features.length === 0) return;

  map.addSource(SOURCE, { type: 'geojson', data: geojson });

  const colorMatch: unknown[] = ['match', ['get', 'band']];
  for (const band of PARKING_OCCUPANCY) colorMatch.push(band.key, band.color);
  colorMatch.push(PARKING_OCCUPANCY.at(-1)!.color);

  map.addLayer({
    id: CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 13, 9, 16, 13] as unknown as maplibregl.ExpressionSpecification,
      'circle-color': colorMatch as maplibregl.ExpressionSpecification,
      'circle-opacity': 0.9,
      'circle-stroke-color': isDark ? '#1f2937' : '#ffffff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  map.addLayer({
    id: COUNT_LAYER,
    type: 'symbol',
    source: SOURCE,
    minzoom: COUNT_MIN_ZOOM,
    layout: {
      // "P" for a closed car park, else its free spaces
      'text-field': ['case', ['==', ['get', 'band'], 'closed'], 'P', ['to-string', ['get', 'free']]] as unknown as maplibregl.ExpressionSpecification,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': 10,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  });

  registerPopupHandlers(map, CIRCLE_LAYER, (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: parkingPopupHtml(e.features[0].properties!, isDark), lngLat: coords };
  }, { offset: 10, maxWidth: '260px' });
}
