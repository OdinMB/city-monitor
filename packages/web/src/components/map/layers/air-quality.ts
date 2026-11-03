/**
 * Air quality grid map layer.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import { Landmark, Wind } from 'lucide';
import type { AirQualityGridPoint, AirQualityStation } from '../../../lib/api.js';
import { createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
import {
  AQI_SCALE_NAME, UBA_MAP_ATTRIBUTION, UBA_SOURCE_LINE, getAqiLevelOnScale, getUbaLevel, gridPointScale, waqiMapAttribution,
} from '../../../lib/aqi.js';
import { formatClockTime } from '../../../lib/format-time.js';
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

/* ── Official stations (UBA) ──────────────────────────────── */

const POLLUTANT_ROWS = [
  ['no2', 'NO₂'],
  ['pm10', 'PM10'],
  ['pm25', 'PM2.5'],
  ['o3', 'O₃'],
] as const;

/** Badge of an official station: a landmark on its UBA index colour, with the class name in the UI language. */
function ubaBadge(index: number | null, lang: string) {
  const level = getUbaLevel(index);
  return { level, iconId: `uba-badge-${level.label}-${lang}`, text: i18n.t(level.labelKey) };
}

function ubaToGeoJSON(stations: AirQualityStation[], lang: string, timeZone: string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s): GeoJSON.Feature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        name: s.name,
        code: s.code,
        setting: s.setting,
        measuredAt: s.measuredAt,
        timeZone,
        // Feature properties may lose nulls on the way to the popup: -1 marks "not measured"
        index: s.index ?? -1,
        no2: s.no2 ?? -1,
        pm10: s.pm10 ?? -1,
        pm25: s.pm25 ?? -1,
        o3: s.o3 ?? -1,
        iconId: ubaBadge(s.index, lang).iconId,
      },
    })),
  };
}

/**
 * Popup markup for an official station, from its feature properties: name,
 * that it is an official measuring station and of which type, the UBA index
 * class, the hour's NO₂, PM10, PM2.5 and O₃ in µg/m³ (those it measures), the
 * end of the hour on the city's clock and UBA's source line. Labels follow
 * the UI language when the popup opens. Every value is escaped.
 */
export function ubaPopupHtml(props: Record<string, unknown>): string {
  const index = Number(props.index);
  const level = getUbaLevel(index >= 0 ? index : null);
  const setting = typeof props.setting === 'string' ? props.setting : '';
  const kind = `${i18n.t('panel.airQuality.officialStation')}${setting ? ` · ${i18n.t(`panel.airQuality.setting.${setting}`)}` : ''}`;
  const rows = POLLUTANT_ROWS
    .map(([key, label]) => [label, Number(props[key])] as const)
    .filter(([, v]) => Number.isFinite(v) && v >= 0)
    .map(([label, v]) => `<tr><td style="padding-inline-end:8px">${label}</td><td>${ltr(`<strong>${escapeHtml(v)}</strong> µg/m³`)}</td></tr>`)
    .join('');
  const time = formatClockTime(String(props.measuredAt ?? ''), i18n.language, String(props.timeZone ?? 'Europe/Berlin'));
  return `<div style="font-size:13px;max-width:250px">
      <div style="font-weight:600">${sourceText(props.name)}</div>
      <div style="font-size:11px;opacity:.75;margin-bottom:4px">${escapeHtml(kind)}</div>
      <div style="font-size:12px;margin-bottom:4px">${escapeHtml(i18n.t('panel.airQuality.ubaIndex'))}: <span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${level.color};box-shadow:0 0 0 1px rgba(0,0,0,.3);margin-inline-end:4px;vertical-align:middle"></span><strong>${escapeHtml(i18n.t(level.labelKey))}</strong></div>
      ${rows ? `<table style="font-size:12px;border-collapse:collapse">${rows}</table>` : ''}
      ${time ? `<div style="font-size:11px;opacity:.75;margin-top:4px">${escapeHtml(i18n.t('panel.airQuality.hourEnding', { time }))}</div>` : ''}
      <div style="font-size:10px;opacity:.6;margin-top:2px">${escapeHtml(UBA_SOURCE_LINE)}</div>
    </div>`;
}

const UBA_LAYER = 'aq-uba-icon';
const UBA_SOURCE = 'aq-uba';

/**
 * Draws the official stations, or clears them when `stations` is empty (layer
 * off, or a city without them). The source carries UBA's source line, so the
 * map's attribution control lists it while they are shown. `lang` is part of
 * each badge id, since the badge spells out the class name.
 */
export function updateUbaStationLayer(
  map: maplibregl.Map,
  stations: AirQualityStation[],
  isDark: boolean,
  lang: string,
  timeZone: string,
) {
  if (map.getLayer(UBA_LAYER)) map.removeLayer(UBA_LAYER);
  if (map.getSource(UBA_SOURCE)) map.removeSource(UBA_SOURCE);
  if (stations.length === 0) return;

  const stroke = isDark ? '#1f2937' : '#ffffff';
  const registered = new Set<string>();
  for (const s of stations) {
    const { level, iconId, text } = ubaBadge(s.index, lang);
    if (registered.has(iconId)) continue;
    registered.add(iconId);
    if (map.hasImage(iconId)) map.removeImage(iconId);
    map.addImage(iconId, createVerticalBadgeIcon(Landmark as IconNode, level.color, stroke, text, undefined, level.textColor));
  }

  map.addSource(UBA_SOURCE, { type: 'geojson', data: ubaToGeoJSON(stations, lang, timeZone), attribution: UBA_MAP_ATTRIBUTION });
  map.addLayer({
    id: UBA_LAYER,
    type: 'symbol',
    source: UBA_SOURCE,
    layout: {
      'icon-image': ['get', 'iconId'] as unknown as maplibregl.ExpressionSpecification,
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  const getContent: PopupContentFn = (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: ubaPopupHtml(e.features[0].properties!), lngLat: coords };
  };
  registerPopupHandlers(map, UBA_LAYER, getContent, { offset: 16, maxWidth: '270px' });
}
