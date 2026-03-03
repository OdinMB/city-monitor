/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Emergency pharmacy and AED defibrillator map markers.
 */

import maplibregl from 'maplibre-gl';
import type { EmergencyPharmacy, AedLocation } from '../../../lib/api.js';
import { MAP_DENSITY } from '../../../lib/map-settings.js';
import { registerPopupHandlers } from '../popups.js';

/** Format "2026-03-03T09:00:00" range into e.g. "Today 09:00 – Tomorrow 09:00" or "3 Mar 09:00 – 4 Mar 09:00" */
function formatPharmacyDuty(from: string, until: string): string {
  const fmt = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (target.getTime() === today.getTime()) return `Today ${time}`;
    if (target.getTime() === tomorrow.getTime()) return `Tomorrow ${time}`;
    const day = d.getDate();
    const mon = d.toLocaleString([], { month: 'short' });
    return `${day} ${mon} ${time}`;
  };
  return `${fmt(from)} – ${fmt(until)}`;
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
    minzoom: MAP_DENSITY.pharmacyMinZoom,
    layout: {
      'icon-image': 'pharmacy-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'pharmacy-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const [lon, lat] = coords;
    const dutyLabel = formatPharmacyDuty(props.validFrom, props.validUntil);
    const osmUrl = `https://www.openstreetmap.org/directions?route=;${lat},${lon}`;
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${props.name}</div>
      <div style="font-size:12px">${props.address}</div>
      ${props.phone ? `<div style="font-size:12px;margin-top:2px">Tel: ${props.phone}</div>` : ''}
      <div style="font-size:11px;opacity:0.6;margin-top:4px">${dutyLabel}</div>
      <a href="${osmUrl}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">Directions ↗</a>
    </div>`;
    return { html, lngLat: coords };
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
    minzoom: MAP_DENSITY.aedMinZoom,
    layout: {
      'icon-image': 'aed-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'aed-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const [lon, lat] = coords;
    const indoorBadge = props.indoor === true || props.indoor === 'true'
      ? '<span style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">Indoor</span>'
      : '<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">Outdoor</span>';
    const accessLabel = props.access ? `<div style="font-size:11px;opacity:0.6">Access: ${props.access}</div>` : '';
    const osmUrl = `https://www.openstreetmap.org/directions?route=;${lat},${lon}`;
    const html = `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">AED / Defibrillator${indoorBadge}</div>
      ${props.description ? `<div style="font-size:12px">${props.description}</div>` : ''}
      ${props.operator ? `<div style="font-size:12px;margin-top:2px">${props.operator}</div>` : ''}
      ${props.openingHours ? `<div style="font-size:11px;opacity:0.6;margin-top:2px">${props.openingHours}</div>` : ''}
      ${accessLabel}
      <a href="${osmUrl}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">Directions ↗</a>
    </div>`;
    return { html, lngLat: coords };
  });
}
