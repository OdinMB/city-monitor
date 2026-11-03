/**
 * Bike-sharing stations: a circle per station, sized and coloured by the
 * bikes available, with the count written in at street zoom
 * (.context/bike-sharing.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { BikeSharingData } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr, sourceText } from '../popups.js';
import { BIKE_AVAILABILITY } from '../constants.js';

const SOURCE = 'bike-stations';
const CIRCLE_LAYER = 'bike-station-circle';
const COUNT_LAYER = 'bike-station-count';
/** The counts are written into the circles from this zoom on; below it they would only overlap. */
const COUNT_MIN_ZOOM = 14;

/** "01:15" today, "2 Nov, 23:40" on another day, in the UI language. */
function formatReported(seconds: number): string {
  const d = new Date(seconds * 1000);
  const locale = i18n.language;
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * Popup markup for a station, from its feature properties. The station name
 * comes from the operator's feed (`sourceText`), the words from the current UI
 * language; all of it is escaped (see `escapeHtml`).
 */
export function bikeStationPopupHtml(p: Record<string, unknown>, isDark: boolean): string {
  const t = (key: string) => escapeHtml(i18n.t(key));
  const muted = isDark ? '#aaa' : '#666';
  const docks = p.docks === null || p.docks === undefined || p.docks === '' ? null : Number(p.docks);
  const reportedAt = p.reportedAt === null || p.reportedAt === undefined || p.reportedAt === '' ? null : Number(p.reportedAt);
  return `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:4px">${sourceText(p.name)}</div>
      <div>${t('mapPopup.bike.bikes')}: <strong>${ltr(escapeHtml(p.bikes))}</strong></div>
      ${docks !== null && Number.isFinite(docks) ? `<div>${t('mapPopup.bike.docks')}: ${ltr(escapeHtml(docks))}</div>` : ''}
      ${reportedAt !== null && Number.isFinite(reportedAt) ? `<div style="font-size:11px;color:${muted};margin-top:2px">${t('mapPopup.bike.updated')}: ${ltr(escapeHtml(formatReported(reportedAt)))}</div>` : ''}
      <div style="font-size:10px;color:${isDark ? '#888' : '#999'};margin-top:4px">${sourceText(p.system)} · ${sourceText(p.operator)}</div>
    </div>`;
}

function toGeoJSON(data: BikeSharingData | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = (data?.stations ?? []).map((s) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: {
      name: s.name,
      bikes: s.bikes,
      docks: s.docks,
      reportedAt: s.reportedAt,
      system: data!.system,
      operator: data!.operator,
    },
  }));
  return { type: 'FeatureCollection', features };
}

export function updateBikeSharingMarkers(map: maplibregl.Map, data: BikeSharingData | null, isDark: boolean) {
  for (const id of [COUNT_LAYER, CIRCLE_LAYER]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);

  const geojson = toGeoJSON(data);
  if (geojson.features.length === 0) return;

  map.addSource(SOURCE, { type: 'geojson', data: geojson });

  const [none, few, many] = BIKE_AVAILABILITY.map((b) => b.color);
  const bikes = ['get', 'bikes'] as unknown as maplibregl.ExpressionSpecification;
  map.addLayer({
    id: CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE,
    paint: {
      // Small dots for the whole city, bigger ones with room for the count close in
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, ['interpolate', ['linear'], bikes, 0, 2, 10, 4.5],
        14, ['interpolate', ['linear'], bikes, 0, 6, 10, 11],
      ] as unknown as maplibregl.ExpressionSpecification,
      'circle-color': ['step', bikes, none, 1, few, 3, many] as unknown as maplibregl.ExpressionSpecification,
      'circle-opacity': 0.9,
      'circle-stroke-color': isDark ? '#1f2937' : '#ffffff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  map.addLayer({
    id: COUNT_LAYER,
    type: 'symbol',
    source: SOURCE,
    minzoom: COUNT_MIN_ZOOM,
    layout: {
      'text-field': ['to-string', bikes] as unknown as maplibregl.ExpressionSpecification,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  });

  registerPopupHandlers(map, CIRCLE_LAYER, (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: bikeStationPopupHtml(e.features[0].properties!, isDark), lngLat: coords };
  }, { offset: 10, maxWidth: '260px' });
}
