/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Air quality grid map layer.
 */

import maplibregl from 'maplibre-gl';
import type { AirQualityGridPoint } from '../../../lib/api.js';
import { AQI_LEVEL_COLORS } from '../../../lib/map-icons.js';
import { getAqiLevel } from '../../../lib/aqi.js';
import { registerPopupHandlers, type PopupContentFn } from '../popups.js';

function aqGridToGeoJSON(points: AirQualityGridPoint[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of points) {
    const level = getAqiLevel(p.europeanAqi);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        aqi: p.europeanAqi,
        station: p.station,
        color: level.color,
        level: level.label,
        label: String(p.europeanAqi),
        url: p.url ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function updateAqGridLayer(map: maplibregl.Map, points: AirQualityGridPoint[], isDark: boolean) {
  const geojson = aqGridToGeoJSON(points);

  for (const id of ['aq-marker-label', 'aq-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('aq-grid')) map.removeSource('aq-grid');

  if (geojson.features.length === 0) return;

  map.addSource('aq-grid', { type: 'geojson', data: geojson });

  const iconMatch: unknown[] = ['match', ['get', 'level']];
  for (const level of Object.keys(AQI_LEVEL_COLORS)) {
    iconMatch.push(level, `aq-icon-${level}`);
  }
  iconMatch.push('aq-icon-good'); // fallback

  map.addLayer({
    id: 'aq-marker-icon',
    type: 'symbol',
    source: 'aq-grid',
    layout: {
      'icon-image': iconMatch as maplibregl.ExpressionSpecification,
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  map.addLayer({
    id: 'aq-marker-label',
    type: 'symbol',
    source: 'aq-grid',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 9,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-offset': [0, 2.8],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
      'text-halo-color': isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
      'text-halo-width': 1,
    },
  });

  const getAqContent: PopupContentFn = (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const level = getAqiLevel(Number(props.aqi));
    const linkIcon = props.url
      ? ` <a href="${props.url}" target="_blank" rel="noopener" style="display:inline;color:#3b82f6;text-decoration:none;margin-left:3px;vertical-align:middle"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
      : '';
    const html = `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:4px">${props.station}${linkIcon}</div>
      <div style="font-size:12px">AQI: <strong style="color:${level.color}">${props.aqi}</strong> (${level.label})</div>
    </div>`;
    return { html, lngLat: coords };
  };
  registerPopupHandlers(map, 'aq-marker-icon', getAqContent, { offset: 12, maxWidth: '260px' });
  registerPopupHandlers(map, 'aq-marker-label', getAqContent, { offset: 12, maxWidth: '260px' });
}
