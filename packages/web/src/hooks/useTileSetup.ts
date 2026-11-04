import { create } from 'zustand';
import type { CityFeature } from '@city-monitor/shared';
import { customFrom, type CustomSetup } from '../lib/custom-setup.js';
import { diffMapState } from '../lib/map-state.js';
import {
  addSetup, chooseSetup, defaultView, deleteSetup, editSetup, keepPreview, renameSetup, shownCustom, toggleCollapsed, withSetupMap,
  type CustomSetupId, type SetupId, type SetupView,
} from '../lib/setup-state.js';
import { setupBaseMap, type SetupCity } from '../lib/setup-maps.js';
import { cityTiles, type PresetId, type ResolvedSection } from '../lib/tile-setups.js';
import type { MapState } from './useCommandCenter.js';

/**
 * The tile setups of the city on screen: the setup shown, the visitor's own
 * setups, collapsed sections, each setup's map as the visitor changed it,
 * setup mode, and a shared link's preview. Each action but `load`,
 * `backToOwn` and a collapse in the preview is the visitor's own change: it
 * replaces `own`, which useSetupSession then writes to the cookie and shows
 * on the map.
 */
interface TileSetupState {
  /** The city the state is for; another city's dashboard shows the defaults until it is loaded. */
  cityId: string | null;
  features: readonly CityFeature[];
  /** What the dashboard shows. */
  view: SetupView;
  /** The visitor's own: `view`, except while a shared link's is previewed. */
  own: SetupView;
  /** A shared link's setup is previewed (the "viewing a shared setup" bar). */
  shared: boolean;
  /** Setup mode: the visitor's setup shown has its controls. */
  editing: boolean;
  /** Opens a city with the visitor's own view, and a shared link's preview in front of it. */
  load: (city: SetupCity, own: SetupView, preview?: SetupView | null) => void;
  /** Shows a preset or one of the visitor's setups; leaves setup mode. */
  choose: (id: SetupId) => void;
  /** Collapses or expands a section of the setup shown. */
  toggleCollapsed: (sectionId: string) => void;
  /** A new setup of the visitor's from `shown` (the sections on screen) and `map` (the map on screen), shown in setup mode. */
  newSetup: (shown: readonly ResolvedSection[], name: string, map: MapState) => void;
  /** Shows one of the visitor's setups in setup mode. */
  startEditing: (id: CustomSetupId) => void;
  finishEditing: () => void;
  /** Applies a custom-setup operation to the visitor's setup shown. */
  editCustom: (edit: (setup: CustomSetup) => CustomSetup) => void;
  renameCustom: (name: string) => void;
  /** Replaces the sections of the visitor's setup shown with a copy of `from`; its map stays. */
  resetCustom: (from: readonly ResolvedSection[]) => void;
  deleteSetup: (id: CustomSetupId) => void;
  /** Keeps `map`, the map on screen, as the map of the setup shown; not while a shared link's is previewed. */
  recordMap: (map: MapState) => void;
  /** Forgets the visitor's change of a preset's map. */
  resetPresetMap: (preset: PresetId) => void;
  /**
   * Makes the preview the visitor's own, with `map`, the map on screen: a
   * shared setup of someone's as a new setup, or in place of `replace`. False,
   * changing nothing, when they have as many setups as they can keep and no
   * `replace` is given.
   */
  keepShared: (map: MapState, replace?: CustomSetupId) => boolean;
  /** Shows the visitor's own view again in place of the preview. */
  backToOwn: () => void;
}

/** A change the visitor made: shown, and kept as theirs. */
const mine = (view: SetupView) => ({ view, own: view, shared: false });

const now = () => Math.floor(Date.now() / 1000);

/** The view with `map` kept as the map of the setup shown in `city`. */
function withMapShown(view: SetupView, map: MapState, city: SetupCity): SetupView {
  return withSetupMap(view, view.choice, diffMapState(map, setupBaseMap(view.choice, city)), now());
}

export const useTileSetup = create<TileSetupState>((set, get) => {
  const city = (): SetupCity => ({ id: get().cityId ?? '', features: get().features });
  return {
    cityId: null,
    features: [],
    view: defaultView(),
    own: defaultView(),
    shared: false,
    editing: false,
    load: ({ id, features }, own, preview) => set({ cityId: id, features, own, view: preview ?? own, shared: Boolean(preview), editing: false }),
    choose: (id) => set((state) => ({ ...mine(chooseSetup(state.own, id)), editing: false })),
    toggleCollapsed: (sectionId) =>
      set((state) => {
        const view = toggleCollapsed(state.view, sectionId);
        return state.shared ? { view } : mine(view);
      }),
    newSetup: (shown, name, map) =>
      set((state) => {
        const next = addSetup(state.own, shown, name, cityTiles(state.features));
        return next === state.own ? {} : { ...mine(withMapShown(next, map, city())), editing: true };
      }),
    startEditing: (id) =>
      set((state) => {
        const next = chooseSetup(state.own, id);
        return shownCustom(next) ? { ...mine(next), editing: true } : {};
      }),
    finishEditing: () => set({ editing: false }),
    editCustom: (edit) => set((state) => editShown(state.own, (view, id) => editSetup(view, id, edit))),
    renameCustom: (name) => set((state) => editShown(state.own, (view, id) => renameSetup(view, id, name))),
    resetCustom: (from) =>
      set((state) => editShown(state.own, (view, id) => editSetup(view, id, () => customFrom(from, cityTiles(state.features))))),
    deleteSetup: (id) =>
      set((state) => {
        const next = deleteSetup(state.own, id);
        return { ...mine(next), editing: state.editing && next.choice === state.own.choice };
      }),
    recordMap: (map) =>
      set((state) => {
        if (state.shared || state.cityId === null) return {};
        const next = withMapShown(state.own, map, city());
        return next === state.own ? {} : mine(next);
      }),
    resetPresetMap: (preset) =>
      set((state) => {
        const next = withSetupMap(state.own, preset, {}, 0);
        return state.shared || next === state.own ? {} : mine(next);
      }),
    keepShared: (map, replace) => {
      const { own, view, shared } = get();
      if (!shared) return true;
      const kept = keepPreview(own, view, replace);
      if (kept) set(mine(withMapShown(kept, map, city())));
      return kept !== null;
    },
    backToOwn: () => set((state) => ({ view: state.own, shared: false, editing: false })),
  };
});

/** An edit of the visitor's setup shown; nothing when none is shown or the edit changes nothing. */
function editShown(own: SetupView, edit: (view: SetupView, id: CustomSetupId) => SetupView): Partial<TileSetupState> {
  const shown = shownCustom(own);
  if (!shown) return {};
  const next = edit(own, shown.id);
  return next === own ? {} : mine(next);
}
