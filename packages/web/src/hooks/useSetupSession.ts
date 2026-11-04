import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CityFeature } from '@city-monitor/shared';
import { useTileSetup } from './useTileSetup.js';
import { defaultMapState, useCommandCenter } from './useCommandCenter.js';
import { readPrefs, writePrefs } from '../lib/setup-cookie.js';
import { hasSharedParams, readSharedParams, withoutSharedParams } from '../lib/setup-link.js';
import { pickMapState, sameMapState } from '../lib/map-state.js';
import { defaultView, previewView, type SetupView } from '../lib/setup-state.js';
import { fitToCity } from '../lib/custom-setup.js';
import { cityTiles, type TileId } from '../lib/tile-setups.js';

/**
 * Where the tile setup and the map state come from and go to: on opening a
 * city, a shared link's preview over the setup cookie over the defaults;
 * after each change the visitor makes, the cookie. Opening a city, and going
 * back from a shared setup, are not the visitor's changes, so they run
 * `quietly` and write nothing: a visit without a change sets no cookie. A
 * preview writes nothing either, map changes included, until the visitor
 * keeps it.
 */

let quiet = 0;

function quietly(run: () => void) {
  quiet += 1;
  try {
    run();
  } finally {
    quiet -= 1;
  }
}

/** The view with each of its setups fitted to the city's tiles. */
function fitView(view: SetupView, available: readonly TileId[]): SetupView {
  if (view.customSetups.length === 0) return view;
  return { ...view, customSetups: view.customSetups.map((setup) => ({ ...setup, ...fitToCity(setup, available) })) };
}

/**
 * Opens a city's dashboard with the setup and map state from `search` (a
 * shared link) previewed, else the cookie's. The same city again without a
 * link keeps what is on screen.
 */
export function openCity(cityId: string, features: readonly CityFeature[], search: string): void {
  const available = cityTiles(features);
  const link = readSharedParams(search);
  const store = useTileSetup.getState();
  const saved = readPrefs()[cityId];
  const sameCity = store.cityId === cityId;
  const own = sameCity ? store.own : fitView(saved?.view ?? defaultView(), available);
  const preview = link.setup || link.map ? fitView(previewView(own, link.setup), available) : null;

  quietly(() => {
    if (preview) store.load(cityId, own, preview);
    else if (!sameCity) store.load(cityId, own);
    if (link.map) useCommandCenter.getState().applyMapState(cityId, link.map);
    else useCommandCenter.getState().enterCity(cityId, saved?.map);
  });
}

/** "Back to mine": the visitor's own setup and saved map state (or the city's defaults) in place of a shared link's. */
export function restoreOwnSetup(cityId: string): void {
  quietly(() => {
    useTileSetup.getState().backToOwn();
    useCommandCenter.getState().applyMapState(cityId, readPrefs()[cityId]?.map ?? {});
  });
}

/** Writes the city's own setup, and its map state unless that is the city's default, to the cookie. */
function persist(cityId: string) {
  const map = pickMapState(useCommandCenter.getState());
  const prefs = readPrefs();
  const setup = useTileSetup.getState();
  prefs[cityId] = {
    view: setup.cityId === cityId ? setup.own : prefs[cityId]?.view ?? defaultView(),
    ...(sameMapState(map, defaultMapState(cityId)) ? {} : { map }),
    touched: Math.floor(Date.now() / 1000),
  };
  writePrefs(prefs);
}

/** Saves each change the visitor makes to the setup or the map; returns the unsubscribe. */
export function startPersisting(): () => void {
  const offSetup = useTileSetup.subscribe((state, prev) => {
    if (quiet > 0 || state.cityId === null || state.own === prev.own) return;
    persist(state.cityId);
  });
  const offMap = useCommandCenter.subscribe((state, prev) => {
    const cityId = state.layersCityId;
    if (quiet > 0 || cityId === null || cityId !== prev.layersCityId || sameMapState(state, prev)) return;
    // A preview's map is saved with its setup once kept, or not at all.
    if (!useTileSetup.getState().shared) persist(cityId);
  });
  return () => {
    offSetup();
    offMap();
  };
}

/**
 * Opens the dashboard's city before the map's first paint, takes a shared
 * link's parameters out of the address once applied (other parameters stay),
 * and saves the visitor's changes while the dashboard is open.
 */
export function useSetupSession(cityId: string, features: readonly CityFeature[]): void {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => openCity(cityId, features, search), [cityId, features, search]);

  // After the router has subscribed to the history (its own layout effect
  // runs after this component's), or it would miss the change.
  useEffect(() => {
    if (hasSharedParams(search)) navigate({ pathname, search: withoutSharedParams(search), hash }, { replace: true });
  }, [pathname, search, hash, navigate]);

  useEffect(() => startPersisting(), []);
}
