/**
 * Heat-relief map markers: cool places, drinking fountains and public toilets,
 * one icon per kind; a fountain out of order or out of season is grey
 * (.context/heat-relief.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { HeatReliefData, HeatReliefPlace } from '../../../lib/api.js';
import type { HeatReliefSubLayer } from '../../../hooks/useCommandCenter.js';
import { createMapIcon, type IconNode } from '../../../lib/map-icons.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, ltr, sourceText } from '../popups.js';
import { HEAT_RELIEF_KINDS, HEAT_RELIEF_OFF_COLOR, isOutOfSeason } from '../../../lib/heat-relief.js';

const SOURCE = 'heat-relief';
const ICON_LAYER = 'heat-relief-icon';

/** The sub-layer that shows each kind of place. */
const SUB_LAYER: Record<HeatReliefPlace['kind'], HeatReliefSubLayer> = { cool: 'cool', fountain: 'fountains', toilet: 'toilets' };

function iconId(kind: HeatReliefPlace['kind'] | 'off', isDark: boolean): string {
  return `heat-relief-${kind}-${isDark ? 'dark' : 'light'}`;
}

/** Adds the four icons (three kinds and the grey "not running" fountain) for the theme, once. */
function ensureIcons(map: maplibregl.Map, isDark: boolean) {
  const stroke = isDark ? '#1f2937' : '#ffffff';
  for (const { kind, icon, color } of HEAT_RELIEF_KINDS) {
    const id = iconId(kind, isDark);
    if (!map.hasImage(id)) map.addImage(id, createMapIcon(icon as IconNode, color, stroke));
  }
  const off = iconId('off', isDark);
  const fountain = HEAT_RELIEF_KINDS.find((k) => k.kind === 'fountain')!;
  if (!map.hasImage(off)) map.addImage(off, createMapIcon(fountain.icon as IconNode, HEAT_RELIEF_OFF_COLOR, stroke));
}

/** "May", "October" in the UI language. */
function monthName(month: number): string {
  return new Date(2026, month - 1, 15).toLocaleString(i18n.language, { month: 'long' });
}

/** "€0.50" / "0,50 €" in the UI language. */
function formatFee(fee: number): string {
  return new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR' }).format(fee);
}

function directionsLink(lon: number, lat: number): string {
  const osmUrl = `https://www.openstreetmap.org/directions?route=;${lat},${lon}`;
  return `<a href="${escapeHtml(osmUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">${escapeHtml(i18n.t('mapPopup.directions'))} ↗</a>`;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Popup markup for a place, from its feature properties (see `toGeoJSON`):
 * the source's name, address, hours and note in German (`sourceText`), the
 * words in the UI language, all escaped. `now` decides whether a seasonal
 * fountain is out of season.
 */
export function heatReliefPopupHtml(p: Record<string, unknown>, now: Date = new Date()): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const kind = String(p.kind) as HeatReliefPlace['kind'];
  const setting = p.setting ? String(p.setting) : '';
  const kindLabel = t(`mapPopup.heatRelief.kind.${kind}`);
  const settingLabel = setting ? t(`mapPopup.heatRelief.setting.${setting}`) : '';
  const name = typeof p.name === 'string' && p.name !== '' ? sourceText(p.name) : (settingLabel || kindLabel);
  const from = num(p.seasonFrom);
  const to = num(p.seasonTo);
  const season = from !== null && to !== null ? { from, to } : undefined;
  const fee = num(p.fee);
  const badge = (text: string, bg: string, fg: string) =>
    `<span style="display:inline-block;background:${bg};color:${fg};font-size:10px;padding:1px 5px;border-radius:4px">${text}</span>`;

  const badges = [
    p.outOfOrder === true || p.outOfOrder === 'true' ? badge(t('mapPopup.heatRelief.outOfOrder'), '#fee2e2', '#991b1b') : '',
    season && isOutOfSeason(season, now) ? badge(t('mapPopup.heatRelief.offSeason'), '#e5e7eb', '#374151') : '',
  ].join('');
  const accessible = p.accessible ? String(p.accessible) : '';
  const lines = [
    p.address ? `<div style="font-size:12px">${sourceText(p.address)}</div>` : '',
    p.hours ? `<div style="font-size:12px;margin-top:2px">${t('mapPopup.heatRelief.hours')}: ${sourceText(p.hours)}</div>` : '',
    season ? `<div style="font-size:12px;margin-top:2px">${t('mapPopup.heatRelief.season', { from: monthName(season.from), to: monthName(season.to) })}</div>` : '',
    fee !== null ? `<div style="font-size:12px;margin-top:2px">${fee === 0 ? t('mapPopup.heatRelief.free') : `${t('mapPopup.heatRelief.fee')}: ${ltr(escapeHtml(formatFee(fee)))}`}</div>` : '',
    accessible ? `<div style="font-size:12px;margin-top:2px">${t(`mapPopup.heatRelief.accessible.${accessible}`)}</div>` : '',
    p.changingTable === true || p.changingTable === 'true' ? `<div style="font-size:12px;margin-top:2px">${t('mapPopup.heatRelief.changingTable')}</div>` : '',
    p.note ? `<div style="font-size:11px;opacity:0.7;margin-top:4px">${sourceText(p.note)}</div>` : '',
  ].join('');
  const subtitle = name === kindLabel ? '' : `<div style="font-size:11px;opacity:0.7">${settingLabel && name !== settingLabel ? `${kindLabel} · ${settingLabel}` : kindLabel}</div>`;
  return `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600">${name}</div>
      ${subtitle}
      ${badges ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">${badges}</div>` : ''}
      <div style="margin-top:4px">${lines}</div>
      ${directionsLink(Number(p.lon), Number(p.lat))}
    </div>`;
}

function toGeoJSON(data: HeatReliefData | null, shown: ReadonlySet<HeatReliefSubLayer>, isDark: boolean, now: Date): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = (data?.places ?? [])
    .filter((p) => shown.has(SUB_LAYER[p.kind]))
    .map((p) => {
      const off = p.outOfOrder === true || (p.season !== undefined && isOutOfSeason(p.season, now));
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          kind: p.kind,
          name: p.name,
          address: p.address ?? '',
          hours: p.hours ?? '',
          note: p.note ?? '',
          setting: p.setting ?? '',
          seasonFrom: p.season?.from ?? null,
          seasonTo: p.season?.to ?? null,
          outOfOrder: p.outOfOrder === true,
          accessible: p.accessible ?? '',
          fee: p.fee ?? null,
          changingTable: p.changingTable === true,
          lat: p.lat,
          lon: p.lon,
          icon: iconId(off && p.kind === 'fountain' ? 'off' : p.kind, isDark),
          // Running places draw above the grey ones
          rank: off ? 0 : 1,
        },
      };
    });
  return { type: 'FeatureCollection', features };
}

export function updateHeatReliefMarkers(
  map: maplibregl.Map,
  data: HeatReliefData | null,
  shown: ReadonlySet<HeatReliefSubLayer>,
  isDark: boolean,
) {
  if (map.getLayer(ICON_LAYER)) map.removeLayer(ICON_LAYER);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);

  const geojson = toGeoJSON(data, shown, isDark, new Date());
  if (geojson.features.length === 0) return;

  ensureIcons(map, isDark);
  map.addSource(SOURCE, { type: 'geojson', data: geojson });
  map.addLayer({
    id: ICON_LAYER,
    type: 'symbol',
    source: SOURCE,
    layout: {
      'icon-image': ['get', 'icon'] as unknown as maplibregl.ExpressionSpecification,
      // Small across the city, full size close in
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 0.8] as unknown as maplibregl.ExpressionSpecification,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
      'symbol-sort-key': ['get', 'rank'] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  registerPopupHandlers(map, ICON_LAYER, (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: heatReliefPopupHtml(e.features[0].properties!), lngLat: coords };
  }, { offset: 10, maxWidth: '300px' });
}
