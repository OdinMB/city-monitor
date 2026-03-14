/**
 * Air quality grid map layer.
 */

import maplibregl from 'maplibre-gl';
import { Wind } from 'lucide';
import type { AirQualityGridPoint } from '../../../lib/api.js';
import { createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
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
        iconId: `aq-badge-${p.europeanAqi}-${level.label}`,
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

  // Register a badge image for each unique AQI value + level
  const stroke = isDark ? '#1f2937' : '#ffffff';
  const registered = new Set<string>();
  for (const p of points) {
    const level = getAqiLevel(p.europeanAqi);
    const id = `aq-badge-${p.europeanAqi}-${level.label}`;
    if (registered.has(id)) continue;
    registered.add(id);
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createVerticalBadgeIcon(Wind as IconNode, level.color, stroke, `${p.europeanAqi} AQI`));
  }

  map.addSource('aq-grid', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'aq-marker-icon',
    type: 'symbol',
    source: 'aq-grid',
    layout: {
      'icon-image': ['get', 'iconId'] as unknown as maplibregl.ExpressionSpecification,
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
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
  registerPopupHandlers(map, 'aq-marker-icon', getAqContent, { offset: 16, maxWidth: '260px' });
}
