/**
 * Noise sensor map markers (Sensor.Community DNMS).
 */

import maplibregl from 'maplibre-gl';
import { Volume2 } from 'lucide';
import type { NoiseSensor } from '../../../lib/api.js';
import { NOISE_LEVEL_COLORS, createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
import { registerPopupHandlers, type PopupContentFn } from '../popups.js';

function getNoiseLevel(laeq: number): { key: string; label: string; color: string } {
  if (laeq < 45) return { key: 'quiet', label: 'Quiet', color: NOISE_LEVEL_COLORS.quiet };
  if (laeq < 55) return { key: 'moderate', label: 'Moderate', color: NOISE_LEVEL_COLORS.moderate };
  if (laeq < 65) return { key: 'loud', label: 'Loud', color: NOISE_LEVEL_COLORS.loud };
  return { key: 'veryLoud', label: 'Very Loud', color: NOISE_LEVEL_COLORS.veryLoud };
}

/** Image ID for a noise badge: `noise-badge-{roundedDb}-{levelKey}` */
function badgeId(roundedDb: number, levelKey: string) {
  return `noise-badge-${roundedDb}-${levelKey}`;
}

function sensorsToGeoJSON(sensors: NoiseSensor[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const s of sensors) {
    const level = getNoiseLevel(s.laeq);
    const rounded = Math.round(s.laeq);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        id: s.id,
        laeq: s.laeq,
        laMin: s.laMin,
        laMax: s.laMax,
        color: level.color,
        level: level.key,
        levelLabel: level.label,
        iconId: badgeId(rounded, level.key),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function updateNoiseSensorMarkers(map: maplibregl.Map, sensors: NoiseSensor[], isDark: boolean) {
  const geojson = sensorsToGeoJSON(sensors);

  for (const id of ['noise-sensor-label', 'noise-sensor-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('noise-sensors')) map.removeSource('noise-sensors');

  if (geojson.features.length === 0) return;

  // Register a badge image for each unique dB+level combo
  const stroke = isDark ? '#1f2937' : '#ffffff';
  const registered = new Set<string>();
  for (const s of sensors) {
    const level = getNoiseLevel(s.laeq);
    const rounded = Math.round(s.laeq);
    const id = badgeId(rounded, level.key);
    if (registered.has(id)) continue;
    registered.add(id);
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createVerticalBadgeIcon(Volume2 as IconNode, level.color, stroke, `${rounded} dB`));
  }

  map.addSource('noise-sensors', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'noise-sensor-icon',
    type: 'symbol',
    source: 'noise-sensors',
    layout: {
      'icon-image': ['get', 'iconId'] as unknown as maplibregl.ExpressionSpecification,
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  const getContent: PopupContentFn = (e) => {
    if (!e.features?.length) return null;
    const p = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const level = getNoiseLevel(Number(p.laeq));
    const html = `<div style="font-size:13px;max-width:220px">
      <div style="font-weight:600;margin-bottom:4px">Noise Sensor #${p.id}</div>
      <div>L<sub>Aeq</sub>: <strong style="color:${level.color}">${p.laeq} dB</strong> (${level.label})</div>
      <div style="font-size:11px;color:${isDark ? '#aaa' : '#666'}">Min: ${p.laMin} dB · Max: ${p.laMax} dB</div>
      <div style="font-size:10px;color:${isDark ? '#888' : '#999'};margin-top:4px">Sensor.Community DNMS</div>
    </div>`;
    return { html, lngLat: coords };
  };
  registerPopupHandlers(map, 'noise-sensor-icon', getContent, { offset: 16, maxWidth: '240px' });
}
