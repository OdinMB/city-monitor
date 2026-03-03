/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Shared popup infrastructure for the city map.
 */

import maplibregl from 'maplibre-gl';

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
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);

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
