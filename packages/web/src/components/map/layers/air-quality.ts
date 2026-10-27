/**
 * Air quality grid map layer.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import { Wind } from 'lucide';
import type { AirQualityGridPoint } from '../../../lib/api.js';
import { createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
import { AQI_SCALE_NAME, getAqiLevelOnScale, gridPointScale, waqiMapAttribution } from '../../../lib/aqi.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { safeUrl } from '../../../lib/safe-url.js';
import { ltr, registerPopupHandlers, sourceText, type PopupContentFn } from '../popups.js';

/**
 * Band and badge of a grid point. WAQI values are US AQI and Sensor.Community
 * values European AQI, so the scale is part of the badge id and text.
 */
function aqBadge(p: AirQualityGridPoint) {
  const scale = gridPointScale(p);
  const level = getAqiLevelOnScale(p.europeanAqi, scale);
  return {
    level,
    iconId: `aq-badge-${scale}-${p.europeanAqi}-${level.label}`,
    text: `${p.europeanAqi} ${AQI_SCALE_NAME[scale]}`,
  };
}

function aqGridToGeoJSON(points: AirQualityGridPoint[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of points) {
    const { level, iconId } = aqBadge(p);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        aqi: p.europeanAqi,
        station: p.station,
        color: level.color,
        level: level.label,
        iconId,
        url: p.url ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Popup markup for an air-quality station, from its feature properties. The
 * station name and link come from third-party feeds, so every value is escaped
 * (see `escapeHtml`), and the name keeps its own direction (`sourceText`). The scale follows from the link (WAQI stations show US
 * AQI), and the level label is looked up when the popup opens, so it follows
 * the current UI language, like the top bar's. The band colour is a swatch
 * beside the number, not the number's colour: US yellow is unreadable as text.
 * Swatch and number are isolated left to right (`ltr`), so in Arabic the
 * swatch's margin-inline-end still falls between them.
 */
export function aqPopupHtml(props: Record<string, unknown>): string {
  const url = typeof props.url === 'string' ? props.url : undefined;
  const scale = gridPointScale({ url });
  const level = getAqiLevelOnScale(Number(props.aqi), scale);
  const levelLabel = i18n.t(level.labelKey);
  const href = safeUrl(url);
  const linkIcon = href
    ? ` <a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline;color:#3b82f6;text-decoration:none;margin-inline-start:3px;vertical-align:middle"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
    : '';
  return `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:4px">${sourceText(props.station)}${linkIcon}</div>
      <div style="font-size:12px">${AQI_SCALE_NAME[scale]}: ${ltr(`<span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${level.color};box-shadow:0 0 0 1px rgba(0,0,0,.3);margin-inline-end:4px;vertical-align:middle"></span><strong>${escapeHtml(props.aqi)}</strong>`)} (${escapeHtml(levelLabel)})</div>
    </div>`;
}

/**
 * Draws the grid points, or clears the layer when `points` is empty (layer
 * off). The source carries the WAQI attribution, so the map's attribution
 * control lists it exactly while the layer is shown.
 */
export function updateAqGridLayer(map: maplibregl.Map, points: AirQualityGridPoint[], isDark: boolean, cityId: string) {
  const geojson = aqGridToGeoJSON(points);

  for (const id of ['aq-marker-label', 'aq-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('aq-grid')) map.removeSource('aq-grid');

  if (geojson.features.length === 0) return;

  // Register a badge image for each unique scale + AQI value + level
  const stroke = isDark ? '#1f2937' : '#ffffff';
  const registered = new Set<string>();
  for (const p of points) {
    const { level, iconId: id, text } = aqBadge(p);
    if (registered.has(id)) continue;
    registered.add(id);
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, createVerticalBadgeIcon(Wind as IconNode, level.color, stroke, text, undefined, level.textColor));
  }

  const attribution = waqiMapAttribution(points, cityId);
  map.addSource('aq-grid', { type: 'geojson', data: geojson, ...(attribution && { attribution }) });

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
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: aqPopupHtml(e.features[0].properties!), lngLat: coords };
  };
  registerPopupHandlers(map, 'aq-marker-icon', getAqContent, { offset: 16, maxWidth: '260px' });
}
