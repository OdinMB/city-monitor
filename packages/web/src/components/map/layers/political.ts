/**
 * Political district layer: GeoJSON boundaries, party-colored fills, and markers.
 */

import maplibregl from 'maplibre-gl';
import { Landmark } from 'lucide';
import type { PoliticalDistrict } from '../../../lib/api.js';
import { getPartyColor, getMajorityParty } from '../../../lib/party-colors.js';
import { registerPoliticalIcons, createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
import { DISTRICT_URLS, POLITICAL_MARKER_LAYER, POLITICAL_MARKER_SOURCE } from '../constants.js';
import { normalizePoliticalName } from '../base.js';

export async function addDistrictLayer(map: maplibregl.Map, cityId: string, isDark: boolean) {
  const config = DISTRICT_URLS[cityId];
  if (!config) return;

  let geojson: GeoJSON.FeatureCollection;
  try {
    const res = await fetch(config.url);
    geojson = await res.json();
  } catch {
    return;
  }

  for (const id of ['district-label', 'district-line', 'district-fill']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('districts')) map.removeSource('districts');

  map.addSource('districts', {
    type: 'geojson',
    data: geojson,
    generateId: true,
  });

  map.addLayer({
    id: 'district-fill',
    type: 'fill',
    source: 'districts',
    paint: {
      'fill-color': isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        isDark ? 0.12 : 0.08,
        1,
      ],
    },
  });

  map.addLayer({
    id: 'district-line',
    type: 'line',
    source: 'districts',
    paint: {
      'line-color': isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
      'line-width': 1.5,
      'line-dasharray': [4, 2],
    },
  });

  map.addLayer({
    id: 'district-label',
    type: 'symbol',
    source: 'districts',
    layout: {
      'text-field': ['get', config.nameField],
      'text-size': 14,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-anchor': 'center',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.7)',
      'text-halo-color': isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.5,
    },
  });
}

export function applyPoliticalStyling(
  map: maplibregl.Map,
  districts: PoliticalDistrict[],
  isDark: boolean,
  nameField: string,
) {
  if (!map.getLayer('district-fill') || !map.getSource('districts')) return;

  const colorMap = new Map<string, string>();
  for (const d of districts) {
    const majorityParty = getMajorityParty(d.representatives);
    if (majorityParty) {
      colorMap.set(normalizePoliticalName(d.name), getPartyColor(majorityParty));
    }
  }

  if (colorMap.size > 0) {
    const matchExpr: unknown[] = ['match', ['downcase', ['get', nameField]]];
    for (const [name, color] of colorMap) {
      matchExpr.push(name, color);
    }
    matchExpr.push(isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)');

    map.setPaintProperty('district-fill', 'fill-color', matchExpr as maplibregl.ExpressionSpecification);
    map.setPaintProperty('district-fill', 'fill-opacity', 0.35);
  }
}

export function resetDistrictStyling(map: maplibregl.Map, isDark: boolean) {
  if (!map.getLayer('district-fill')) return;
  map.setPaintProperty(
    'district-fill',
    'fill-color',
    isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
  );
  map.setPaintProperty('district-fill', 'fill-opacity', [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    isDark ? 0.12 : 0.08,
    1,
  ]);
}

export function sortRepsByPartyMajority(reps: PoliticalDistrict['representatives']): PoliticalDistrict['representatives'] {
  const counts = new Map<string, number>();
  for (const r of reps) counts.set(r.party, (counts.get(r.party) ?? 0) + 1);
  return [...reps].sort((a, b) => {
    const ca = counts.get(a.party) ?? 0;
    const cb = counts.get(b.party) ?? 0;
    if (ca !== cb) return cb - ca;
    if (a.party !== b.party) return a.party.localeCompare(b.party);
    return a.name.localeCompare(b.name);
  });
}

export function buildPoliticalPopupHtml(districtName: string, districts: PoliticalDistrict[]): string {
  const normalized = normalizePoliticalName(districtName);
  const match = districts.find(
    (d) => normalizePoliticalName(d.name) === normalized,
  );
  if (!match || match.representatives.length === 0) {
    return `<div style="font-size:13px"><strong>${districtName}</strong><br><em>No data available</em></div>`;
  }

  const sorted = sortRepsByPartyMajority(match.representatives);

  const parts = [`<div style="font-size:13px;max-height:400px;overflow-y:auto">`];
  parts.push(`<div style="font-weight:600;margin-bottom:6px">${districtName}</div>`);

  for (const rep of sorted) {
    const color = getPartyColor(rep.party);
    parts.push(
      `<div style="border-left:3px solid ${color};padding-left:8px;margin-bottom:6px">` +
      `<strong>${rep.name}</strong> <span style="opacity:0.6;font-size:11px">${rep.party}</span><br>` +
      `<span style="font-size:11px;opacity:0.7">${rep.role}${rep.constituency ? ` — ${rep.constituency}` : ''}</span>` +
      (rep.profileUrl ? `<br><a href="${rep.profileUrl}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">Profile →</a>` : '') +
      `</div>`,
    );
  }

  parts.push(`</div>`);
  return parts.join('');
}

export function setupDistrictHover(map: maplibregl.Map) {
  let hoveredId: number | null = null;

  map.on('mousemove', 'district-fill', (e) => {
    if (!e.features?.length) return;
    const id = e.features[0].id as number;
    if (hoveredId === id) return;

    if (hoveredId !== null) {
      map.setFeatureState({ source: 'districts', id: hoveredId }, { hover: false });
    }
    hoveredId = id;
    map.setFeatureState({ source: 'districts', id }, { hover: true });
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'district-fill', () => {
    if (hoveredId !== null) {
      map.setFeatureState({ source: 'districts', id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    map.getCanvas().style.cursor = '';
  });
}

/** Compute a simple centroid from a polygon's first ring (average of vertices) */
export function polygonCentroid(coords: number[][]): [number, number] {
  let sumLon = 0;
  let sumLat = 0;
  const n = coords.length > 1 ? coords.length - 1 : coords.length;
  for (let i = 0; i < n; i++) {
    sumLon += coords[i][0];
    sumLat += coords[i][1];
  }
  return [sumLon / n, sumLat / n];
}

export function updatePoliticalMarkers(
  map: maplibregl.Map,
  districts: PoliticalDistrict[],
  geojsonFeatures: GeoJSON.Feature[],
  subLayer: 'bezirke' | 'bundestag' | 'landesparlament',
  nameField: string,
  isDark: boolean,
) {
  if (map.getLayer(POLITICAL_MARKER_LAYER)) map.removeLayer(POLITICAL_MARKER_LAYER);
  if (map.getSource(POLITICAL_MARKER_SOURCE)) map.removeSource(POLITICAL_MARKER_SOURCE);

  if (!districts.length || !geojsonFeatures.length) return;

  const colorMap = new Map<string, string>();
  const mayorMap = new Map<string, string>();
  const uniqueColors = new Set<string>();
  for (const d of districts) {
    const party = getMajorityParty(d.representatives);
    const color = party ? getPartyColor(party) : '#808080';
    const norm = normalizePoliticalName(d.name);
    colorMap.set(norm, color);
    uniqueColors.add(color);
    if (d.representatives.length > 0) {
      mayorMap.set(norm, d.representatives[0].name);
    }
  }

  uniqueColors.add('#808080');
  const useBadges = subLayer === 'bezirke';
  if (!useBadges) {
    registerPoliticalIcons(map, subLayer, [...uniqueColors], isDark);
  }

  const stroke = isDark ? '#1f2937' : '#ffffff';
  const points: GeoJSON.Feature[] = [];

  for (const f of geojsonFeatures) {
    const name = f.properties?.[nameField] as string | undefined;
    if (!name) continue;

    const geom = f.geometry;
    let centroid: [number, number];
    if (geom.type === 'Polygon') {
      centroid = polygonCentroid((geom as GeoJSON.Polygon).coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      const coords = (geom as GeoJSON.MultiPolygon).coordinates;
      let best = coords[0][0];
      for (const poly of coords) {
        if (poly[0].length > best.length) best = poly[0];
      }
      centroid = polygonCentroid(best);
    } else {
      continue;
    }

    const color = colorMap.get(normalizePoliticalName(name)) ?? '#808080';
    let iconId: string;

    if (useBadges) {
      const mayor = mayorMap.get(normalizePoliticalName(name)) ?? name;
      iconId = `pol-badge-${encodeURIComponent(mayor)}-${color.replace('#', '')}`;
      if (!map.hasImage(iconId)) {
        map.addImage(iconId, createVerticalBadgeIcon(Landmark as IconNode, color, stroke, mayor));
      }
    } else {
      iconId = `political-icon-${color.replace('#', '')}`;
    }

    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: centroid },
      properties: { name, iconId, color },
    });
  }

  if (!points.length) return;

  map.addSource(POLITICAL_MARKER_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: points },
  });

  map.addLayer({
    id: POLITICAL_MARKER_LAYER,
    type: 'symbol',
    source: POLITICAL_MARKER_SOURCE,
    layout: {
      'icon-image': ['get', 'iconId'],
      'icon-size': useBadges ? 1 : 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });
}

export function removePoliticalMarkers(map: maplibregl.Map) {
  if (map.getLayer(POLITICAL_MARKER_LAYER)) map.removeLayer(POLITICAL_MARKER_LAYER);
  if (map.getSource(POLITICAL_MARKER_SOURCE)) map.removeSource(POLITICAL_MARKER_SOURCE);
}
