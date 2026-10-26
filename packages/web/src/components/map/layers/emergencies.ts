/**
 * Emergency pharmacy and AED defibrillator map markers.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { EmergencyPharmacy, AedLocation } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr } from '../popups.js';

/**
 * Format a "2026-03-03T09:00:00" range as e.g. "Today 09:00 – Tomorrow 09:00"
 * or "3 Mar 09:00 – 4 Mar 09:00", with the day words, month names and time
 * format of the current UI language.
 */
export function formatPharmacyDuty(from: string, until: string): string {
  const locale = i18n.language;
  const fmt = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    if (target.getTime() === today.getTime()) return `${i18n.t('mapPopup.today')} ${time}`;
    if (target.getTime() === tomorrow.getTime()) return `${i18n.t('mapPopup.tomorrow')} ${time}`;
    const day = d.getDate();
    const mon = d.toLocaleString(locale, { month: 'short' });
    return `${day} ${mon} ${time}`;
  };
  return `${fmt(from)} – ${fmt(until)}`;
}

/** Link to OpenStreetMap directions to a point, labelled in the current UI language. */
function directionsLink([lon, lat]: [number, number]): string {
  const osmUrl = `https://www.openstreetmap.org/directions?route=;${lat},${lon}`;
  return `<a href="${escapeHtml(osmUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">${escapeHtml(i18n.t('mapPopup.directions'))} ↗</a>`;
}

/**
 * Popup markup for an emergency pharmacy at `coords`, from its feature
 * properties. Name, address and phone come from the pharmacy feed and the
 * words from the current UI language; all of it is escaped (see `escapeHtml`).
 */
export function pharmacyPopupHtml(props: Record<string, unknown>, coords: [number, number]): string {
  const dutyLabel = formatPharmacyDuty(String(props.validFrom ?? ''), String(props.validUntil ?? ''));
  return `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${escapeHtml(props.name)}</div>
      <div style="font-size:12px">${escapeHtml(props.address)}</div>
      ${props.phone ? `<div style="font-size:12px;margin-top:2px">${escapeHtml(i18n.t('mapPopup.phone'))}: ${ltr(escapeHtml(props.phone))}</div>` : ''}
      <div style="font-size:11px;opacity:0.6;margin-top:4px">${escapeHtml(dutyLabel)}</div>
      ${directionsLink(coords)}
    </div>`;
}

/** OSM `access` values with a translated name; `yes` reads as public. Others are shown as tagged. */
const AED_ACCESS_KEYS = new Map([
  ['yes', 'public'], ['public', 'public'], ['customers', 'customers'],
  ['private', 'private'], ['permissive', 'permissive'], ['no', 'no'],
]);

/**
 * Popup markup for a defibrillator at `coords`, from its feature properties.
 * Description, operator and hours come from OpenStreetMap and the words from
 * the current UI language; all of it is escaped (see `escapeHtml`).
 */
export function aedPopupHtml(props: Record<string, unknown>, coords: [number, number]): string {
  const t = (key: string) => escapeHtml(i18n.t(key));
  const badge = (text: string, bg: string, fg: string) =>
    `<span style="display:inline-block;background:${bg};color:${fg};font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">${text}</span>`;
  const indoorBadge = props.indoor === true || props.indoor === 'true'
    ? badge(t('mapPopup.aed.indoor'), '#dbeafe', '#1e40af')
    : badge(t('mapPopup.aed.outdoor'), '#dcfce7', '#166534');
  const access = String(props.access ?? '');
  const accessKey = AED_ACCESS_KEYS.get(access);
  const accessText = accessKey ? i18n.t(`mapPopup.aed.accessValue.${accessKey}`) : access;
  const accessLabel = access ? `<div style="font-size:11px;opacity:0.6">${t('mapPopup.aed.access')}: ${escapeHtml(accessText)}</div>` : '';
  return `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${t('mapPopup.aed.title')}${indoorBadge}</div>
      ${props.description ? `<div style="font-size:12px">${escapeHtml(props.description)}</div>` : ''}
      ${props.operator ? `<div style="font-size:12px;margin-top:2px">${escapeHtml(props.operator)}</div>` : ''}
      ${props.openingHours ? `<div style="font-size:11px;opacity:0.6;margin-top:2px">${escapeHtml(props.openingHours)}</div>` : ''}
      ${accessLabel}
      ${directionsLink(coords)}
    </div>`;
}

function pharmaciesToGeoJSON(pharmacies: EmergencyPharmacy[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of pharmacies) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.location.lon, p.location.lat] },
      properties: {
        name: p.name,
        address: p.address,
        phone: p.phone ?? '',
        validFrom: p.validFrom,
        validUntil: p.validUntil,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function aedsToGeoJSON(aeds: AedLocation[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const a of aeds) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: {
        id: a.id,
        indoor: a.indoor,
        description: a.description ?? '',
        operator: a.operator ?? '',
        openingHours: a.openingHours ?? '',
        access: a.access ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function updatePharmacyMarkers(map: maplibregl.Map, pharmacies: EmergencyPharmacy[], _isDark: boolean) {
  const geojson = pharmaciesToGeoJSON(pharmacies);

  for (const id of ['pharmacy-marker-label', 'pharmacy-marker-circle', 'pharmacy-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('pharmacy-markers')) map.removeSource('pharmacy-markers');

  if (geojson.features.length === 0) return;

  map.addSource('pharmacy-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'pharmacy-marker-icon',
    type: 'symbol',
    source: 'pharmacy-markers',
    layout: {
      'icon-image': 'pharmacy-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'pharmacy-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: pharmacyPopupHtml(e.features[0].properties!, coords), lngLat: coords };
  });
}

export function updateAedMarkers(map: maplibregl.Map, aeds: AedLocation[], _isDark: boolean) {
  const geojson = aedsToGeoJSON(aeds);

  for (const id of ['aed-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('aed-markers')) map.removeSource('aed-markers');

  if (geojson.features.length === 0) return;

  map.addSource('aed-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'aed-marker-icon',
    type: 'symbol',
    source: 'aed-markers',
    layout: {
      'icon-image': 'aed-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'aed-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: aedPopupHtml(e.features[0].properties!, coords), lngLat: coords };
  });
}
