import { create } from 'zustand';
import { customFrom, type CustomSetup } from '../lib/custom-setup.js';
import { defaultView, type SetupView } from '../lib/setup-state.js';
import type { ResolvedSection, SetupChoice } from '../lib/tile-setups.js';

/**
 * The tile setup of the city on screen: which setup is shown, My setup,
 * collapsed sections, and setup mode. Every action but `load` and
 * `backToOwn` is the visitor's own change: it ends a shared view (any edit
 * keeps it) and replaces `own`, which useSetupSession then writes to the cookie.
 */
interface TileSetupState {
  /** The city the state is for; another city's dashboard shows the defaults until it is loaded. */
  cityId: string | null;
  /** What the dashboard shows. */
  view: SetupView;
  /** The visitor's own setup: `view`, except while a shared link's is shown. */
  own: SetupView;
  /** A shared link's setup is shown (the "viewing a shared setup" bar). */
  shared: boolean;
  /** Setup mode: My setup's sections and tiles have their controls. */
  editing: boolean;
  /** Opens a city with the visitor's own setup, and a shared link's in front of it. */
  load: (cityId: string, own: SetupView, shared?: SetupView | null) => void;
  /** Shows a standard setup, or My setup once there is one; leaves setup mode. */
  choose: (choice: SetupChoice) => void;
  /** Collapses or expands a section of the setup shown. */
  toggleCollapsed: (sectionId: string) => void;
  /** Enters setup mode: on My setup when it is shown, else on a copy of `shown` (the standard setup on screen) as My setup. */
  customize: (shown: readonly ResolvedSection[]) => void;
  finishEditing: () => void;
  /** Applies a custom-setup operation to My setup. */
  editCustom: (edit: (setup: CustomSetup) => CustomSetup) => void;
  /** Replaces My setup with a copy of `from`. */
  resetCustom: (from: readonly ResolvedSection[]) => void;
  /** Makes the shared setup the visitor's own. */
  keepShared: () => void;
  /** Shows the visitor's own setup again in place of the shared one. */
  backToOwn: () => void;
}

/** A change the visitor made: shown, and kept as theirs. */
const mine = (view: SetupView) => ({ view, own: view, shared: false });

const asCustom = (view: SetupView, custom: CustomSetup): SetupView => ({
  ...view,
  choice: 'custom',
  custom,
  collapsed: { ...view.collapsed, custom: [] },
});

export const useTileSetup = create<TileSetupState>((set) => ({
  cityId: null,
  view: defaultView(),
  own: defaultView(),
  shared: false,
  editing: false,
  load: (cityId, own, shared) => set({ cityId, own, view: shared ?? own, shared: Boolean(shared), editing: false }),
  choose: (choice) =>
    set((state) => {
      if (choice === 'custom' && !state.view.custom) return {};
      return { ...mine({ ...state.view, choice }), editing: false };
    }),
  toggleCollapsed: (sectionId) =>
    set((state) => {
      const { choice, collapsed } = state.view;
      const ids = collapsed[choice].includes(sectionId) ? collapsed[choice].filter((id) => id !== sectionId) : [...collapsed[choice], sectionId];
      return mine({ ...state.view, collapsed: { ...collapsed, [choice]: ids } });
    }),
  customize: (shown) =>
    set((state) => {
      if (state.view.choice === 'custom' && state.view.custom) return { editing: true };
      return { ...mine(asCustom(state.view, customFrom(shown))), editing: true };
    }),
  finishEditing: () => set({ editing: false }),
  editCustom: (edit) =>
    set((state) => {
      const { custom, collapsed } = state.view;
      if (!custom) return {};
      const next = edit(custom);
      if (next === custom) return {};
      // A deleted section's id may come back for a new one, which should not start collapsed.
      const kept = collapsed.custom.filter((id) => next.sections.some((s) => s.id === id));
      return mine({ ...state.view, custom: next, collapsed: { ...collapsed, custom: kept } });
    }),
  resetCustom: (from) => set((state) => mine(asCustom(state.view, customFrom(from)))),
  keepShared: () => set((state) => (state.shared ? mine(state.view) : {})),
  backToOwn: () => set((state) => ({ view: state.own, shared: false, editing: false })),
}));
