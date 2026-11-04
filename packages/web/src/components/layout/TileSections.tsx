import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { useLiftTileShown } from '../../hooks/useLiftTileShown.js';
import { sectionLabel } from '../../lib/setup-labels.js';
import { defaultView, shownCustom, shownSections } from '../../lib/setup-state.js';
import type { CustomSetup } from '../../lib/custom-setup.js';
import { cityTiles, type ResolvedSection, type TileId } from '../../lib/tile-setups.js';
import { SourceText } from '../SourceText.js';
import { DashboardGrid } from './DashboardGrid.js';
import { DashboardTile } from './DashboardTile.js';
import { SetupBar } from './SetupBar.js';
import { HiddenTilesTray, SectionEditor, TileControls } from './SetupControls.js';
import { TileSlotContext } from './tile-slot.js';

/**
 * The dashboard below the map: the setup bar and the setup's sections, each
 * with a heading that collapses it and its own grid of tiles. A section with
 * nothing on screen is left out, except in setup mode, which shows every
 * section of the visitor's setup with its controls and the hidden tiles.
 */

const DEFAULT_VIEW = defaultView();

interface SectionProps {
  section: ResolvedSection;
  collapsed: boolean;
  /** The visitor's setup while in setup mode. */
  editing: CustomSetup | null;
  onScreen: (tile: TileId) => boolean;
}

function SectionHeading({ section, collapsed, headingId, gridId }: { section: ResolvedSection; collapsed: boolean; headingId: string; gridId: string }) {
  const { t } = useTranslation();
  const toggle = useTileSetup((s) => s.toggleCollapsed);
  const label = sectionLabel(t, section);
  return (
    <h2 id={headingId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={collapsed ? undefined : gridId}
        onClick={() => toggle(section.id)}
        className="inline-flex items-center gap-2 min-h-8 rounded cursor-pointer appearance-none bg-transparent text-start"
      >
        {/* A visitor's own name may be in any script, so it runs in its own direction */}
        {section.name?.trim() ? <SourceText>{label}</SourceText> : label}
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-muted transition-transform ${collapsed ? '' : 'rotate-180'}`} aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </h2>
  );
}

function TileSection({ section, collapsed, editing, onScreen }: SectionProps) {
  const { t } = useTranslation();
  const tiles = section.tiles.filter(onScreen);
  if (!editing && tiles.length === 0) return null;
  const headingId = `tile-section-${section.id}`;
  const gridId = `${headingId}-tiles`;
  const open = Boolean(editing) || !collapsed;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      {editing ? (
        <SectionEditor setup={editing} section={section} headingId={headingId} />
      ) : (
        <SectionHeading section={section} collapsed={collapsed} headingId={headingId} gridId={gridId} />
      )}
      {open && tiles.length === 0 && <p className="text-sm text-muted">{t('setup.emptySection')}</p>}
      {open && tiles.length > 0 && (
        <DashboardGrid id={gridId}>
          {tiles.map((tile, index) => (
            <TileSlotContext.Provider
              key={tile}
              value={{ revealIndex: index, controls: editing ? <TileControls setup={editing} sectionId={section.id} tile={tile} visible={tiles} /> : undefined }}
            >
              <DashboardTile id={tile} />
            </TileSlotContext.Provider>
          ))}
        </DashboardGrid>
      )}
    </section>
  );
}

export function TileSections() {
  const { id: cityId, features } = useCityConfig();
  const storeCity = useTileSetup((s) => s.cityId);
  const storeView = useTileSetup((s) => s.view);
  const storeEditing = useTileSetup((s) => s.editing);
  const shared = useTileSetup((s) => s.shared);
  const liftShown = useLiftTileShown();

  // Until the city is loaded (useSetupSession), its defaults.
  const loaded = storeCity === cityId;
  const view = loaded ? storeView : DEFAULT_VIEW;
  const editing = (loaded && storeEditing && shownCustom(view)) || null;
  const available = useMemo(() => cityTiles(features), [features]);
  const sections = useMemo(() => shownSections(view, cityId, available), [view, cityId, available]);
  const collapsed = view.collapsed[view.choice] ?? [];
  const onScreen = (tile: TileId) => tile !== 'liftOutages' || liftShown;

  return (
    <div className="space-y-6 p-4">
      <SetupBar view={view} editing={editing} shown={sections} shared={loaded && shared} />
      {sections.map((section) => (
        <TileSection key={section.id} section={section} collapsed={collapsed.includes(section.id)} editing={editing} onScreen={onScreen} />
      ))}
      {editing && <HiddenTilesTray setup={editing} />}
    </div>
  );
}
