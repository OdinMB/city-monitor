import { useId, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { useShownSetup } from '../../hooks/useShownSetup.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { isolate } from '../../lib/bidi.js';
import { pickMapState } from '../../lib/map-state.js';
import { setupLabel } from '../../lib/setup-labels.js';
import { offeredPresets } from '../../lib/setup-maps.js';
import {
  MAX_CUSTOM_SETUPS, PREVIEW_ID, canAddSetup, nextSetupName, shownCustom, type NamedSetup, type SetupId, type SetupView,
} from '../../lib/setup-state.js';
import { PRESET_GROUPS, isPreset, type PresetId, type ResolvedSection } from '../../lib/tile-setups.js';
import { SourceText } from '../SourceText.js';
import { Popover } from './Popover.js';
import { setupMenuButtonId, type SetupMenuPlacement } from './setup-focus.js';
import { ShareSetupButton } from './ShareSetupButton.js';

/**
 * The one way into the setups: a sliders icon named after the setup shown
 * ("Customize tiles and map · Everyday", its tooltip too) that opens a menu
 * with the presets the city offers, in two groups, each with what it is for
 * (choosing one sets the tiles and the map; one whose map the visitor changed
 * can have it reset), the visitor's own setups (show, edit, delete), a new
 * setup, sharing the view, and a line on where all this is kept. The setup
 * shown says that its map changes are kept with it. The menu is a non-modal
 * dialog (`Popover`): focus moves into it, and Escape closes it and returns
 * focus to the icon it was opened from. A full-width panel on phones.
 *
 * The icon sits in the top bar, and where the bar is off screen at scroll 0
 * also in the sidebar (`lg` up) and on the map's corner (`sm` to `lg`), each
 * instance with its own `placement` and open state, as the city switcher.
 * While a shared link's setup is previewed the menu lists only the visitor's
 * own setups: choosing one, or a preset, ends the preview.
 */

const ITEM =
  'w-full min-h-8 rounded px-2 py-1.5 text-start text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const ROW_BUTTON =
  'shrink-0 min-h-6 rounded px-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer';

/** The setup menu icon: in the top bar and the sidebar a plain icon, on the map framed like the city switcher there. */
const ICON_BUTTON = 'inline-flex shrink-0 items-center justify-center p-1.5 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800';
const ICON_LOOK: Record<SetupMenuPlacement, string> = {
  topbar: 'rounded',
  sidebar: 'rounded',
  map: 'rounded-lg border border-border bg-surface-1/90 backdrop-blur-sm shadow-lg',
};

function SlidersIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" />
    </svg>
  );
}

/** The name of the setup shown, as plain text: a visitor's own name isolated, as it may be in any script. */
function shownName(t: TFunction, view: SetupView): string {
  const custom = shownCustom(view);
  if (!custom) return setupLabel(t, isPreset(view.choice) ? view.choice : 'everyday');
  return custom.name.trim() ? isolate(custom.name.trim()) : t('setup.custom');
}

function Check() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** A visitor's setup name runs in its own direction, as it may be in any script; a blank one shows the default name. */
function OwnName({ setup }: { setup: Pick<NamedSetup, 'name'> }) {
  const { t } = useTranslation();
  return setup.name.trim() ? <SourceText>{setup.name}</SourceText> : <>{t('setup.custom')}</>;
}

/** Under the setup shown: its map changes are kept with it (not while a shared link's is previewed, which keeps nothing). */
function MapNote({ id }: { id: string }) {
  const { t } = useTranslation();
  return <span id={id} className="mt-0.5 block text-xs text-muted">{t('setup.mapSaved')}</span>;
}

interface PresetItemProps {
  id: PresetId;
  current: boolean;
  /** The visitor changed its map: it can be reset. */
  mapChanged: boolean;
  /** Say that its map changes are kept with it. */
  mapNote: boolean;
  onPick: (id: SetupId) => void;
}

/** A preset, what it is for, and once the visitor changed its map, a button that resets it (focus then stays on the preset). */
function PresetItem({ id, current, mapChanged, mapNote, onPick }: PresetItemProps) {
  const { t } = useTranslation();
  const resetPresetMap = useTileSetup((s) => s.resetPresetMap);
  const button = useRef<HTMLButtonElement>(null);
  const nameId = useId();
  const descriptionId = useId();
  const noteId = useId();
  const resetMap = () => {
    resetPresetMap(id);
    button.current?.focus();
  };
  return (
    <li className="flex items-start gap-1">
      <button
        ref={button}
        type="button"
        className={`${ITEM} min-w-0 flex-1`}
        aria-current={current ? 'true' : undefined}
        aria-labelledby={nameId}
        aria-describedby={mapNote ? `${descriptionId} ${noteId}` : descriptionId}
        onClick={() => onPick(id)}
      >
        <span className="flex items-center gap-1.5 font-medium">
          <span id={nameId}>{setupLabel(t, id)}</span>
          {current && <Check />}
        </span>
        <span id={descriptionId} className="block text-xs text-muted">{t(`setup.description.${id}`)}</span>
        {mapNote && <MapNote id={noteId} />}
      </button>
      {mapChanged && (
        <button type="button" className={`${ROW_BUTTON} mt-1.5`} aria-label={t('setup.resetMapOf', { name: setupLabel(t, id) })} onClick={resetMap}>
          {t('setup.resetMap')}
        </button>
      )}
    </li>
  );
}

interface MenuContentProps {
  view: SetupView;
  shown: readonly ResolvedSection[];
  /** A shared link's setup is previewed. */
  shared: boolean;
  close: () => void;
}

function MenuContent({ view, shown, shared, close }: MenuContentProps) {
  const { t } = useTranslation();
  const city = useCityConfig();
  const choose = useTileSetup((s) => s.choose);
  const startEditing = useTileSetup((s) => s.startEditing);
  const deleteSetup = useTileSetup((s) => s.deleteSetup);
  const newSetup = useTileSetup((s) => s.newSetup);
  const firstItem = useRef<HTMLDivElement>(null);
  const groupId = useId();
  const yoursId = useId();
  const newId = useId();
  const noteId = useId();
  // The previewed setup of someone's is not the visitor's (yet)
  const yours = view.customSetups.filter((s) => s.id !== PREVIEW_ID);
  const ownView = { ...view, customSetups: yours };
  const canAdd = canAddSetup(ownView);
  const offered = useMemo(() => offeredPresets(city), [city]);
  const groups = PRESET_GROUPS.map((group) => ({ ...group, presets: group.presets.filter((p) => offered.includes(p)) })).filter((g) => g.presets.length > 0);

  const pick = (id: SetupId) => {
    choose(id);
    close();
  };
  const edit = (id: NamedSetup['id']) => {
    startEditing(id);
    close();
  };
  const remove = (setup: NamedSetup) => {
    if (!window.confirm(t('setup.deleteConfirm', { name: isolate(setupLabel(t, setup)) }))) return;
    deleteSetup(setup.id);
    // Its row goes; focus stays in the menu.
    firstItem.current?.querySelector('button')?.focus();
  };
  const create = () => {
    newSetup(shown, nextSetupName(ownView, t('setup.custom')), pickMapState(useCommandCenter.getState()));
    close();
  };

  return (
    <div className="space-y-2 p-2 text-sm">
      <div ref={firstItem} className="space-y-2">
        {groups.map((group, index) => (
          <div key={group.key} className={index > 0 ? 'border-t border-border-subtle pt-2' : undefined}>
            <p id={`${groupId}-${group.key}`} className="px-2 pb-1 text-xs font-semibold text-muted">{t(`setup.group.${group.key}`)}</p>
            <ul aria-labelledby={`${groupId}-${group.key}`} className="space-y-0.5">
              {group.presets.map((id) => (
                <PresetItem
                  key={id}
                  id={id}
                  current={view.choice === id}
                  mapChanged={!shared && view.presetMaps[id] !== undefined}
                  mapNote={!shared && view.choice === id}
                  onPick={pick}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {yours.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <p id={yoursId} className="px-2 pb-1 text-xs font-semibold text-muted">{t('setup.yourSetups')}</p>
          <ul aria-labelledby={yoursId} className="space-y-0.5">
            {yours.map((setup) => {
              const name = setupLabel(t, setup);
              const current = view.choice === setup.id;
              const note = current && !shared;
              const nameId = `${yoursId}-${setup.id}`;
              return (
                <li key={setup.id} className="flex items-start gap-1">
                  <button
                    type="button"
                    className={`${ITEM} min-w-0 flex-1 font-medium`}
                    aria-current={current ? 'true' : undefined}
                    aria-labelledby={nameId}
                    aria-describedby={note ? noteId : undefined}
                    onClick={() => pick(setup.id)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span id={nameId} className="min-w-0 truncate"><OwnName setup={setup} /></span>
                      {current && <Check />}
                    </span>
                    {note && <MapNote id={noteId} />}
                  </button>
                  <button type="button" className={`${ROW_BUTTON} mt-1.5`} aria-label={t('setup.editSetup', { name })} onClick={() => edit(setup.id)}>
                    {t('setup.edit')}
                  </button>
                  <button type="button" className={`${ROW_BUTTON} mt-1.5`} aria-label={t('setup.deleteSetup', { name })} onClick={() => remove(setup)}>
                    {t('setup.delete')}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="space-y-0.5 border-t border-border-subtle pt-2">
        <button type="button" className={`${ITEM} font-medium`} disabled={!canAdd} aria-labelledby={newId} aria-describedby={`${newId}-hint`} onClick={create}>
          <span id={newId}>{t('setup.newSetup')}</span>
          <span id={`${newId}-hint`} className="block text-xs font-normal text-muted">
            {canAdd ? t('setup.newSetupHint') : t('setup.setupLimit', { max: MAX_CUSTOM_SETUPS })}
          </span>
        </button>
        <ShareSetupButton view={view} className={`${ITEM} font-medium`} />
      </div>
      <p className="border-t border-border-subtle px-2 pt-2 text-xs text-muted">
        {t('setup.cookieNote')}{' '}
        <Link to="/privacy" className="text-link hover:underline">{t('setup.privacy')}</Link>
      </p>
    </div>
  );
}

/**
 * `placement` names the instance among the others on the page and gives its
 * button its id (`setupMenuButtonId`); `className` places it.
 */
export function SetupMenu({ placement, className = '' }: { placement: SetupMenuPlacement; className?: string }) {
  const { t } = useTranslation();
  const { view, sections, shared } = useShownSetup();
  const [open, setOpen] = useState(false);
  const name = t('setup.openMenu', { name: shownName(t, view) });
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={t('setup.label')}
      // The top bar's sits at its inline end, so the menu lines up with that end.
      placement={placement === 'topbar' ? 'bottom-end' : 'bottom-start'}
      renderTrigger={(ref, props) => (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          id={setupMenuButtonId(placement)}
          type="button"
          {...props}
          aria-label={name}
          title={name}
          className={`${ICON_BUTTON} ${ICON_LOOK[placement]} ${className}`}
        >
          <SlidersIcon />
        </button>
      )}
      className="w-[calc(100vw-1rem)] sm:w-96 max-h-[70vh] overflow-y-auto bg-surface-1 border border-border rounded-lg shadow-lg"
    >
      <MenuContent view={view} shown={sections} shared={shared} close={() => setOpen(false)} />
    </Popover>
  );
}
