import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { isolate } from '../../lib/bidi.js';
import { setupLabel } from '../../lib/setup-labels.js';
import { offeredPresets } from '../../lib/setup-maps.js';
import { MAX_SETUP_NAME, type NamedSetup } from '../../lib/setup-state.js';
import { cityTiles, presetSections, type PresetId } from '../../lib/tile-setups.js';
import { BAR_BUTTON } from './SetupControls.js';
import { SetupMapRow } from './SetupMapRow.js';
import { SharedSetupNotice } from './SharedSetupNotice.js';
import { focusSetupMenu } from './setup-focus.js';

/**
 * The bar above the sections, while there is something to say there: in
 * setup mode the setup's name, Done and Reset, and its map; while a shared
 * link's setup is previewed, the notice that offers to keep it. The setup
 * menu itself is in the top bar (SetupMenu).
 */

/** Starts the tiles of the setup being edited afresh from a preset the city offers, after a confirm; its map stays. */
function ResetMenu({ setup }: { setup: NamedSetup }) {
  const { t } = useTranslation();
  const city = useCityConfig();
  const resetCustom = useTileSetup((s) => s.resetCustom);
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const presets = useMemo(() => offeredPresets(city), [city]);
  const startFrom = (preset: PresetId) => {
    if (!window.confirm(t('setup.resetConfirm', { name: isolate(setupLabel(t, setup)), setup: setupLabel(t, preset) }))) return;
    resetCustom(presetSections(preset, city.id, cityTiles(city.features)));
    setOpen(false);
  };
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={BAR_BUTTON} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('setup.reset')}
      </button>
      {open && (
        <div role="group" aria-labelledby={labelId} className="flex basis-full flex-wrap items-center gap-2">
          <span id={labelId} className="text-sm text-muted">{t('setup.startFrom')}</span>
          {presets.map((preset) => (
            <button key={preset} type="button" className={BAR_BUTTON} onClick={() => startFrom(preset)}>{setupLabel(t, preset)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The name of the setup being edited. Setup mode opens from the menu, which
 * hands focus back to the icon it was opened from as it closes (in a
 * microtask); focus then moves on to this field, its text selected, so typing
 * names the setup.
 */
function SetupNameField({ setup }: { setup: NamedSetup }) {
  const { t } = useTranslation();
  const rename = useTileSetup((s) => s.renameCustom);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(() => {
      input.current?.focus();
      input.current?.select();
    });
    return () => clearTimeout(timer);
  }, [setup.id]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('setup.setupName')}</label>
      <input
        ref={input}
        id={id}
        type="text"
        value={setup.name}
        placeholder={t('setup.custom')}
        maxLength={MAX_SETUP_NAME}
        onChange={(e) => rename(e.target.value)}
        className="min-h-8 min-w-0 flex-1 sm:flex-none sm:w-64 rounded border border-border bg-surface-1 px-2 text-base font-semibold text-gray-900 dark:text-gray-100"
      />
    </div>
  );
}

/**
 * Renders nothing while neither applies. When Done or the notice's choice
 * takes away the control that had focus, focus goes to the top bar's setup
 * menu icon, which names the setup now shown.
 */
export function SetupBar({ editing, shared }: {
  /** The visitor's setup in setup mode, if any. */
  editing: NamedSetup | null;
  /** A shared link's setup is previewed. */
  shared: boolean;
}) {
  const { t } = useTranslation();
  const finishEditing = useTileSetup((s) => s.finishEditing);

  if (shared) return <SharedSetupNotice onDone={focusSetupMenu} />;
  if (!editing) return null;

  const done = () => {
    finishEditing();
    focusSetupMenu();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SetupNameField setup={editing} />
        <button type="button" className={BAR_BUTTON} onClick={done}>{t('setup.done')}</button>
        <ResetMenu setup={editing} />
      </div>
      <p className="text-sm text-muted">{t('setup.editing')}</p>
      <SetupMapRow />
    </div>
  );
}
