/**
 * NINA warning polygon layers.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { NinaWarning } from '../../../lib/api.js';
import { NINA_SEVERITY_COLORS } from '../constants.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, sourceText } from '../popups.js';

function warningsToGeoJSON(warnings: NinaWarning[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const w of warnings) {
    if (!w.area) continue;
    const area = w.area as GeoJSON.Feature | GeoJSON.FeatureCollection;
    if (area.type === 'FeatureCollection') {
      for (const f of (area as GeoJSON.FeatureCollection).features) {
        features.push({
          ...f,
          properties: {
            ...f.properties,
            warningId: w.id,
            headline: w.headline,
            severity: w.severity,
            fillColor: NINA_SEVERITY_COLORS[w.severity] ?? NINA_SEVERITY_COLORS.minor,
          },
        });
      }
    } else if (area.type === 'Feature') {
      features.push({
        ...(area as GeoJSON.Feature),
        properties: {
          ...(area as GeoJSON.Feature).properties,
          warningId: w.id,
          headline: w.headline,
          severity: w.severity,
          fillColor: NINA_SEVERITY_COLORS[w.severity] ?? NINA_SEVERITY_COLORS.minor,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function updateWarningPolygons(map: maplibregl.Map, warnings: NinaWarning[], _isDark: boolean) {
  const geojson = warningsToGeoJSON(warnings);

  for (const id of ['warning-fill', 'warning-line']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('warning-areas')) map.removeSource('warning-areas');

  if (geojson.features.length === 0) return;

  map.addSource('warning-areas', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'warning-fill',
    type: 'fill',
    source: 'warning-areas',
    paint: {
      'fill-color': ['get', 'fillColor'],
      'fill-opacity': 1,
    },
  });

  map.addLayer({
    id: 'warning-line',
    type: 'line',
    source: 'warning-areas',
    paint: {
      'line-color': '#ef4444',
      'line-width': 1.5,
      'line-opacity': 0.6,
    },
  });

  registerPopupHandlers(map, 'warning-fill', (e) => {
    if (!e.features?.length) return null;
    return { html: warningPopupHtml(e.features[0].properties!), lngLat: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
  });
}

/**
 * Popup markup for a NINA warning area. The headline comes from the warning
 * feed, in German (`sourceText`), and the severity name from the current UI
 * language (the same words as the warning banner); both are escaped (see
 * `escapeHtml`).
 */
export function warningPopupHtml(props: Record<string, unknown>): string {
  const severity = String(props.severity ?? '');
  return `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${sourceText(props.headline)}</div>
      <div style="opacity:0.6;font-size:11px">${escapeHtml(i18n.t(`nina.severity.${severity}`, severity))}</div>
    </div>`;
}
