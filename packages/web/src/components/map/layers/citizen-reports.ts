/**
 * Citizen issue reports (Open311): a marker per report, coloured by status,
 * with an icon for its category group. Closed reports are drawn fainter and
 * beneath open ones. The data carries no description, address or photo
 * (.context/citizen-reports.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import { Trash2, Lightbulb, TrafficCone, Construction, Trees, Car, SprayCan, MapPin } from 'lucide';
import type { CitizenReport, CitizenReportGroup, CitizenReportStatus } from '../../../lib/api.js';
import { createMapIcon, type IconNode } from '../../../lib/map-icons.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { registerPopupHandlers, sourceText } from '../popups.js';

export const REPORT_STATUS_COLORS: Record<CitizenReportStatus, string> = {
  open: '#ef4444',
  in_progress: '#f59e0b',
  closed: '#22c55e',
};

export const REPORT_GROUP_ICONS: Record<CitizenReportGroup, IconNode> = {
  waste: Trash2 as IconNode,
  lighting: Lightbulb as IconNode,
  traffic: TrafficCone as IconNode,
  roads: Construction as IconNode,
  green: Trees as IconNode,
  vehicles: Car as IconNode,
  graffiti: SprayCan as IconNode,
  other: MapPin as IconNode,
};

/** The portal each city's reports come from, as it names itself. */
export const REPORT_PORTALS: Record<string, string> = {
  koeln: 'Sag’s uns (Stadt Köln)',
  muenchen: 'Mach München besser',
};

const STATUSES = Object.keys(REPORT_STATUS_COLORS) as CitizenReportStatus[];
const GROUPS = Object.keys(REPORT_GROUP_ICONS) as CitizenReportGroup[];
const SOURCE_ID = 'citizen-reports';
const LAYER_ID = 'citizen-report-icon';

const iconId = (group: CitizenReportGroup, status: CitizenReportStatus) => `report-icon-${group}-${status}`;

/** A date and time in the UI language ("2. Nov., 13:26"), or the text as given when it is no date. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/**
 * Popup markup for a report, from its feature properties. Category and the
 * portal's status name come from the portal (German, `sourceText`), the rest
 * in the current UI language; all of it is escaped (see `escapeHtml`).
 */
export function citizenReportPopupHtml(p: Record<string, unknown>, isDark: boolean, portal: string): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const status = (STATUSES as string[]).includes(String(p.status)) ? String(p.status) as CitizenReportStatus : 'open';
  const color = REPORT_STATUS_COLORS[status];
  const statusText = i18n.t(`mapPopup.reports.status.${status}`);
  // The portal's own word ("Erledigt/Beauftragt", "Nicht Stadtverwaltung"), unless it is the same
  const label = typeof p.statusLabel === 'string' && p.statusLabel !== '' && p.statusLabel.toLowerCase() !== statusText.toLowerCase()
    ? ` · ${sourceText(p.statusLabel)}`
    : '';
  const muted = isDark ? '#aaa' : '#666';
  const url = typeof p.url === 'string' && /^https:\/\//.test(p.url) ? p.url : '';
  const updated = typeof p.updatedAt === 'string' && p.updatedAt !== '' && p.updatedAt !== p.requestedAt
    ? `<div style="font-size:11px;color:${muted}">${t('mapPopup.reports.updated')}: ${escapeHtml(formatWhen(p.updatedAt))}</div>`
    : '';
  return `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600;margin-bottom:4px">${sourceText(p.category)}</div>
      <div style="display:flex;align-items:center;gap:4px"><span style="flex:none;width:8px;height:8px;border-radius:50%;background:${color}"></span><span><strong>${escapeHtml(statusText)}</strong>${label}</span></div>
      <div style="font-size:11px;color:${muted};margin-top:2px">${t('mapPopup.reports.reported')}: ${escapeHtml(formatWhen(String(p.requestedAt ?? '')))}</div>
      ${updated}
      ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:12px;color:#2563eb;text-decoration:none">${t('mapPopup.reports.viewOnPortal')} ↗</a>` : ''}
      <div style="font-size:10px;color:${isDark ? '#888' : '#999'};margin-top:4px">${sourceText(portal)}</div>
    </div>`;
}

function reportsToGeoJSON(reports: readonly CitizenReport[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: reports.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: {
        id: r.id,
        category: r.category,
        status: r.status,
        statusLabel: r.statusLabel ?? '',
        requestedAt: r.requestedAt,
        updatedAt: r.updatedAt ?? '',
        url: r.url ?? '',
        iconId: iconId(r.group, r.status),
        // Open reports on top of the ones being worked on, those on top of closed ones
        sortKey: r.status === 'open' ? 2 : r.status === 'in_progress' ? 1 : 0,
      },
    })),
  };
}

export function updateCitizenReportMarkers(map: maplibregl.Map, reports: readonly CitizenReport[], isDark: boolean, cityId: string) {
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  if (reports.length === 0) return;

  const stroke = isDark ? '#1f2937' : '#ffffff';
  for (const group of GROUPS) {
    for (const status of STATUSES) {
      const id = iconId(group, status);
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, createMapIcon(REPORT_GROUP_ICONS[group], REPORT_STATUS_COLORS[status], stroke));
    }
  }

  map.addSource(SOURCE_ID, { type: 'geojson', data: reportsToGeoJSON(reports) });
  map.addLayer({
    id: LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'icon-image': ['get', 'iconId'] as unknown as maplibregl.ExpressionSpecification,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 13, 0.6, 16, 0.8] as unknown as maplibregl.ExpressionSpecification,
      'icon-allow-overlap': true,
      'icon-anchor': 'center',
      'symbol-sort-key': ['get', 'sortKey'] as unknown as maplibregl.ExpressionSpecification,
    },
    paint: {
      'icon-opacity': ['case', ['==', ['get', 'status'], 'closed'], 0.55, 1] as unknown as maplibregl.ExpressionSpecification,
    },
  });

  const portal = REPORT_PORTALS[cityId] ?? '';
  registerPopupHandlers(map, LAYER_ID, (e) => {
    if (!e.features?.length) return null;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    return { html: citizenReportPopupHtml(e.features[0].properties!, isDark, portal), lngLat: coords };
  }, { offset: 12, maxWidth: '260px' });
}
