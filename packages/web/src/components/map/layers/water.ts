/**
 * Water level gauge and bathing water quality map markers.
 */

import maplibregl from 'maplibre-gl';
import { Droplets } from 'lucide';
import type { WaterLevelStation, BathingSpot } from '../../../lib/api.js';
import { WATER_STATE_COLORS, BATHING_QUALITY_COLORS, createVerticalBadgeIcon, type IconNode } from '../../../lib/map-icons.js';
import { registerPopupHandlers } from '../popups.js';

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
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const stateColor = WATER_STATE_COLORS[props.state as string] ?? WATER_STATE_COLORS.unknown;
    const stateLabel = (props.state as string).replace('_', ' ');
    const html = `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:4px">${props.name}</div>
      <div style="font-size:12px;opacity:0.7">${props.waterBody}${props.tidal === 'true' || props.tidal === true ? ' (tidal)' : ''}</div>
      <div style="font-size:12px;margin-top:4px">Level: <strong style="color:${stateColor}">${props.currentLevel} cm</strong></div>
      <div style="font-size:11px;margin-top:2px;text-transform:capitalize;color:${stateColor}">${stateLabel}</div>
    </div>`;
    return { html, lngLat: coords };
  });
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

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  registerPopupHandlers(map, 'bathing-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const props = e.features[0].properties!;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const qColor = BATHING_QUALITY_COLORS[props.quality as string] ?? BATHING_QUALITY_COLORS.good;
    const qLabel = (props.quality as string).charAt(0).toUpperCase() + (props.quality as string).slice(1);
    const seasonBadge = props.inSeason === true || props.inSeason === 'true'
      ? ''
      : '<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:10px;padding:1px 5px;border-radius:4px;margin-left:4px">Off-season</span>';
    const tempLine = props.waterTemp != null && props.waterTemp !== 'null'
      ? `<div style="font-size:12px;margin-top:4px">Water temp: <strong>${esc(String(props.waterTemp))}°C</strong></div>` : '';
    const visLine = props.visibility != null && props.visibility !== 'null'
      ? `<div style="font-size:12px">Visibility: ${esc(String(props.visibility))}m</div>` : '';
    const algaeLine = props.algae && props.algae !== 'null'
      ? `<div style="font-size:11px;color:#d97706;margin-top:4px">⚠ ${esc(String(props.algae))}</div>` : '';
    const advisoryLine = props.advisory && props.advisory !== 'null'
      ? `<div style="font-size:11px;opacity:0.7;margin-top:2px">${esc(String(props.advisory))}</div>` : '';
    const detailUrl = String(props.detailUrl ?? '');
    const detailLink = detailUrl.startsWith('https://')
      ? `<a href="${esc(detailUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">Details (LAGeSo) ↗</a>`
      : '';
    const measuredDate = props.measuredAt && props.measuredAt !== 'null'
      ? `<div style="font-size:11px;opacity:0.5;margin-bottom:4px">Measured: ${esc(String(props.measuredAt))}</div>` : '';
    const html = `<div style="font-size:13px;max-width:300px">
      <div style="font-weight:600;margin-bottom:2px">${esc(String(props.name))}${seasonBadge}</div>
      ${measuredDate}
      <div style="font-size:12px;opacity:0.7">${esc(String(props.waterBody))} · ${esc(String(props.district))}</div>
      <div style="font-size:12px;margin-top:4px">Quality: <strong style="color:${qColor}">${qLabel}</strong>${props.classification && props.classification !== 'null' ? ` <span style="font-size:11px;opacity:0.6">(EU: ${esc(String(props.classification))})</span>` : ''}</div>
      ${tempLine}${visLine}${algaeLine}${advisoryLine}
      ${detailLink}
    </div>`;
    return { html, lngLat: coords };
  });
}
