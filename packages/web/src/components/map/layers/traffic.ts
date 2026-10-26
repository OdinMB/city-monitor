/**
 * Traffic incident and construction/roadwork map layers.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { TrafficIncident, ConstructionSite } from '../../../lib/api.js';
import { CONSTRUCTION_SUBTYPE_COLORS } from '../../../lib/map-icons.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { TRAFFIC_SEVERITY_COLORS } from '../constants.js';
import { ltr, registerPopupHandlers } from '../popups.js';

function trafficToGeoJSON(incidents: TrafficIncident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const inc of incidents) {
    if (!inc.geometry?.coordinates?.length) continue;
    features.push({
      type: 'Feature',
      geometry: inc.geometry as GeoJSON.Geometry,
      properties: {
        id: inc.id,
        type: inc.type,
        severity: inc.severity,
        description: inc.description,
        road: inc.road ?? '',
        from: inc.from ?? '',
        to: inc.to ?? '',
        delay: inc.delay ?? 0,
        color: TRAFFIC_SEVERITY_COLORS[inc.severity] ?? TRAFFIC_SEVERITY_COLORS.low,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Move transit marker layers above traffic/construction so they're not hidden. */
export function raiseTransitLayers(map: maplibregl.Map) {
  for (const id of ['transit-marker-icon']) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

export function updateTrafficLayers(map: maplibregl.Map, incidents: TrafficIncident[], _isDark: boolean) {
  const geojson = trafficToGeoJSON(incidents);

  for (const id of ['traffic-line', 'traffic-line-casing']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('traffic-incidents')) map.removeSource('traffic-incidents');

  if (geojson.features.length === 0) return;

  map.addSource('traffic-incidents', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'traffic-line-casing',
    type: 'line',
    source: 'traffic-incidents',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#000000',
      'line-width': 6,
      'line-opacity': 0.3,
    },
  });

  map.addLayer({
    id: 'traffic-line',
    type: 'line',
    source: 'traffic-incidents',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 4,
      'line-opacity': 0.8,
    },
  });

  registerPopupHandlers(map, 'traffic-line', (e) => {
    if (!e.features?.length) return null;
    return { html: trafficPopupHtml(e.features[0].properties!), lngLat: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
  });

  raiseTransitLayers(map);
}

/**
 * Name of a traffic incident type or roadworks subtype in the current UI
 * language. A type the bundles do not know is shown as the feed sent it.
 */
function roadEventLabel(type: unknown): string {
  const raw = String(type ?? '');
  return i18n.t(`mapPopup.roadEvent.${raw}`, raw);
}

/**
 * Popup markup for a traffic incident, from its feature properties. Road,
 * description and place names come from the traffic feed and the words from
 * the current UI language; all of it is escaped (see `escapeHtml`).
 */
export function trafficPopupHtml(props: Record<string, unknown>): string {
  const delayMin = props.delay ? Math.round(Number(props.delay) / 60) : 0;
  return `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${escapeHtml(roadEventLabel(props.type))}${props.road ? ` — ${escapeHtml(props.road)}` : ''}</div>
      ${props.description ? `<div style="font-size:12px">${escapeHtml(props.description)}</div>` : ''}
      ${props.from && props.to ? `<div style="font-size:11px;opacity:0.6;margin-top:2px">${escapeHtml(props.from)} → ${escapeHtml(props.to)}</div>` : ''}
      ${delayMin > 0 ? `<div style="font-size:11px;margin-top:2px">${escapeHtml(i18n.t('mapPopup.delay', { count: delayMin }))}</div>` : ''}
    </div>`;
}

/**
 * Popup markup for a roadworks site, escaped like `trafficPopupHtml`. The
 * validity range is feed data in German format ("01.03.2026 06:00 –
 * 30.11.2026 17:00") with no translated words, so it stays one left-to-right
 * run; in an Arabic popup its dates and times would otherwise swap places.
 */
export function constructionPopupHtml(p: Record<string, unknown>): string {
  return `<div style="font-size:13px;max-width:280px">
    <div style="font-weight:600;margin-bottom:4px">${escapeHtml(roadEventLabel(p.subtype))}: ${escapeHtml(p.street)}</div>
    ${p.section ? `<div style="font-size:12px;opacity:0.7">${escapeHtml(p.section)}</div>` : ''}
    ${p.description ? `<div style="font-size:12px;margin-top:2px">${escapeHtml(p.description)}</div>` : ''}
    ${p.validFrom ? `<div style="font-size:11px;opacity:0.6;margin-top:4px">${ltr(`${escapeHtml(p.validFrom)}${p.validUntil ? ` – ${escapeHtml(p.validUntil)}` : ''}`)}</div>` : ''}
    ${p.direction ? `<div style="font-size:11px;opacity:0.6">${escapeHtml(p.direction)}</div>` : ''}
  </div>`;
}

function constructionToGeoJSON(sites: ConstructionSite[]): { lines: GeoJSON.FeatureCollection; points: GeoJSON.FeatureCollection } {
  const lines: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  for (const site of sites) {
    const color = CONSTRUCTION_SUBTYPE_COLORS[site.subtype] ?? CONSTRUCTION_SUBTYPE_COLORS.construction;
    const props = {
      id: site.id,
      subtype: site.subtype,
      street: site.street,
      section: site.section ?? '',
      description: site.description,
      direction: site.direction ?? '',
      validFrom: site.validFrom ?? '',
      validUntil: site.validUntil ?? '',
      color,
      iconImage: `construction-icon-${site.subtype}`,
    };

    const geomType = site.geometry?.type;
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
      lines.push({ type: 'Feature', geometry: site.geometry as GeoJSON.Geometry, properties: props });
    } else if (geomType === 'Point') {
      points.push({ type: 'Feature', geometry: site.geometry as GeoJSON.Geometry, properties: props });
    } else if (geomType === 'GeometryCollection') {
      const gc = site.geometry as unknown as { geometries: GeoJSON.Geometry[] };
      for (const g of gc.geometries ?? []) {
        if (g.type === 'LineString' || g.type === 'MultiLineString') {
          lines.push({ type: 'Feature', geometry: g, properties: props });
        } else if (g.type === 'Point') {
          points.push({ type: 'Feature', geometry: g, properties: props });
        }
      }
    }
  }
  return {
    lines: { type: 'FeatureCollection', features: lines },
    points: { type: 'FeatureCollection', features: points },
  };
}

export function updateConstructionLayers(map: maplibregl.Map, sites: ConstructionSite[], _isDark: boolean) {
  const { lines, points } = constructionToGeoJSON(sites);

  for (const id of ['construction-line', 'construction-line-casing', 'construction-points']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('construction-lines')) map.removeSource('construction-lines');
  if (map.getSource('construction-points')) map.removeSource('construction-points');

  if (lines.features.length === 0 && points.features.length === 0) return;

  if (lines.features.length > 0) {
    map.addSource('construction-lines', { type: 'geojson', data: lines });

    map.addLayer({
      id: 'construction-line-casing',
      type: 'line',
      source: 'construction-lines',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000000', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 13, 3, 15, 5, 17, 8], 'line-opacity': 0.2 },
    });

    map.addLayer({
      id: 'construction-line',
      type: 'line',
      source: 'construction-lines',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 2, 15, 3.5, 17, 6],
        'line-opacity': 0.7,
        'line-dasharray': [4, 3],
      },
    });

    registerPopupHandlers(map, 'construction-line', (e) => {
      if (!e.features?.length) return null;
      const p = e.features[0].properties!;
      return { html: constructionPopupHtml(p), lngLat: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
    });
  }

  if (points.features.length > 0) {
    map.addSource('construction-points', { type: 'geojson', data: points });

    map.addLayer({
      id: 'construction-points',
      type: 'symbol',
      source: 'construction-points',
      layout: {
        'icon-image': ['get', 'iconImage'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.15, 13, 0.45, 15, 0.8, 17, 1.2],
        'icon-allow-overlap': true,
      },
    });

    registerPopupHandlers(map, 'construction-points', (e) => {
      if (!e.features?.length) return null;
      const p = e.features[0].properties!;
      return { html: constructionPopupHtml(p), lngLat: [e.lngLat.lng, e.lngLat.lat] as [number, number] };
    });
  }

  raiseTransitLayers(map);
}
