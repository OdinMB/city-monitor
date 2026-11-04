import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CityFeature } from '@city-monitor/shared';
import { useTileSetup } from './useTileSetup.js';
import { useCommandCenter } from './useCommandCenter.js';
import { readPrefs, writePrefs } from '../lib/setup-cookie.js';
import { hasSharedParams, readSharedParams, withoutSharedParams } from '../lib/setup-link.js';
import { pickMapState, sameMapState } from '../lib/map-state.js';
import { defaultView, previewView, type SetupView } from '../lib/setup-state.js';
import { setupMap } from '../lib/setup-maps.js';
import { fitToCity } from '../lib/custom-setup.js';
import { cityTiles, type TileId } from '../lib/tile-setups.js';

/**
 * Where the tile setup and the map come from and go to: on opening a city, a
 * shared link's preview over the setup cookie over the defaults. The map
 * belongs to the setup shown: choosing a setup shows its map, and each change
 * to the map is kept as that setup's (useTileSetup's recordMap). After each
 * change the visitor makes, the cookie. Opening a city, showing a setup's
 * map, and going back from a shared setup are not the visitor's changes, so
 * they run `quietly` and write nothing: a visit without a change sets no
 * cookie. A preview writes nothing either, map changes included, until the
 * visitor keeps it.
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
 * shared link) previewed, else the cookie's setup with its map. The same city
 * again without a link keeps what is on screen.
 */
export function openCity(cityId: string, features: readonly CityFeature[], search: string): void {
  const city = { id: cityId, features };
  const available = cityTiles(features);
  const link = readSharedParams(search);
  const store = useTileSetup.getState();
  const saved = readPrefs()[cityId];
  const sameCity = store.cityId === cityId;
  const own = sameCity ? store.own : fitView(saved?.view ?? defaultView(), available);
  const preview = link.setup || link.map ? fitView(previewView(own, link.setup), available) : null;

  quietly(() => {
    if (preview) store.load(city, own, preview);
    else if (!sameCity) store.load(city, own);
    const map = useCommandCenter.getState();
    if (link.map) map.applyMapState(cityId, link.map);
    else if (preview) map.applyMapState(cityId, setupMap(preview, preview.choice, city));
    else map.enterCity(cityId, setupMap(own, own.choice, city));
  });
}

/** "Back to mine": the visitor's own setup with its map in place of a shared link's. */
export function restoreOwnSetup(cityId: string): void {
  quietly(() => {
    useTileSetup.getState().backToOwn();
    const { own, features } = useTileSetup.getState();
    useCommandCenter.getState().applyMapState(cityId, setupMap(own, own.choice, { id: cityId, features }));
  });
}

/** Shows the map of the setup shown, unless the map shows it already. */
function showSetupMap() {
  const { cityId, features, view } = useTileSetup.getState();
  const map = useCommandCenter.getState();
  if (cityId === null || map.layersCityId !== cityId) return;
  const target = setupMap(view, view.choice, { id: cityId, features });
  if (!sameMapState(target, map)) quietly(() => map.applyMapState(cityId, target));
}

/** Writes the city's own setups, their maps included, to the cookie. */
function persist(cityId: string) {
  const prefs = readPrefs();
  const setup = useTileSetup.getState();
  prefs[cityId] = {
    view: setup.cityId === cityId ? setup.own : prefs[cityId]?.view ?? defaultView(),
    touched: Math.floor(Date.now() / 1000),
  };
  writePrefs(prefs);
}

/** Shows each setup the visitor chooses with its map, and saves each change they make to a setup or a map; returns the unsubscribe. */
export function startPersisting(): () => void {
  const offSetup = useTileSetup.subscribe((state, prev) => {
    if (quiet > 0 || state.cityId === null) return;
    if (!state.shared) showSetupMap();
    if (state.own !== prev.own) persist(state.cityId);
  });
  const offMap = useCommandCenter.subscribe((state, prev) => {
    const cityId = state.layersCityId;
    if (quiet > 0 || cityId === null || cityId !== prev.layersCityId || sameMapState(state, prev)) return;
    // Kept as the map of the setup shown; a preview's only once the visitor keeps it.
    const setup = useTileSetup.getState();
    if (setup.cityId === cityId) setup.recordMap(pickMapState(state));
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
