import { useTranslation } from 'react-i18next';
import { useShownSetup } from '../../hooks/useShownSetup.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { useLiftTileShown } from '../../hooks/useLiftTileShown.js';
import { useEventsTileShown } from '../../hooks/useEventsTileShown.js';
import { sectionLabel } from '../../lib/setup-labels.js';
import type { CustomSetup } from '../../lib/custom-setup.js';
import { sectionWidth, type ResolvedSection, type TileId } from '../../lib/tile-setups.js';
import { SourceText } from '../SourceText.js';
import { DashboardGrid } from './DashboardGrid.js';
import { DashboardTile } from './DashboardTile.js';
import { SetupBar } from './SetupBar.js';
import { HiddenTilesTray, SectionEditor, TileControls } from './SetupControls.js';
import { SupportStrip } from './SupportStrip.js';
import { TileSlotContext } from './tile-slot.js';

/**
 * The dashboard below the map: the setup bar (in setup mode, or while a
 * shared link's setup is previewed) and the setup's sections, each with a
 * heading that collapses it and its own grid of tiles. A section with nothing
 * on screen is left out, except in setup mode, which shows every section of
 * the visitor's setup with its controls and the hidden tiles. The support
 * strip follows the first section shown (at the top when there is none), in
 * every setup and mode. The setup menu is in the top bar (SetupMenu).
 */

type Width = ReturnType<typeof sectionWidth>;

/** A section's place in the page grid: its width from xl up, at most both columns from sm. */
const SECTION_WIDTH: Record<Width, string> = {
  1: 'col-span-1',
  2: 'col-span-1 sm:col-span-2',
  3: 'col-span-1 sm:col-span-2 xl:col-span-3',
  4: 'col-span-1 sm:col-span-2 xl:col-span-4',
};

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
  const headingId = `tile-section-${section.id}`;
  const gridId = `${headingId}-tiles`;
  const open = Boolean(editing) || !collapsed;
  // As wide as its tiles need, so small sections share a row (setup mode keeps every section full width)
  const width = editing ? 4 : sectionWidth(tiles);
  return (
    <section aria-labelledby={headingId} className={`min-w-0 space-y-3 ${SECTION_WIDTH[width]}`}>
      {editing ? (
        <SectionEditor setup={editing} section={section} headingId={headingId} onScreen={onScreen} />
      ) : (
        <SectionHeading section={section} collapsed={collapsed} headingId={headingId} gridId={gridId} />
      )}
      {open && tiles.length === 0 && <p className="text-sm text-muted">{t('setup.emptySection')}</p>}
      {open && tiles.length > 0 && (
        <DashboardGrid id={gridId} columns={width}>
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
  const { view, editing, sections, shared } = useShownSetup();
  const liftShown = useLiftTileShown();
  const collapsed = view.collapsed[view.choice] ?? [];
  const eventsShown = useEventsTileShown();
  const onScreen = (tile: TileId) => (tile !== 'liftOutages' || liftShown) && (tile !== 'events' || eventsShown);
  const shown = editing ? sections : sections.filter((section) => section.tiles.some(onScreen));
  const strip = <SupportStrip key="support-strip" />;
  // One keyed list, so a section that becomes the first (moved up in setup mode) is moved, not mounted afresh
  const items = shown.length === 0 ? [strip] : shown.flatMap((section, index) => {
    const element = <TileSection key={section.id} section={section} collapsed={collapsed.includes(section.id)} editing={editing} onScreen={onScreen} />;
    return index === 0 ? [element, strip] : [element];
  });

  return (
    // Sections flow in order through a four-column grid (two from sm), each as
    // wide as its tiles: small ones share a row instead of leaving it half empty.
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-start gap-x-4 gap-y-6 p-4">
      {(editing || shared) && (
        <div className="col-span-full">
          <SetupBar editing={editing} shared={shared} />
        </div>
      )}
      {items}
      {editing && (
        <div className="col-span-full">
          <HiddenTilesTray setup={editing} />
        </div>
      )}
    </div>
  );
}
