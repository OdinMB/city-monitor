import { useEffect } from 'react';

/**
 * Setup mode's "Change map layers": brings the map on screen and hands over to
 * the layer list there. From `lg` that is the sidebar, which takes focus on its
 * first layer; below it the layer drawer, which opens with focus inside.
 */

const SHOW_MAP_LAYERS = 'citymonitor:show-map-layers';

/** The width from which the sidebar lists the layers (`lg`, as its `lg:flex`); below it the layer drawer does. */
const SIDEBAR_QUERY = '(min-width: 1024px)';

/** The hero (CommandLayout), which holds the map and both layer lists. */
export const MAP_HERO_ID = 'map-hero';

export function showMapLayers(): void {
  // Its foot at the screen's: on a phone the sticky top bar then covers none of it.
  document.getElementById(MAP_HERO_ID)?.scrollIntoView({ block: 'end' });
  window.dispatchEvent(new Event(SHOW_MAP_LAYERS));
}

/**
 * Runs `onShow`, a stable callback, when the visitor asks to change the map
 * layers and this layer list is the one on screen: the sidebar's (`wide`) or
 * the drawer's.
 */
export function useShowMapLayers(wide: boolean, onShow: () => void): void {
  useEffect(() => {
    const listener = () => {
      if (window.matchMedia(SIDEBAR_QUERY).matches === wide) onShow();
    };
    window.addEventListener(SHOW_MAP_LAYERS, listener);
    return () => window.removeEventListener(SHOW_MAP_LAYERS, listener);
  }, [wide, onShow]);
}
