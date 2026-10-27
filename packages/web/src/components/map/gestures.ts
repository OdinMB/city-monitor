/**
 * Cooperative gestures for the map on touch phones: one finger scrolls the
 * page, two move and zoom the map, and MapLibre's hint says so in the UI
 * language.
 */

import type * as maplibregl from 'maplibre-gl';

/** MapLibre's UI-string ids for the gesture hint, in the UI language. Only the
 *  touch text shows on a touch phone; the other two are MapLibre's mouse-wheel
 *  texts, given so no part of the hint stays English. */
export function gestureHintLocale(t: (key: string) => string): Record<string, string> {
  return {
    'CooperativeGesturesHandler.MobileHelpText': t('panel.map.gestureHint.touch'),
    'CooperativeGesturesHandler.WindowsHelpText': t('panel.map.gestureHint.ctrlScroll'),
    'CooperativeGesturesHandler.MacHelpText': t('panel.map.gestureHint.cmdScroll'),
  };
}

/**
 * Turn cooperative gestures on or off, with the hint's words from `locale`.
 *
 * MapLibre takes the hint's text from the map's UI-string table when the
 * handler is enabled and offers no way to change it later (the `locale`
 * option is read once, by the constructor). So this writes the strings into
 * that table (`_locale`, declared in MapLibre's typings) and enables the
 * handler afresh, which rebuilds the hint in the new language.
 */
export function setCooperativeGestures(
  map: maplibregl.Map,
  enabled: boolean,
  locale: Record<string, string>,
): void {
  Object.assign(map._locale, locale);
  const handler = map.cooperativeGestures;
  if (handler.isEnabled()) handler.disable();
  if (enabled) handler.enable();
}
