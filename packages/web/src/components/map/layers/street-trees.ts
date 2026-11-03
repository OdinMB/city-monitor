/**
 * The popup for one tree of a city's street-tree register, opened by a click
 * on the trees layer (CityMap.tsx, lib/street-trees.ts). The trees themselves
 * are the register's WMS raster (setStreetTreesOverlay in base.ts).
 */

import i18n from 'i18next';
import type { StreetTree } from '../../../lib/street-trees.js';
import { escapeHtml } from '../../../lib/escape-html.js';
import { ltr, sourceText } from '../popups.js';

/** Each city's register, as the popup's source line names it. */
export const STREET_TREE_REGISTERS: Record<string, string> = {
  berlin: 'Baumbestand Berlin',
  hamburg: 'Straßenbaumkataster Hamburg',
  koeln: 'Baumkataster Köln',
};

/** A number in the UI language ("6.5", "6,5"). */
function num(n: number): string {
  return n.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
}

/**
 * Popup markup for a tree. Names, street and district come from the register
 * (German, `sourceText`), the words in the current UI language; all of it is
 * escaped (see `escapeHtml`).
 */
export function streetTreePopupHtml(tree: StreetTree, isDark: boolean, register: string, now = new Date()): string {
  const t = (key: string, opts?: Record<string, unknown>) => escapeHtml(i18n.t(key, opts));
  const muted = isDark ? '#aaa' : '#666';
  const row = (label: string, value: string) => `<div>${t(label)}: ${ltr(escapeHtml(value))}</div>`;
  const age = tree.plantedYear !== null ? now.getFullYear() - tree.plantedYear : null;
  const place = [tree.location, tree.district].filter((s): s is string => !!s);
  return `<div style="font-size:13px;max-width:240px">
      <div style="font-weight:600">${sourceText(tree.species ?? tree.botanical)}</div>
      ${tree.species && tree.botanical ? `<div style="font-style:italic;color:${muted};margin-bottom:4px">${sourceText(tree.botanical)}</div>` : ''}
      ${tree.plantedYear !== null ? `<div>${t('mapPopup.tree.planted')}: ${ltr(escapeHtml(tree.plantedYear))} (${t('mapPopup.tree.age', { count: age ?? 0 })})</div>` : ''}
      ${tree.heightM !== null ? row('mapPopup.tree.height', `${num(tree.heightM)} m`) : ''}
      ${tree.crownM !== null ? row('mapPopup.tree.crown', `${num(tree.crownM)} m`) : ''}
      ${tree.girthCm !== null ? row('mapPopup.tree.girth', `${num(tree.girthCm)} cm`) : ''}
      ${place.length > 0 ? `<div style="font-size:11px;color:${muted};margin-top:2px">${place.map(sourceText).join(' · ')}</div>` : ''}
      <div style="font-size:10px;color:${isDark ? '#888' : '#999'};margin-top:4px">${sourceText(register)}</div>
    </div>`;
}
