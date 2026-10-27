/**
 * Political district layer: GeoJSON boundaries, party-colored fills, and markers.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import { Landmark } from 'lucide';
import type { PoliticalDistrict } from '../../../lib/api.js';
import { getPartyColor, getMajorityParty } from '../../../lib/party-colors.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { safeUrl } from '../../../lib/safe-url.js';
import { forwardArrow } from '../../../lib/bidi.js';
import { registerPoliticalIcons, createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
import { DISTRICT_URLS, POLITICAL_MARKER_LAYER, POLITICAL_MARKER_SOURCE } from '../constants.js';
import { sourceText } from '../popups.js';

/** A spaced dash joins the areas a constituency covers
 *  ("Hamburg-Bergedorf – Harburg"); hyphens inside a name have no spaces. */
const AREA_SEPARATOR = /\s+[–—-]\s+/;

/** How well an area of a district's name names a boundary: 0 exactly,
 *  1 after dropping a leading city segment ("Berlin-Mitte" → "mitte"). */
function areaRank(area: string, boundary: string): number | undefined {
  if (area === boundary) return 0;
  const dash = area.indexOf('-');
  if (dash > 0 && area.slice(dash + 1) === boundary) return 1;
  return undefined;
}

/**
 * The political district whose data belongs on a Bezirk boundary.
 *
 * Boundary names ("Steglitz-Zehlendorf", "Hamburg-Nord", "Harburg") and data
 * names differ: the Bezirk levels use the boundary name itself, Bundestag
 * constituencies put the city in front ("Berlin-Steglitz-Zehlendorf",
 * "Hamburg-Altona") and may name more areas after a spaced dash
 * ("Berlin-Spandau – Charlottenburg Nord", "Hamburg-Bergedorf – Harburg").
 * A constituency's first area wins over one named after the dash.
 */
export function findPoliticalDistrict<T extends { name: string }>(
  boundaryName: string,
  districts: T[],
): T | undefined {
  const boundary = boundaryName.trim().toLowerCase();
  if (!boundary) return undefined;
  let best: T | undefined;
  let bestRank = Infinity;
  for (const d of districts) {
    const areas = d.name.trim().toLowerCase().split(AREA_SEPARATOR);
    areas.forEach((area, i) => {
      const rank = areaRank(area, boundary);
      if (rank === undefined) return;
      const total = i === 0 ? rank : 2 + rank;
      if (total < bestRank) {
        best = d;
        bestRank = total;
      }
    });
  }
  return best;
}

/** District paint values derived from dark/light theme. */
function districtPaint(isDark: boolean) {
  return {
    fillColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    lineColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
    lineWidth: 1.5 as const,
    lineDash: [4, 2] as number[],
    textColor: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.7)',
    textHaloColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
    textHaloWidth: 1.5,
  };
}

/** Marker symbol layer IDs — district labels must render below all of these */
const MARKER_LAYER_IDS = [
  'transit-marker-icon', 'news-marker-icon', 'safety-marker-icon',
  'wl-marker-icon', 'bathing-marker-icon', 'aq-marker-icon',
  'noise-sensor-icon', 'pharmacy-marker-icon', 'aed-marker-icon',
  'construction-points', 'political-markers',
  'traffic-incidents-circle', 'traffic-incidents-label',
];

/** Move district-label below the first existing marker layer so labels render behind markers. */
export function ensureDistrictLabelsBelow(map: maplibregl.Map) {
  if (!map.getLayer('district-label')) return;
  for (const id of MARKER_LAYER_IDS) {
    if (map.getLayer(id)) {
      map.moveLayer('district-label', id);
      return;
    }
  }
}

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

  const dp = districtPaint(isDark);

  map.addLayer({
    id: 'district-fill',
    type: 'fill',
    source: 'districts',
    paint: {
      'fill-color': dp.fillColor,
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
      'line-color': dp.lineColor,
      'line-width': dp.lineWidth,
      'line-dasharray': dp.lineDash,
    },
  });

  // Find the first existing marker layer so we insert district-label below it
  let beforeId: string | undefined;
  for (const id of MARKER_LAYER_IDS) {
    if (map.getLayer(id)) { beforeId = id; break; }
  }

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
      'text-color': dp.textColor,
      'text-halo-color': dp.textHaloColor,
      'text-halo-width': dp.textHaloWidth,
    },
  }, beforeId);
}

/**
 * Add the districts GeoJSON source and three layers (fill, line, label)
 * with flat fill-opacity for political mode. Does NOT fetch GeoJSON or
 * remove existing layers — callers handle those concerns differently.
 */
export function addDistrictSource(
  map: maplibregl.Map,
  geojson: GeoJSON.FeatureCollection,
  nameField: string,
  isDark: boolean,
): void {
  const dp = districtPaint(isDark);

  map.addSource('districts', { type: 'geojson', data: geojson, generateId: true });
  map.addLayer({
    id: 'district-fill',
    type: 'fill',
    source: 'districts',
    paint: {
      'fill-color': dp.fillColor,
      'fill-opacity': 0.35,
    },
  });
  map.addLayer({
    id: 'district-line',
    type: 'line',
    source: 'districts',
    paint: {
      'line-color': dp.lineColor,
      'line-width': dp.lineWidth,
      'line-dasharray': dp.lineDash,
    },
  });
  map.addLayer({
    id: 'district-label',
    type: 'symbol',
    source: 'districts',
    layout: {
      'text-field': ['get', nameField],
      'text-size': 14,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-anchor': 'center',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': dp.textColor,
      'text-halo-color': dp.textHaloColor,
      'text-halo-width': dp.textHaloWidth,
    },
  });
  ensureDistrictLabelsBelow(map);
}

/**
 * Fill each Bezirk boundary with its majority party's colour. The match
 * expression is keyed by the boundary names in `geojsonFeatures`, each resolved
 * to its district with `findPoliticalDistrict`.
 */
export function applyPoliticalStyling(
  map: maplibregl.Map,
  districts: PoliticalDistrict[],
  geojsonFeatures: GeoJSON.Feature[],
  isDark: boolean,
  nameField: string,
) {
  if (!map.getLayer('district-fill') || !map.getSource('districts')) return;

  const colorMap = new Map<string, string>();
  for (const f of geojsonFeatures) {
    const name = f.properties?.[nameField];
    if (typeof name !== 'string' || colorMap.has(name)) continue;
    const majorityParty = getMajorityParty(findPoliticalDistrict(name, districts)?.representatives ?? []);
    if (majorityParty) {
      colorMap.set(name, getPartyColor(majorityParty));
    }
  }

  if (colorMap.size > 0) {
    const dp = districtPaint(isDark);
    const matchExpr: unknown[] = ['match', ['get', nameField]];
    for (const [name, color] of colorMap) {
      matchExpr.push(name, color);
    }
    matchExpr.push(dp.fillColor);

    map.setPaintProperty('district-fill', 'fill-color', matchExpr as maplibregl.ExpressionSpecification);
    map.setPaintProperty('district-fill', 'fill-opacity', 0.35);
  }
}

export function resetDistrictStyling(map: maplibregl.Map, isDark: boolean) {
  if (!map.getLayer('district-fill')) return;
  const dp = districtPaint(isDark);
  map.setPaintProperty('district-fill', 'fill-color', dp.fillColor);
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

/**
 * Popup markup for a district's representatives. Names, parties, roles and
 * links come from the API, in German (`sourceText`), and the words from the
 * current UI language; all of it is escaped (see `escapeHtml`).
 */
export function buildPoliticalPopupHtml(districtName: string, districts: PoliticalDistrict[]): string {
  const match = findPoliticalDistrict(districtName, districts);
  if (!match || match.representatives.length === 0) {
    return `<div style="font-size:13px"><strong>${sourceText(districtName)}</strong><br><em>${escapeHtml(i18n.t('panel.political.empty'))}</em></div>`;
  }

  const profileLabel = `${escapeHtml(i18n.t('mapPopup.profile'))} ${forwardArrow()}`;
  const sorted = sortRepsByPartyMajority(match.representatives);

  const parts = [`<div style="font-size:13px;max-height:400px;overflow-y:auto">`];
  parts.push(`<div style="font-weight:600;margin-bottom:6px">${sourceText(districtName)}</div>`);

  for (const rep of sorted) {
    const color = getPartyColor(rep.party);
    const profileUrl = safeUrl(rep.profileUrl);
    parts.push(
      `<div style="border-inline-start:3px solid ${color};padding-inline-start:8px;margin-bottom:6px">` +
      `<strong>${sourceText(rep.name)}</strong> <span style="opacity:0.6;font-size:11px">${sourceText(rep.party)}</span><br>` +
      `<span style="font-size:11px;opacity:0.7">${sourceText(rep.role)}${rep.constituency ? ` — ${sourceText(rep.constituency)}` : ''}</span>` +
      (profileUrl ? `<br><a href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener" style="font-size:11px;color:#3b82f6">${profileLabel}</a>` : '') +
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

  const districtColor = (d: PoliticalDistrict | undefined): string => {
    const party = d ? getMajorityParty(d.representatives) : undefined;
    return party ? getPartyColor(party) : '#808080';
  };
  const uniqueColors = new Set<string>(districts.map(districtColor));

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

    const district = findPoliticalDistrict(name, districts);
    const color = districtColor(district);
    let iconId: string;

    if (useBadges) {
      const mayor = district?.representatives[0]?.name ?? name;
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
