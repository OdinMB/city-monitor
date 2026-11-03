/**
 * Shared popup infrastructure for the city map.
 */

import * as maplibregl from 'maplibre-gl';
import { escapeHtml } from '../../lib/escape-html.js';

// --- Module-level popup state ------------------------------------------------

let _hoverPopup: maplibregl.Popup | null = null;
let _hoverTimer: ReturnType<typeof setTimeout> | null = null;

function _clearHoverTimer() {
  if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
}

function _closeHoverPopup() {
  _clearHoverTimer();
  if (_hoverPopup) { _hoverPopup.remove(); _hoverPopup = null; }
}

// --- Public API --------------------------------------------------------------

export type MapLayerEvent = maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] };
export type PopupContentFn = (e: MapLayerEvent) => { html: string; lngLat: [number, number] } | null;

/**
 * Isolate already-escaped markup as left-to-right text. A number with a unit,
 * or a phone number, that follows a translated label would otherwise have its
 * parts reordered in an Arabic (right-to-left) popup ("21°C" as "C°21"). A
 * value from `lib/format-value.ts` is isolated already and needs only
 * `escapeHtml`. React counterpart: `<Ltr>`.
 */
export function ltr(escapedHtml: string): string {
  return `<bdi dir="ltr">${escapedHtml}</bdi>`;
}

/**
 * German text from a feed or an official source (a headline, a station, a
 * street, a place name), escaped and isolated so that it runs in the
 * direction of its first letter: in an Arabic (right-to-left) popup its
 * brackets, full stop and words stay where they are. Data goes in raw; this
 * escapes it (see `escapeHtml`). React counterpart: `<SourceText>`.
 */
export function sourceText(value: unknown): string {
  return `<bdi dir="auto">${escapeHtml(value)}</bdi>`;
}

// --- Keeping a popup inside the map ------------------------------------------
//
// MapLibre picks which side of the point a popup opens on, but a popup taller
// or wider than the room on that side still runs past the map's edge (on a
// phone, or near the edge of a short map). Each popup is therefore capped to
// the room on its roomier side, scrolls inside when its content is longer,
// and is slid back inside the map when it would still cross an edge.

/** Gap between a popup and the map's edge, in px. */
export const POPUP_EDGE_GAP = 8;
/** Height of MapLibre's popup tip (the small triangle), in px. */
const POPUP_TIP = 10;
/** The popup box's padding and border around its body (globals.css), in px. */
const POPUP_CHROME = 24;
/** Never squeeze a popup below this height or width, in px. */
const POPUP_MIN_HEIGHT = 80;
const POPUP_MIN_WIDTH = 160;

/**
 * Tallest a popup's body may be when it points at `pointY` in a map
 * `mapHeight` px tall: the room above or below the point, whichever is larger,
 * less the popup's offset, its tip, its box's padding and the edge gap.
 */
export function popupMaxHeight(pointY: number, mapHeight: number, offset: number): number {
  const reserved = offset + POPUP_TIP + POPUP_CHROME + POPUP_EDGE_GAP;
  const room = Math.max(pointY - reserved, mapHeight - pointY - reserved);
  return Math.max(Math.floor(room), POPUP_MIN_HEIGHT);
}

/** The requested max width (`'300px'`), narrowed to fit a map `mapWidth` px wide. */
export function popupMaxWidth(requested: string, mapWidth: number): string {
  const cap = Math.max(Math.floor(mapWidth - 2 * POPUP_EDGE_GAP), POPUP_MIN_WIDTH);
  const px = parseFloat(requested);
  return `${Number.isFinite(px) ? Math.min(px, cap) : cap}px`;
}

interface Box { left: number; top: number; right: number; bottom: number }

function shiftInto(lo: number, hi: number, min: number, max: number): number {
  if (hi - lo > max - min) return min - lo; // larger than the room: align its start
  if (lo < min) return min - lo;
  if (hi > max) return max - hi;
  return 0;
}

/** How far to move `inner` so that it sits inside `outer`, `gap` px from each edge. */
export function nudgeIntoBox(inner: Box, outer: Box, gap = POPUP_EDGE_GAP): { dx: number; dy: number } {
  return {
    dx: shiftInto(inner.left, inner.right, outer.left + gap, outer.right - gap),
    dy: shiftInto(inner.top, inner.bottom, outer.top + gap, outer.bottom - gap),
  };
}

/**
 * Keep `popup` inside its map while it is open: cap its body's height before
 * MapLibre places it, and slide its box back inside afterwards. Returns the
 * body element that the popup's markup goes into.
 */
function keepInsideMap(
  map: maplibregl.Map,
  popup: maplibregl.Popup,
  lngLat: maplibregl.LngLatLike,
  html: string,
  offset: number,
  maxWidth: string,
): HTMLElement {
  const container = map.getContainer();
  const body = document.createElement('div');
  body.className = 'map-popup-body';
  body.innerHTML = html;

  const fitSize = () => {
    const at = popup.isOpen() ? popup.getLngLat() : lngLat;
    body.style.maxHeight = `${popupMaxHeight(map.project(at).y, container.clientHeight, offset)}px`;
    const width = popupMaxWidth(maxWidth, container.clientWidth);
    if (width !== popup.getMaxWidth()) popup.setMaxWidth(width);
  };

  const nudge = () => {
    const box = popup.getElement()?.querySelector<HTMLElement>('.maplibregl-popup-content');
    if (!box) return;
    box.style.transform = '';
    const { dx, dy } = nudgeIntoBox(box.getBoundingClientRect(), container.getBoundingClientRect());
    if (dx || dy) box.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  // Sizing runs before MapLibre repositions the popup on a move (its own
  // listener is added by addTo, after this one); the nudge runs after it.
  map.on('move', fitSize);
  map.on('resize', fitSize);
  fitSize();
  popup.once('open', () => {
    map.on('move', nudge);
    map.on('resize', nudge);
    nudge();
  });
  popup.once('close', () => {
    map.off('move', fitSize);
    map.off('resize', fitSize);
    map.off('move', nudge);
    map.off('resize', nudge);
  });
  return body;
}

/** Schedule hover popup close after a 300 ms delay (cancels any pending timer). */
export function scheduleHoverClose() {
  _clearHoverTimer();
  _hoverTimer = setTimeout(_closeHoverPopup, 300);
}

export function showMapPopup(
  map: maplibregl.Map,
  lngLat: maplibregl.LngLatLike,
  html: string,
  opts: { offset?: number; maxWidth?: string; sticky?: boolean } = {},
): maplibregl.Popup {
  const { offset = 10, maxWidth = '300px', sticky = false } = opts;
  _closeHoverPopup();

  const popup = new maplibregl.Popup({
    offset,
    maxWidth,
    closeButton: sticky,
    closeOnClick: sticky,
  }).setLngLat(lngLat);
  popup.setDOMContent(keepInsideMap(map, popup, lngLat, html, offset, maxWidth)).addTo(map);

  if (!sticky) {
    _hoverPopup = popup;
    const el = popup.getElement();
    el.style.pointerEvents = 'auto';
    el.addEventListener('mouseenter', _clearHoverTimer);
    el.addEventListener('mouseleave', () => {
      if (_hoverPopup === popup) _closeHoverPopup();
    });
  }

  popup.on('close', () => {
    if (_hoverPopup === popup) _hoverPopup = null;
  });

  return popup;
}

/** Register hover (desktop) + click (mobile/pin) popup handlers for a layer. */
export function registerPopupHandlers(
  map: maplibregl.Map,
  layerId: string,
  getContent: PopupContentFn,
  opts?: { offset?: number; maxWidth?: string },
) {
  map.on('mouseenter', layerId, (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const c = getContent(e as MapLayerEvent);
    if (c) showMapPopup(map, c.lngLat, c.html, { ...opts, sticky: false });
  });

  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
    scheduleHoverClose();
  });

  map.on('click', layerId, (e) => {
    const c = getContent(e as MapLayerEvent);
    if (c) showMapPopup(map, c.lngLat, c.html, { ...opts, sticky: true });
  });
}
