/**
 * Water level gauge and bathing water quality map markers.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import { Droplets } from 'lucide';
import type { WaterLevelStation, BathingSpot } from '../../../lib/api.js';
import { WATER_STATE_COLORS, BATHING_QUALITY_COLORS, createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr, sourceText } from '../popups.js';

function waterLevelsToGeoJSON(stations: WaterLevelStation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations
      .filter((s) => s.lat && s.lon)
      .map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: {
          uuid: s.uuid,
          name: s.name,
          waterBody: s.waterBody,
          currentLevel: s.currentLevel,
          state: s.state,
          tidal: s.tidal,
          iconId: `wl-badge-${s.currentLevel}-${s.state}`,
        },
      })),
  };
}

export function updateWaterLevelMarkers(map: maplibregl.Map, stations: WaterLevelStation[], isDark: boolean) {
  const geojson = waterLevelsToGeoJSON(stations);

  for (const id of ['wl-marker-label', 'wl-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('wl-markers')) map.removeSource('wl-markers');

  if (geojson.features.length === 0) return;

  // Register a badge image for each unique level+state combo
  const stroke = isDark ? '#1f2937' : '#ffffff';
  const registered = new Set<string>();
  for (const s of stations.filter((s) => s.lat && s.lon)) {
    const id = `wl-badge-${s.currentLevel}-${s.state}`;
    if (registered.has(id)) continue;
    registered.add(id);
    if (map.hasImage(id)) map.removeImage(id);
    const color = WATER_STATE_COLORS[s.state] ?? WATER_STATE_COLORS.unknown;
    map.addImage(id, createVerticalBadgeIcon(Droplets as IconNode, color, stroke, `${s.currentLevel} cm`));
  }

  map.addSource('wl-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'wl-marker-icon',
    type: 'symbol',
    source: 'wl-markers',
    layout: {
      'icon-image': ['get', 'iconId'] as unknown as maplibregl.ExpressionSpecification,
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'wl-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: waterLevelPopupHtml(e.features[0].properties!), lngLat: coords };
  });
}

/**
 * Popup markup for a river gauge, from its feature properties. Station and
 * water names come from PEGELONLINE, in German (`sourceText`), and the words
 * from the current UI language (the same as the water-level tile); all of it
 * is escaped (see `escapeHtml`).
 */
export function waterLevelPopupHtml(props: Record<string, unknown>): string {
  const state = String(props.state ?? 'unknown');
  const stateColor = WATER_STATE_COLORS[state] ?? WATER_STATE_COLORS.unknown;
  const stateKey = state === 'very_high' ? 'veryHigh' : state;
  const stateLabel = i18n.t(`panel.waterLevels.state.${stateKey}`, state.replace('_', ' '));
  const tidal = props.tidal === 'true' || props.tidal === true
    ? ` (${escapeHtml(i18n.t('panel.waterLevels.tidal'))})`
    : '';
  return `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:4px">${sourceText(props.name)}</div>
      <div style="font-size:12px;opacity:0.7">${sourceText(props.waterBody)}${tidal}</div>
      <div style="font-size:12px;margin-top:4px">${escapeHtml(i18n.t('panel.waterLevels.level'))}: <strong style="color:${stateColor}">${ltr(`${escapeHtml(props.currentLevel)} cm`)}</strong></div>
      <div style="font-size:11px;margin-top:2px;color:${stateColor}">${escapeHtml(stateLabel)}</div>
    </div>`;
}

function bathingToGeoJSON(spots: BathingSpot[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots
      .filter((s) => s.lat != null && s.lon != null)
      .map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id,
          name: s.name,
          district: s.district,
          waterBody: s.waterBody,
          measuredAt: s.measuredAt,
          waterTemp: s.waterTemp,
          visibility: s.visibility,
          quality: s.quality,
          algae: s.algae,
          advisory: s.advisory,
          classification: s.classification,
          detailUrl: s.detailUrl,
          inSeason: s.inSeason,
        },
      })),
  };
}

export function updateBathingMarkers(map: maplibregl.Map, spots: BathingSpot[], _isDark: boolean) {
  const geojson = bathingToGeoJSON(spots);

  for (const id of ['bathing-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('bathing-markers')) map.removeSource('bathing-markers');

  if (geojson.features.length === 0) return;

  map.addSource('bathing-markers', { type: 'geojson', data: geojson });

  const iconMatch: unknown[] = ['match', ['get', 'quality']];
  for (const q of Object.keys(BATHING_QUALITY_COLORS)) {
    iconMatch.push(q, `bathing-icon-${q}`);
  }
  iconMatch.push('bathing-icon-good'); // fallback

  map.addLayer({
    id: 'bathing-marker-icon',
    type: 'symbol',
    source: 'bathing-markers',
    layout: {
      'icon-image': iconMatch as maplibregl.ExpressionSpecification,
      'icon-size': 0.9,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'bathing-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: bathingPopupHtml(e.features[0].properties!), lngLat: coords };
  });
}

/**
 * Popup markup for a bathing spot, from its feature properties. Names, algae
 * and advisory notes come from LAGeSo, in German (`sourceText`), and the words
 * from the current UI language; all of it is escaped (see `escapeHtml`).
 */
export function bathingPopupHtml(props: Record<string, unknown>): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const quality = String(props.quality ?? '');
  const qColor = BATHING_QUALITY_COLORS[quality] ?? BATHING_QUALITY_COLORS.good;
  const qLabel = i18n.t(`panel.bathing.quality.${quality}`, quality.charAt(0).toUpperCase() + quality.slice(1));
  const seasonBadge = props.inSeason === true || props.inSeason === 'true'
    ? ''
    : `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:10px;padding:1px 5px;border-radius:4px;margin-inline-start:4px">${t('panel.bathing.offSeason')}</span>`;
  const tempLine = props.waterTemp != null && props.waterTemp !== 'null'
    ? `<div style="font-size:12px;margin-top:4px">${t('mapPopup.bathing.waterTemp')}: <strong>${ltr(`${escapeHtml(String(props.waterTemp))}°C`)}</strong></div>` : '';
  const visLine = props.visibility != null && props.visibility !== 'null'
    ? `<div style="font-size:12px">${t('mapPopup.bathing.visibility')}: ${ltr(`${escapeHtml(String(props.visibility))}m`)}</div>` : '';
  const algaeLine = props.algae && props.algae !== 'null'
    ? `<div style="font-size:11px;color:#d97706;margin-top:4px">⚠ ${sourceText(props.algae)}</div>` : '';
  const advisoryLine = props.advisory && props.advisory !== 'null'
    ? `<div style="font-size:11px;opacity:0.7;margin-top:2px">${sourceText(props.advisory)}</div>` : '';
  const detailUrl = String(props.detailUrl ?? '');
  const detailLink = detailUrl.startsWith('https://')
    ? `<a href="${escapeHtml(detailUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">${t('mapPopup.details')} (LAGeSo) ↗</a>`
    : '';
  const measuredDate = props.measuredAt && props.measuredAt !== 'null'
    ? `<div style="font-size:11px;opacity:0.5;margin-bottom:4px">${t('panel.bathing.measuredAt', { date: String(props.measuredAt) })}</div>` : '';
  const euClass = props.classification && props.classification !== 'null'
    ? ` <span style="font-size:11px;opacity:0.6">(${t('mapPopup.bathing.euClass', { value: String(props.classification) })})</span>` : '';
  return `<div style="font-size:13px;max-width:300px">
      <div style="font-weight:600;margin-bottom:2px">${sourceText(props.name)}${seasonBadge}</div>
      ${measuredDate}
      <div style="font-size:12px;opacity:0.7">${sourceText(props.waterBody)} · ${sourceText(props.district)}</div>
      <div style="font-size:12px;margin-top:4px">${t('mapPopup.bathing.quality')}: <strong style="color:${qColor}">${escapeHtml(qLabel)}</strong>${euClass}</div>
      ${tempLine}${visLine}${algaeLine}${advisoryLine}
      ${detailLink}
    </div>`;
}
