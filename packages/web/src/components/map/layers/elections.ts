/**
 * The political map's Election view: each area of the latest election (Berlin's
 * Wahlkreise, Hamburg's Stadtteile, München's Stadtbezirke) filled with its
 * strongest party's colour, stronger the bigger that party's share, and a popup
 * with the area's shares and turnout (.context/election-results.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { ElectionAreaResult, ElectionFeatureProps, ElectionResults } from '../../../lib/api.js';
import { getPartyColor } from '../../../lib/party-colors.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { showMapPopup, scheduleHoverClose, ltr, sourceText, type MapLayerEvent } from '../popups.js';

const SOURCE = 'election-areas';
export const ELECTION_FILL_LAYER = 'election-fill';
const LINE_LAYER = 'election-line';
/** Drawn under the city's district outlines and names, which stay readable on top. */
const BELOW = ['district-line', 'district-label'];

/** The parties that lead somewhere, each with the number of areas it leads, most first. */
export function leadersOf(results: Pick<ElectionResults, 'areas'>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const a of results.areas) if (a.leader) counts.set(a.leader, (counts.get(a.leader) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** "1.5%" in the UI language's digits and decimal mark, kept left to right. */
function pct(value: number, locale: string): string {
  return ltr(escapeHtml(`${value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`));
}

/**
 * Popup markup for an area: its name, then each party's share, strongest first,
 * with the party's colour, the other parties together, and turnout. Names come
 * from the official file, in German (`sourceText`); the words in the UI
 * language. All of it is escaped.
 */
export function electionPopupHtml(area: ElectionAreaResult, election: Pick<ElectionResults, 'election' | 'date'>): string {
  const locale = i18n.language;
  const shares = [...area.shares].sort((a, b) => b.pct - a.pct).filter((s) => s.pct > 0);
  const rows = shares.map((s) => {
    const strong = s.party === area.leader ? 'font-weight:600' : '';
    return `<tr><td style="padding:1px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${getPartyColor(s.party)};margin-inline-end:6px"></span><span style="${strong}">${sourceText(s.party)}</span></td>`
      + `<td style="text-align:end;${strong}">${pct(s.pct, locale)}</td></tr>`;
  });
  if (area.otherPct > 0) {
    rows.push(`<tr><td style="padding:1px 0;opacity:0.7;padding-inline-start:14px">${escapeHtml(i18n.t('panel.elections.others'))}</td><td style="text-align:end;opacity:0.7">${pct(area.otherPct, locale)}</td></tr>`);
  }
  const turnout = area.turnout === null ? ''
    : `<div style="margin-top:6px;font-size:11px;opacity:0.75">${escapeHtml(i18n.t('panel.elections.turnout'))}: ${pct(area.turnout, locale)}</div>`;
  return `<div style="font-size:13px;min-width:180px">
      <div style="font-weight:600">${sourceText(area.name)}</div>
      <div style="font-size:11px;opacity:0.7;margin-bottom:6px">${escapeHtml(electionTitle(election))}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">${rows.join('')}</table>
      ${turnout}
    </div>`;
}

/** "Abgeordnetenhaus election, 20 Sep 2026" in the UI language. */
export function electionTitle({ election, date }: Pick<ElectionResults, 'election' | 'date'>): string {
  const when = new Date(`${date}T12:00:00Z`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return i18n.t('panel.elections.title', { election: i18n.t(`panel.elections.kind.${election}`), date: when });
}

/** Per map: the result the popups read, and whether the handlers are registered. */
const popupState = new WeakMap<maplibregl.Map, { results: ElectionResults | null }>();

function removeElectionLayers(map: maplibregl.Map) {
  for (const id of [LINE_LAYER, ELECTION_FILL_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
}

/**
 * Draw the election areas, or remove them when `geojson` is null (the view is
 * off or the city has none). `results` feeds the popups, looked up by the
 * feature's `id`.
 */
export function updateElectionLayer(
  map: maplibregl.Map,
  geojson: GeoJSON.FeatureCollection | null,
  results: ElectionResults | null,
  isDark: boolean,
) {
  removeElectionLayers(map);
  const registered = popupState.has(map);
  popupState.set(map, { results });
  if (!geojson || geojson.features.length === 0) return;

  const leaders = [...new Set(geojson.features.map((f) => (f.properties as ElectionFeatureProps | null)?.leader).filter((p): p is string => !!p))];
  const color: unknown[] = ['match', ['get', 'leader']];
  for (const party of leaders) color.push(party, getPartyColor(party));
  color.push('#808080');

  map.addSource(SOURCE, { type: 'geojson', data: geojson });
  const before = BELOW.find((id) => map.getLayer(id));
  map.addLayer({
    id: ELECTION_FILL_LAYER,
    type: 'fill',
    source: SOURCE,
    paint: {
      'fill-color': (leaders.length > 0 ? color : '#808080') as maplibregl.ExpressionSpecification,
      // A narrow lead is pale, a landslide strong
      'fill-opacity': [
        'interpolate', ['linear'], ['coalesce', ['get', 'leaderPct'], 0],
        15, isDark ? 0.25 : 0.2, 45, isDark ? 0.65 : 0.6,
      ] as maplibregl.ExpressionSpecification,
    },
  }, before);
  map.addLayer({
    id: LINE_LAYER,
    type: 'line',
    source: SOURCE,
    paint: {
      'line-color': isDark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.9)',
      'line-width': 0.8,
    },
  }, before);

  if (registered) return;
  let hovered: string | null = null;
  const contentAt = (e: MapLayerEvent): string | null => {
    const results = popupState.get(map)?.results;
    const id = (e.features?.[0]?.properties as ElectionFeatureProps | undefined)?.id;
    const area = id ? results?.areas.find((a) => a.id === id) : undefined;
    return area && results ? electionPopupHtml(area, results) : null;
  };
  map.on('mousemove', ELECTION_FILL_LAYER, (e) => {
    const me = e as MapLayerEvent;
    const id = (me.features?.[0]?.properties as ElectionFeatureProps | undefined)?.id ?? null;
    if (id === hovered) return;
    hovered = id;
    const html = contentAt(me);
    if (!html) return;
    map.getCanvas().style.cursor = 'pointer';
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], html, { sticky: false, maxWidth: '280px' });
  });
  map.on('mouseleave', ELECTION_FILL_LAYER, () => {
    hovered = null;
    map.getCanvas().style.cursor = '';
    scheduleHoverClose();
  });
  map.on('click', ELECTION_FILL_LAYER, (e) => {
    const me = e as MapLayerEvent;
    const html = contentAt(me);
    if (html) showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], html, { sticky: true, maxWidth: '280px' });
  });
}
