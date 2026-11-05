import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import {
  MAX_SECTIONS, MAX_SECTION_NAME, addSection, canDeleteSection, deleteSection, moveSection, moveTile, placeTile, removeTile, renameSection,
  type CustomSetup,
} from '../../lib/custom-setup.js';
import { sectionLabel, tileTitle } from '../../lib/setup-labels.js';
import { SUPPORT_TILE, type ResolvedSection, type TileId } from '../../lib/tile-setups.js';
import { SourceText } from '../SourceText.js';
import { Popover } from './Popover.js';
import { focusTileControls } from './setup-focus.js';

/**
 * Setup mode's controls for the visitor's setup: per section (add a tile,
 * rename, move, delete), per tile (move, move to another section, hide), the
 * hidden tiles and adding a section. Buttons, selects and a small list rather
 * than drag and drop, so they work by keyboard, touch and screen reader
 * alike; each is at least 24 px (WCAG 2.5.8).
 */

const CONTROL_BUTTON =
  'inline-flex items-center justify-center min-h-6 min-w-6 px-1.5 rounded border border-border bg-surface-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

/** The setup bar's and the shared-setup notice's buttons: the same, a size up. */
export const BAR_BUTTON = `${CONTROL_BUTTON} min-h-8 px-3 text-sm`;

const CONTROL_SELECT =
  'min-h-6 max-w-[11rem] rounded border border-border bg-surface-1 px-1 text-xs text-gray-700 dark:text-gray-200 cursor-pointer';

function useEdit() {
  return useTileSetup((s) => s.editCustom);
}

const ITEM =
  'w-full min-h-8 rounded px-2 py-1 text-start text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer';

function PlusIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" /><path d="M5 12h14" />
    </svg>
  );
}

/**
 * A section's "+": a small list of the tiles to add to it, first the hidden
 * ones, then those in other sections (choosing one moves it here), each to the
 * end of the section. A non-modal dialog (`Popover`): focus moves into it,
 * Escape closes it with focus back on the button, and a choice closes it with
 * focus on the tile's controls in its new place. `onScreen` leaves out a tile
 * that renders nothing (the lift tile while there is no data).
 */
function AddTileMenu({ setup, section, onScreen }: { setup: CustomSetup; section: ResolvedSection; onScreen: (tile: TileId) => boolean }) {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const edit = useEdit();
  const [open, setOpen] = useState(false);
  const hiddenId = useId();
  const otherId = useId();
  const label = t('setup.addTile.label', { name: sectionLabel(t, section) });
  const hidden = setup.hidden.filter(onScreen);
  const others = setup.sections.filter((s) => s.id !== section.id)
    .flatMap((s) => s.tiles.filter(onScreen).map((tile) => ({ tile, from: s })));

  const add = (tile: TileId) => {
    edit((s) => placeTile(s, tile, section.id));
    setOpen(false);
    // The popover hands focus back to its button as it closes (a microtask); then on to the tile.
    setTimeout(() => focusTileControls(tile));
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={label}
      renderTrigger={(ref, props) => (
        <button ref={ref as React.Ref<HTMLButtonElement>} type="button" {...props} className={CONTROL_BUTTON} aria-label={label} title={label}>
          <PlusIcon />
        </button>
      )}
      className="w-72 max-w-[calc(100vw-1rem)] bg-surface-1 border border-border rounded-lg shadow-lg"
    >
      <div className="space-y-2 p-2 text-sm">
        {hidden.length > 0 && (
          <div>
            <p id={hiddenId} className="px-2 pb-1 text-xs font-semibold text-muted">{t('setup.hiddenTiles')}</p>
            <ul aria-labelledby={hiddenId} className="space-y-0.5">
              {hidden.map((tile) => (
                <li key={tile}>
                  <button type="button" className={ITEM} onClick={() => add(tile)}>{tileTitle(t, tile, cityId)}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {others.length > 0 && (
          <div className={hidden.length > 0 ? 'border-t border-border-subtle pt-2' : undefined}>
            <p id={otherId} className="px-2 pb-1 text-xs font-semibold text-muted">{t('setup.addTile.fromOther')}</p>
            <ul aria-labelledby={otherId} className="space-y-0.5">
              {others.map(({ tile, from }) => (
                <li key={tile}>
                  <button
                    type="button"
                    className={ITEM}
                    aria-labelledby={`${otherId}-${tile}`}
                    aria-describedby={`${otherId}-${tile}-from`}
                    onClick={() => add(tile)}
                  >
                    <span id={`${otherId}-${tile}`} className="block">{tileTitle(t, tile, cityId)}</span>
                    <span id={`${otherId}-${tile}-from`} className="block text-xs text-muted">
                      {/* A visitor's own section name may be in any script */}
                      {from.name?.trim() ? <SourceText>{sectionLabel(t, from)}</SourceText> : sectionLabel(t, from)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {hidden.length === 0 && others.length === 0 && <p className="px-2 py-1 text-muted">{t('setup.addTile.none')}</p>}
      </div>
    </Popover>
  );
}

export function SectionEditor({ setup, section, headingId, onScreen }: {
  setup: CustomSetup;
  section: ResolvedSection;
  headingId: string;
  /** Whether a tile renders anything (the lift tile only with data). */
  onScreen: (tile: TileId) => boolean;
}) {
  const { t } = useTranslation();
  const edit = useEdit();
  const index = setup.sections.findIndex((s) => s.id === section.id);
  const label = sectionLabel(t, section);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 id={headingId} className="sr-only">{label}</h2>
      <input
        type="text"
        value={section.name ?? label}
        maxLength={MAX_SECTION_NAME}
        onChange={(e) => edit((s) => renameSection(s, section.id, e.target.value))}
        aria-label={t('setup.sectionName')}
        className="min-h-8 min-w-0 flex-1 sm:flex-none sm:w-64 rounded border border-border bg-surface-1 px-2 text-base font-semibold text-gray-900 dark:text-gray-100"
      />
      <AddTileMenu setup={setup} section={section} onScreen={onScreen} />
      <button type="button" className={CONTROL_BUTTON} disabled={index <= 0} onClick={() => edit((s) => moveSection(s, section.id, -1))} aria-label={t('setup.moveSectionUp', { name: label })}>
        <span aria-hidden="true">↑</span>
      </button>
      <button type="button" className={CONTROL_BUTTON} disabled={index >= setup.sections.length - 1} onClick={() => edit((s) => moveSection(s, section.id, 1))} aria-label={t('setup.moveSectionDown', { name: label })}>
        <span aria-hidden="true">↓</span>
      </button>
      <button type="button" className={CONTROL_BUTTON} disabled={!canDeleteSection(setup)} onClick={() => edit((s) => deleteSection(s, section.id))} aria-label={t('setup.deleteSection', { name: label })}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

/** Choose a section to put a tile in; the tile's own section is left out. */
function SectionSelect({ setup, exceptId, label, onPick }: { setup: CustomSetup; exceptId?: string; label: string; onPick: (sectionId: string) => void }) {
  const { t } = useTranslation();
  return (
    <select className={CONTROL_SELECT} value="" aria-label={label} onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">{t('setup.chooseSection')}</option>
      {setup.sections.filter((s) => s.id !== exceptId).map((s) => (
        <option key={s.id} value={s.id}>{sectionLabel(t, s)}</option>
      ))}
    </select>
  );
}

/**
 * A tile's controls inside its card. `visible` is the section's tiles on
 * screen, so the first and last of them cannot move further.
 */
export function TileControls({ setup, sectionId, tile, visible }: { setup: CustomSetup; sectionId: string; tile: TileId; visible: readonly TileId[] }) {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const edit = useEdit();
  const title = tileTitle(t, tile, cityId);
  const at = visible.indexOf(tile);
  const onScreen = (id: TileId) => visible.includes(id);
  return (
    // data-tile-controls: where a tile added from a section's "+" gets focus (focusTileControls)
    <div data-tile-controls={tile} className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-surface-0">
      <button type="button" className={CONTROL_BUTTON} disabled={at <= 0} onClick={() => edit((s) => moveTile(s, tile, -1, onScreen))} aria-label={t('setup.moveTileUp', { title })}>
        <span aria-hidden="true">↑</span>
      </button>
      <button type="button" className={CONTROL_BUTTON} disabled={at >= visible.length - 1} onClick={() => edit((s) => moveTile(s, tile, 1, onScreen))} aria-label={t('setup.moveTileDown', { title })}>
        <span aria-hidden="true">↓</span>
      </button>
      {setup.sections.length > 1 && (
        <SectionSelect setup={setup} exceptId={sectionId} label={t('setup.moveTileTo', { title })} onPick={(to) => edit((s) => placeTile(s, tile, to))} />
      )}
      {tile !== SUPPORT_TILE && (
        <button type="button" className={`${CONTROL_BUTTON} ms-auto`} onClick={() => edit((s) => removeTile(s, tile))} aria-label={t('setup.removeTile', { title })}>
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}

/** The city's tiles the setup does not place, each with a section to add it to; and adding a section. */
export function HiddenTilesTray({ setup }: { setup: CustomSetup }) {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const edit = useEdit();
  return (
    <div className="space-y-4">
      <button
        type="button"
        className={BAR_BUTTON}
        disabled={setup.sections.length >= MAX_SECTIONS}
        onClick={() => edit((s) => addSection(s, t('setup.newSection')))}
      >
        {t('setup.addSection')}
      </button>
      <section aria-labelledby="hidden-tiles-heading" className="rounded-lg border border-dashed border-border p-4">
        <h2 id="hidden-tiles-heading" className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('setup.hiddenTiles')}</h2>
        {setup.hidden.length === 0 ? (
          <p className="text-sm text-muted">{t('setup.noHiddenTiles')}</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {setup.hidden.map((tile) => {
              const title = tileTitle(t, tile, cityId);
              return (
                <li key={tile} className="flex items-center gap-2 rounded border border-border bg-surface-1 px-2 py-1 text-sm">
                  <span>{title}</span>
                  <SectionSelect setup={setup} label={t('setup.addTileTo', { title })} onPick={(to) => edit((s) => placeTile(s, tile, to))} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
