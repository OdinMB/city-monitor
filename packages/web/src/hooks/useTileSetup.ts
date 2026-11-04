import { create } from 'zustand';
import { customFrom, type CustomSetup } from '../lib/custom-setup.js';
import {
  addSetup, chooseSetup, defaultView, deleteSetup, editSetup, keepPreview, renameSetup, shownCustom, toggleCollapsed,
  type CustomSetupId, type SetupId, type SetupView,
} from '../lib/setup-state.js';
import type { ResolvedSection } from '../lib/tile-setups.js';

/**
 * The tile setups of the city on screen: the setup shown, the visitor's own
 * setups, collapsed sections, setup mode, and a shared link's preview. Each
 * action but `load`, `backToOwn` and a collapse in the preview is the
 * visitor's own change: it replaces `own`, which useSetupSession then writes
 * to the cookie.
 */
interface TileSetupState {
  /** The city the state is for; another city's dashboard shows the defaults until it is loaded. */
  cityId: string | null;
  /** What the dashboard shows. */
  view: SetupView;
  /** The visitor's own: `view`, except while a shared link's is previewed. */
  own: SetupView;
  /** A shared link's setup is previewed (the "viewing a shared setup" bar). */
  shared: boolean;
  /** Setup mode: the visitor's setup shown has its controls. */
  editing: boolean;
  /** Opens a city with the visitor's own view, and a shared link's preview in front of it. */
  load: (cityId: string, own: SetupView, preview?: SetupView | null) => void;
  /** Shows a standard setup or one of the visitor's; leaves setup mode. */
  choose: (id: SetupId) => void;
  /** Collapses or expands a section of the setup shown. */
  toggleCollapsed: (sectionId: string) => void;
  /** A new setup of the visitor's from `shown` (the sections on screen), shown in setup mode. */
  newSetup: (shown: readonly ResolvedSection[], name: string) => void;
  /** Shows one of the visitor's setups in setup mode. */
  startEditing: (id: CustomSetupId) => void;
  finishEditing: () => void;
  /** Applies a custom-setup operation to the visitor's setup shown. */
  editCustom: (edit: (setup: CustomSetup) => CustomSetup) => void;
  renameCustom: (name: string) => void;
  /** Replaces the sections of the visitor's setup shown with a copy of `from`. */
  resetCustom: (from: readonly ResolvedSection[]) => void;
  deleteSetup: (id: CustomSetupId) => void;
  /**
   * Makes the preview the visitor's own: a shared setup of someone's as a new
   * setup, or in place of `replace`. False, changing nothing, when they have
   * as many setups as they can keep and no `replace` is given.
   */
  keepShared: (replace?: CustomSetupId) => boolean;
  /** Shows the visitor's own view again in place of the preview. */
  backToOwn: () => void;
}

/** A change the visitor made: shown, and kept as theirs. */
const mine = (view: SetupView) => ({ view, own: view, shared: false });

export const useTileSetup = create<TileSetupState>((set, get) => ({
  cityId: null,
  view: defaultView(),
  own: defaultView(),
  shared: false,
  editing: false,
  load: (cityId, own, preview) => set({ cityId, own, view: preview ?? own, shared: Boolean(preview), editing: false }),
  choose: (id) => set((state) => ({ ...mine(chooseSetup(state.own, id)), editing: false })),
  toggleCollapsed: (sectionId) =>
    set((state) => {
      const view = toggleCollapsed(state.view, sectionId);
      return state.shared ? { view } : mine(view);
    }),
  newSetup: (shown, name) =>
    set((state) => {
      const next = addSetup(state.own, shown, name);
      return next === state.own ? {} : { ...mine(next), editing: true };
    }),
  startEditing: (id) =>
    set((state) => {
      const next = chooseSetup(state.own, id);
      return shownCustom(next) ? { ...mine(next), editing: true } : {};
    }),
  finishEditing: () => set({ editing: false }),
  editCustom: (edit) => set((state) => editShown(state.own, (view, id) => editSetup(view, id, edit))),
  renameCustom: (name) => set((state) => editShown(state.own, (view, id) => renameSetup(view, id, name))),
  resetCustom: (from) => set((state) => editShown(state.own, (view, id) => editSetup(view, id, () => customFrom(from)))),
  deleteSetup: (id) =>
    set((state) => {
      const next = deleteSetup(state.own, id);
      return { ...mine(next), editing: state.editing && next.choice === state.own.choice };
    }),
  keepShared: (replace) => {
    const { own, view, shared } = get();
    if (!shared) return true;
    const kept = keepPreview(own, view, replace);
    if (kept) set(mine(kept));
    return kept !== null;
  },
  backToOwn: () => set((state) => ({ view: state.own, shared: false, editing: false })),
}));

/** An edit of the visitor's setup shown; nothing when none is shown or the edit changes nothing. */
function editShown(own: SetupView, edit: (view: SetupView, id: CustomSetupId) => SetupView): Partial<TileSetupState> {
  const shown = shownCustom(own);
  if (!shown) return {};
  const next = edit(own, shown.id);
  return next === own ? {} : mine(next);
}
