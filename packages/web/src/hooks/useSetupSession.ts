import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CityFeature } from '@city-monitor/shared';
import { useTileSetup } from './useTileSetup.js';
import { defaultMapState, useCommandCenter } from './useCommandCenter.js';
import { readPrefs, writePrefs } from '../lib/setup-cookie.js';
import { hasSharedParams, readSharedParams, withoutSharedParams, type SharedSetup } from '../lib/setup-link.js';
import { pickMapState, sameMapState } from '../lib/map-state.js';
import { defaultView, type SetupView } from '../lib/setup-state.js';
import { fitToCity } from '../lib/custom-setup.js';
import { cityTiles, type TileId } from '../lib/tile-setups.js';

/**
 * Where the tile setup and the map state come from and go to: on opening a
 * city, a shared link's parameters over the setup cookie over the defaults;
 * after each change the visitor makes, the cookie. Opening a city, and going
 * back from a shared setup, are not the visitor's changes, so they run
 * `quietly` and write nothing: a visit without a change sets no cookie.
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

function fitView(view: SetupView, available: readonly TileId[]): SetupView {
  return view.custom ? { ...view, custom: fitToCity(view.custom, available) } : view;
}

/** A shared link's setup shown over the visitor's own, which keeps My setup unless the link brings one. */
function sharedOver(own: SetupView, shared: SharedSetup): SetupView {
  if (shared.choice === 'custom' && shared.custom) {
    return { ...own, choice: 'custom', custom: shared.custom, collapsed: { ...own.collapsed, custom: [] } };
  }
  return { ...own, choice: shared.choice };
}

/**
 * Opens a city's dashboard with the setup and map state from `search` (a
 * shared link), else the cookie's. The same city again without a link keeps
 * what is on screen.
 */
export function openCity(cityId: string, features: readonly CityFeature[], search: string): void {
  const available = cityTiles(features);
  const link = readSharedParams(search);
  const store = useTileSetup.getState();
  const saved = readPrefs()[cityId];
  const sameCity = store.cityId === cityId;
  const own = sameCity ? store.own : fitView(saved?.view ?? defaultView(), available);
  const shared = link.setup || link.map ? fitView(link.setup ? sharedOver(own, link.setup) : own, available) : null;

  quietly(() => {
    if (shared) store.load(cityId, own, shared);
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
    // A change to a shared map keeps the shared setup, which saves both.
    const setup = useTileSetup.getState();
    if (setup.shared) setup.keepShared();
    else persist(cityId);
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
