/**
 * Emergency pharmacy, AED defibrillator and hospital map markers.
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { EmergencyPharmacy, AedLocation, Hospital, HospitalTier } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { safeUrl } from '../../../lib/safe-url.js';
import { HOSPITAL_TIER_COLORS, HOSPITAL_TIERS } from '../../../lib/hospitals.js';
import { registerPopupHandlers, ltr, sourceText } from '../popups.js';

/**
 * Format a "2026-03-03T09:00:00" range as e.g. "Today 09:00 – Tomorrow 09:00"
 * or "3 Mar 09:00 – 4 Mar 09:00", with the day words, month names and time
 * format of the current UI language.
 */
export function formatPharmacyDuty(from: string, until: string): string {
  const locale = i18n.language;
  const fmt = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    if (target.getTime() === today.getTime()) return `${i18n.t('mapPopup.today')} ${time}`;
    if (target.getTime() === tomorrow.getTime()) return `${i18n.t('mapPopup.tomorrow')} ${time}`;
    const day = d.getDate();
    const mon = d.toLocaleString(locale, { month: 'short' });
    return `${day} ${mon} ${time}`;
  };
  return `${fmt(from)} – ${fmt(until)}`;
}

/** Link to OpenStreetMap directions to a point, labelled in the current UI language. */
function directionsLink([lon, lat]: [number, number]): string {
  const osmUrl = `https://www.openstreetmap.org/directions?route=;${lat},${lon}`;
  return `<a href="${escapeHtml(osmUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">${escapeHtml(i18n.t('mapPopup.directions'))} ↗</a>`;
}

/**
 * Popup markup for an emergency pharmacy at `coords`, from its feature
 * properties. Name, address and phone come from the pharmacy feed (name and
 * address in German, `sourceText`) and the words from the current UI
 * language; all of it is escaped (see `escapeHtml`).
 */
export function pharmacyPopupHtml(props: Record<string, unknown>, coords: [number, number]): string {
  const dutyLabel = formatPharmacyDuty(String(props.validFrom ?? ''), String(props.validUntil ?? ''));
  return `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${sourceText(props.name)}</div>
      <div style="font-size:12px">${sourceText(props.address)}</div>
      ${props.phone ? `<div style="font-size:12px;margin-top:2px">${escapeHtml(i18n.t('mapPopup.phone'))}: ${ltr(escapeHtml(props.phone))}</div>` : ''}
      <div style="font-size:11px;opacity:0.6;margin-top:4px">${escapeHtml(dutyLabel)}</div>
      ${directionsLink(coords)}
    </div>`;
}

/** OSM `access` values with a translated name; `yes` reads as public. Others are shown as tagged. */
const AED_ACCESS_KEYS = new Map([
  ['yes', 'public'], ['public', 'public'], ['customers', 'customers'],
  ['private', 'private'], ['permissive', 'permissive'], ['no', 'no'],
]);

/**
 * Popup markup for a defibrillator at `coords`, from its feature properties.
 * Description, operator and hours come from OpenStreetMap, mostly in German
 * (`sourceText`), and the words from the current UI language; all of it is
 * escaped (see `escapeHtml`).
 */
export function aedPopupHtml(props: Record<string, unknown>, coords: [number, number]): string {
  const t = (key: string) => escapeHtml(i18n.t(key));
  const badge = (text: string, bg: string, fg: string) =>
    `<span style="display:inline-block;background:${bg};color:${fg};font-size:10px;padding:1px 5px;border-radius:4px;margin-inline-start:4px">${text}</span>`;
  const indoorBadge = props.indoor === true || props.indoor === 'true'
    ? badge(t('mapPopup.aed.indoor'), '#dbeafe', '#1e40af')
    : badge(t('mapPopup.aed.outdoor'), '#dcfce7', '#166534');
  const access = String(props.access ?? '');
  const accessKey = AED_ACCESS_KEYS.get(access);
  const accessText = accessKey ? i18n.t(`mapPopup.aed.accessValue.${accessKey}`) : access;
  const accessLabel = access ? `<div style="font-size:11px;opacity:0.6">${t('mapPopup.aed.access')}: ${escapeHtml(accessText)}</div>` : '';
  return `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${t('mapPopup.aed.title')}${indoorBadge}</div>
      ${props.description ? `<div style="font-size:12px">${sourceText(props.description)}</div>` : ''}
      ${props.operator ? `<div style="font-size:12px;margin-top:2px">${sourceText(props.operator)}</div>` : ''}
      ${props.openingHours ? `<div style="font-size:11px;opacity:0.6;margin-top:2px">${sourceText(props.openingHours)}</div>` : ''}
      ${accessLabel}
      ${directionsLink(coords)}
    </div>`;
}

const HOSPITAL_TIER_RADIUS: Record<HospitalTier, number> = {
  comprehensive: 9, extended: 8, basic: 7, emergency: 7, limited: 6, specialised: 5, none: 5,
};

/**
 * Popup markup for a hospital, from its feature properties: name and address
 * from the source (German, `sourceText`), the tier and units in the current UI
 * language, the hospital's website (through `safeUrl`) and the source with its date.
 */
export function hospitalPopupHtml(props: Record<string, unknown>, coords: [number, number]): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const tier = String(props.tier ?? 'none') as HospitalTier;
  const color = HOSPITAL_TIER_COLORS[tier] ?? HOSPITAL_TIER_COLORS.none;
  const units = (['children', 'strokeUnit', 'chestPainUnit', 'trauma'] as const)
    .filter((k) => props[k] === true || props[k] === 'true')
    .map((k) => `<span style="display:inline-block;background:#f3f4f6;color:#374151;font-size:10px;padding:1px 5px;border-radius:4px;margin:2px 4px 0 0">${t(`mapPopup.hospital.unit.${k}`)}</span>`)
    .join('');
  const url = typeof props.url === 'string' && /^https?:\/\//i.test(props.url) ? safeUrl(props.url) ?? '' : '';
  const beds = Number(props.beds);
  const source = props.source === 'klinik-atlas'
    ? `${t('mapPopup.hospital.sourceAtlas')}${props.atlasDate ? ` · ${escapeHtml(String(props.atlasDate))}` : ''}`
    : t('mapPopup.hospital.sourceHamburg');
  return `<div style="font-size:13px;max-width:280px">
      <div style="font-weight:600;margin-bottom:4px">${sourceText(props.name)}</div>
      ${props.address ? `<div style="font-size:12px">${sourceText(props.address)}</div>` : ''}
      <div style="font-size:12px;margin-top:4px;display:flex;align-items:center;gap:6px">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color}"></span>${t(`mapPopup.hospital.tier.${tier}`)}
      </div>
      ${units ? `<div>${units}</div>` : ''}
      ${props.beds !== null && props.beds !== undefined && props.beds !== '' && Number.isFinite(beds) ? `<div style="font-size:11px;opacity:0.7;margin-top:2px">${t('mapPopup.hospital.beds', { n: beds })}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;column-gap:12px">
        ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">${t('mapPopup.hospital.website')} ↗</a>` : ''}
        ${directionsLink(coords)}
      </div>
      <div style="font-size:10px;opacity:0.55;margin-top:4px">${source}</div>
    </div>`;
}

function hospitalsToGeoJSON(hospitals: Hospital[], atlasDate: string | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    // Lowest tier first, so the higher tiers are drawn on top
    features: [...hospitals].reverse().map((h) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
      properties: {
        id: h.id, name: h.name, address: h.address ?? '', tier: h.tier, url: h.url ?? '', beds: h.beds,
        children: h.children, strokeUnit: h.strokeUnit, chestPainUnit: h.chestPainUnit, trauma: h.trauma,
        source: h.source, atlasDate: h.source === 'klinik-atlas' ? atlasDate ?? '' : '',
      },
    })),
  };
}

/** Hospitals as circles coloured and sized by emergency tier. */
export function updateHospitalMarkers(map: maplibregl.Map, hospitals: Hospital[], atlasDate: string | null, isDark: boolean) {
  for (const id of ['hospital-markers-circle']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('hospital-markers')) map.removeSource('hospital-markers');
  if (hospitals.length === 0) return;

  map.addSource('hospital-markers', { type: 'geojson', data: hospitalsToGeoJSON(hospitals, atlasDate) });
  const byTier = <T,>(values: Record<HospitalTier, T>) =>
    ['match', ['get', 'tier'], ...HOSPITAL_TIERS.flatMap((tier) => [tier, values[tier]]), values.none] as unknown as maplibregl.ExpressionSpecification;
  map.addLayer({
    id: 'hospital-markers-circle',
    type: 'circle',
    source: 'hospital-markers',
    paint: {
      'circle-color': byTier(HOSPITAL_TIER_COLORS),
      'circle-radius': byTier(HOSPITAL_TIER_RADIUS),
      'circle-stroke-width': 2,
      'circle-stroke-color': isDark ? '#111827' : '#ffffff',
    },
  });

  registerPopupHandlers(map, 'hospital-markers-circle', (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: hospitalPopupHtml(e.features[0].properties!, coords), lngLat: coords };
  });
}

function pharmaciesToGeoJSON(pharmacies: EmergencyPharmacy[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of pharmacies) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.location.lon, p.location.lat] },
      properties: {
        name: p.name,
        address: p.address,
        phone: p.phone ?? '',
        validFrom: p.validFrom,
        validUntil: p.validUntil,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function aedsToGeoJSON(aeds: AedLocation[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const a of aeds) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: {
        id: a.id,
        indoor: a.indoor,
        description: a.description ?? '',
        operator: a.operator ?? '',
        openingHours: a.openingHours ?? '',
        access: a.access ?? '',
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function updatePharmacyMarkers(map: maplibregl.Map, pharmacies: EmergencyPharmacy[], _isDark: boolean) {
  const geojson = pharmaciesToGeoJSON(pharmacies);

  for (const id of ['pharmacy-marker-label', 'pharmacy-marker-circle', 'pharmacy-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('pharmacy-markers')) map.removeSource('pharmacy-markers');

  if (geojson.features.length === 0) return;

  map.addSource('pharmacy-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'pharmacy-marker-icon',
    type: 'symbol',
    source: 'pharmacy-markers',
    layout: {
      'icon-image': 'pharmacy-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'pharmacy-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: pharmacyPopupHtml(e.features[0].properties!, coords), lngLat: coords };
  });
}

export function updateAedMarkers(map: maplibregl.Map, aeds: AedLocation[], _isDark: boolean) {
  const geojson = aedsToGeoJSON(aeds);

  for (const id of ['aed-marker-icon']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('aed-markers')) map.removeSource('aed-markers');

  if (geojson.features.length === 0) return;

  map.addSource('aed-markers', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'aed-marker-icon',
    type: 'symbol',
    source: 'aed-markers',
    layout: {
      'icon-image': 'aed-icon',
      'icon-size': 0.85,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
    },
  });

  registerPopupHandlers(map, 'aed-marker-icon', (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: aedPopupHtml(e.features[0].properties!, coords), lngLat: coords };
  });
}
