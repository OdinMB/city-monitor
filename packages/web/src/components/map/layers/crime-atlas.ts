/**
 * Crime map layer: the Kriminalitätsatlas's Bezirksregionen coloured by how
 * their rate of one offence group (cases per 100,000 residents) compares with
 * the city's, with a popup of the area's figures against the city average
 * (.context/crime-atlas.md).
 */

import * as maplibregl from 'maplibre-gl';
import i18n from 'i18next';
import type { CrimeAreaProps, CrimeAtlasData, CrimeIndicator } from '../../../lib/api.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { showMapPopup, scheduleHoverClose, ltr, sourceText, type MapLayerEvent } from '../popups.js';

const SOURCE = 'crime-atlas-areas';
const FILL_LAYER = 'crime-atlas-fill';
const LINE_LAYER = 'crime-atlas-line';

/** The offence groups in the order the sidebar and the popup list them. */
export const CRIME_INDICATORS: readonly CrimeIndicator[] = ['total', 'assault', 'robbery', 'burglary', 'bikeTheft', 'kiez'];

/**
 * An area's rate as a multiple of the city's, in five classes; `below` is the
 * upper bound of each (the last has none). `key` names the `sidebar.crimeLegend` label.
 */
export const CRIME_CLASSES: ReadonlyArray<{ key: 'muchLower' | 'lower' | 'average' | 'higher' | 'muchHigher'; below: number | null; color: string }> = [
  { key: 'muchLower', below: 0.5, color: '#ffffb2' },
  { key: 'lower', below: 0.8, color: '#fecc5c' },
  { key: 'average', below: 1.25, color: '#fd8d3c' },
  { key: 'higher', below: 2, color: '#f03b20' },
  { key: 'muchHigher', below: null, color: '#bd0026' },
];

/** The class of an area's rate against the city's, or null without both. */
export function crimeClassOf(rate: unknown, cityRate: number | null): (typeof CRIME_CLASSES)[number] | null {
  if (typeof rate !== 'number' || !cityRate) return null;
  const ratio = rate / cityRate;
  return CRIME_CLASSES.find((c) => c.below === null || ratio < c.below) ?? null;
}

function fillColor(indicator: CrimeIndicator, cityRate: number | null): maplibregl.ExpressionSpecification {
  if (!cityRate) return 'rgba(0,0,0,0)' as unknown as maplibregl.ExpressionSpecification;
  const steps = CRIME_CLASSES.slice(1).flatMap((c, i) => [CRIME_CLASSES[i]!.below!, c.color]);
  return [
    'case',
    ['==', ['typeof', ['get', indicator]], 'number'],
    ['step', ['/', ['get', indicator], cityRate], CRIME_CLASSES[0]!.color, ...steps],
    'rgba(0,0,0,0)',
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** "1.4×" against the city, kept left-to-right in Arabic. */
function ratio(rate: unknown, cityRate: number | null): string {
  if (typeof rate !== 'number' || !cityRate) return '–';
  return `${(rate / cityRate).toLocaleString(i18n.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}×`;
}

/**
 * Popup markup for one Bezirksregion: each offence group's rate per 100,000
 * residents, the city's, and the area's as a multiple of it; the group the map
 * shows in bold, with its case count. Names come from the source in German
 * (`sourceText`); everything is escaped.
 */
export function crimeAtlasPopupHtml(p: CrimeAreaProps, data: Pick<CrimeAtlasData, 'year' | 'city'>, indicator: CrimeIndicator): string {
  const locale = i18n.language;
  const num = (v: unknown) => (typeof v === 'number' ? Math.round(v).toLocaleString(locale) : '–');
  const rows = CRIME_INDICATORS.map((ind) => {
    const weight = ind === indicator ? 'font-weight:600' : 'opacity:0.85';
    return `<tr style="${weight}">
          <td style="padding:2px 0">${escapeHtml(i18n.t(`sidebar.crime.${ind}`))}</td>
          <td style="text-align:end;padding-inline-start:8px">${ltr(escapeHtml(num(p[ind])))}</td>
          <td style="text-align:end;padding-inline-start:8px;opacity:0.7">${ltr(escapeHtml(num(data.city[ind])))}</td>
          <td style="text-align:end;padding-inline-start:8px">${ltr(escapeHtml(ratio(p[ind], data.city[ind])))}</td>
        </tr>`;
  }).join('');
  const count = p[`${indicator}Count`];
  return `<div style="font-size:13px;max-width:320px">
      <div style="font-weight:600">${sourceText(p.name)}</div>
      <div style="font-size:11px;opacity:0.7;margin-bottom:6px">${sourceText(p.district)} · ${escapeHtml(i18n.t('mapPopup.crime.year', { year: data.year }))}</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr style="font-size:11px;opacity:0.7">
          <td></td>
          <td style="text-align:end;padding-inline-start:8px">${escapeHtml(i18n.t('mapPopup.crime.area'))}</td>
          <td style="text-align:end;padding-inline-start:8px">${escapeHtml(i18n.t('mapPopup.crime.city'))}</td>
          <td style="text-align:end;padding-inline-start:8px">${escapeHtml(i18n.t('mapPopup.crime.ratio'))}</td>
        </tr>
        ${rows}
      </table>
      <div style="font-size:11px;opacity:0.7;margin-top:6px">${escapeHtml(i18n.t('mapPopup.crime.per100k'))}${typeof count === 'number'
        ? ` · ${escapeHtml(i18n.t('mapPopup.crime.cases'))}: ${ltr(escapeHtml(count.toLocaleString(locale)))}`
        : ''}</div>
    </div>`;
}

/** What the handlers read; they are registered once per map. */
const popupState = new WeakMap<maplibregl.Map, { data: CrimeAtlasData; indicator: CrimeIndicator }>();

export function updateCrimeAtlasLayer(map: maplibregl.Map, data: CrimeAtlasData | null, indicator: CrimeIndicator, isDark: boolean) {
  for (const id of [FILL_LAYER, LINE_LAYER]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  if (!data || data.geojson.features.length === 0) {
    popupState.delete(map);
    return;
  }

  map.addSource(SOURCE, { type: 'geojson', data: data.geojson as unknown as GeoJSON.FeatureCollection });
  map.addLayer({
    id: FILL_LAYER,
    type: 'fill',
    source: SOURCE,
    paint: {
      'fill-color': fillColor(indicator, data.city[indicator]),
      'fill-opacity': isDark ? 0.4 : 0.45,
    },
  });
  map.addLayer({
    id: LINE_LAYER,
    type: 'line',
    source: SOURCE,
    paint: {
      'line-color': isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
      'line-width': 0.6,
    },
  });

  const registered = popupState.has(map);
  popupState.set(map, { data, indicator });
  if (registered) return;

  let hovered: string | null = null;
  const show = (e: maplibregl.MapMouseEvent, sticky: boolean) => {
    const me = e as MapLayerEvent;
    const state = popupState.get(map);
    if (!me.features?.length || !state) return;
    const p = me.features[0].properties as unknown as CrimeAreaProps;
    if (!sticky) {
      if (p.areaId === hovered) return;
      hovered = p.areaId;
      map.getCanvas().style.cursor = 'pointer';
    }
    showMapPopup(map, [me.lngLat.lng, me.lngLat.lat], crimeAtlasPopupHtml(p, state.data, state.indicator), { sticky, maxWidth: '340px' });
  };
  map.on('mousemove', FILL_LAYER, (e) => show(e, false));
  map.on('click', FILL_LAYER, (e) => show(e, true));
  map.on('mouseleave', FILL_LAYER, () => {
    map.getCanvas().style.cursor = '';
    hovered = null;
    scheduleHoverClose();
  });
}
