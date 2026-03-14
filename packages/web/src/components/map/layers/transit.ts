/**
 * Transit alert map markers grouped by station.
 */

import maplibregl from 'maplibre-gl';
import { TrainFront } from 'lucide';
import type { TransitAlert } from '../../../lib/api.js';
import { SEVERITY_COLORS, createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
import { registerPopupHandlers, type PopupContentFn } from '../popups.js';

interface StationGroup {
  station: string;
  lat: number;
  lon: number;
  alerts: TransitAlert[];
  highestSeverity: TransitAlert['severity'];
}

function alertsToGeoJSON(alerts: TransitAlert[]): GeoJSON.FeatureCollection {
  const byKey = new Map<string, StationGroup>();

  for (const a of alerts) {
    if (!a.location) continue;
    const key = `${a.location.lat.toFixed(4)},${a.location.lon.toFixed(4)}`;
    const group = byKey.get(key);
    if (group) {
      group.alerts.push(a);
      if (a.severity === 'high' || (a.severity === 'medium' && group.highestSeverity === 'low')) {
        group.highestSeverity = a.severity;
      }
    } else {
      byKey.set(key, {
        station: a.station,
        lat: a.location.lat,
        lon: a.location.lon,
        alerts: [a],
        highestSeverity: a.severity,
      });
    }
  }

  const features: GeoJSON.Feature[] = [];
  for (const [, group] of byKey) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [group.lon, group.lat],
      },
      properties: {
        station: group.station,
        count: group.alerts.length,
        severity: group.highestSeverity,
        color: SEVERITY_COLORS[group.highestSeverity] ?? SEVERITY_COLORS.low,
        label: group.alerts.length > 1
          ? `${group.alerts.length}`
          : group.alerts[0].line,
        iconId: `transit-badge-${encodeURIComponent(group.alerts.length > 1 ? String(group.alerts.length) : group.alerts[0].line)}-${group.highestSeverity}`,
        alertsJson: JSON.stringify(group.alerts.map((a) => ({
          line: a.line,
          type: a.type,
          severity: a.severity,
          message: a.message,
          detail: a.detail,
        }))),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

function buildPopupHtml(props: Record<string, unknown>): string {
  const alertsRaw = props.alertsJson as string;
  let alerts: Array<{ line: string; type: string; severity: string; message: string; detail: string }>;
  try {
    alerts = JSON.parse(alertsRaw);
  } catch {
    return '';
  }

  const station = props.station as string;
  const parts = [`<div style="font-size:13px;max-height:240px;overflow-y:auto">`];
  parts.push(`<div style="font-weight:600;margin-bottom:6px">${station}</div>`);

  for (const a of alerts) {
    const sevColor = SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.low;
    const typeLabel = a.type.replace('-', ' ');
    parts.push(
      `<div style="border-left:3px solid ${sevColor};padding-left:8px;margin-bottom:8px">` +
      `<strong>${a.line}</strong> <span style="opacity:0.6;font-size:11px">${typeLabel}</span><br>` +
      `<span style="font-size:12px">${a.detail}</span>` +
      `</div>`,
    );
  }

  parts.push(`</div>`);
  return parts.join('');
}

export function updateTransitMarkers(map: maplibregl.Map, alerts: TransitAlert[], isDark: boolean) {
  const geojson = alertsToGeoJSON(alerts);

  for (const id of ['transit-marker-label', 'transit-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('transit-markers')) map.removeSource('transit-markers');

  if (geojson.features.length === 0) return;

  // Register a badge image for each unique label+severity combo
  const stroke = isDark ? '#1f2937' : '#ffffff';
  const registered = new Set<string>();
  for (const f of geojson.features) {
    const p = f.properties!;
    const id = p.iconId as string;
    if (registered.has(id)) continue;
    registered.add(id);
    if (map.hasImage(id)) map.removeImage(id);
    const color = SEVERITY_COLORS[p.severity as string] ?? SEVERITY_COLORS.low;
    map.addImage(id, createVerticalBadgeIcon(TrainFront as IconNode, color, stroke, p.label as string));
  }

  map.addSource('transit-markers', {
    type: 'geojson',
    data: geojson,
  });

  map.addLayer({
    id: 'transit-marker-icon',
    type: 'symbol',
    source: 'transit-markers',
    layout: {
      'icon-image': ['get', 'iconId'] as unknown as maplibregl.ExpressionSpecification,
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  const getTransitContent: PopupContentFn = (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties;
    if (!props) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const html = buildPopupHtml(props);
    if (!html) return null;
    return { html, lngLat: coords };
  };
  registerPopupHandlers(map, 'transit-marker-icon', getTransitContent, { offset: 16 });
}
