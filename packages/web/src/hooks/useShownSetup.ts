import { useMemo } from 'react';
import { defaultView, shownCustom, shownSections, type NamedSetup, type SetupView } from '../lib/setup-state.js';
import { cityTiles, type ResolvedSection } from '../lib/tile-setups.js';
import { useCityConfig } from './useCityConfig.js';
import { useTileSetup } from './useTileSetup.js';

const DEFAULT_VIEW = defaultView();

export interface ShownSetup {
  /** What the dashboard shows: the city's view once loaded (useSetupSession), its defaults until then. */
  view: SetupView;
  /** The visitor's setup in setup mode, if any. */
  editing: NamedSetup | null;
  /** The sections on screen. */
  sections: ResolvedSection[];
  /** A shared link's setup is previewed. */
  shared: boolean;
}

/** The setup on screen in the city shown, for the sections and every setup menu on the page. */
export function useShownSetup(): ShownSetup {
  const { id: cityId, features } = useCityConfig();
  const storeCity = useTileSetup((s) => s.cityId);
  const storeView = useTileSetup((s) => s.view);
  const storeEditing = useTileSetup((s) => s.editing);
  const storeShared = useTileSetup((s) => s.shared);

  const loaded = storeCity === cityId;
  const view = loaded ? storeView : DEFAULT_VIEW;
  const editing = (loaded && storeEditing && shownCustom(view)) || null;
  const available = useMemo(() => cityTiles(features), [features]);
  const sections = useMemo(() => shownSections(view, cityId, available), [view, cityId, available]);
  return { view, editing, sections, shared: loaded && storeShared };
}
