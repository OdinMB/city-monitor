import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { isolate } from '../../lib/bidi.js';
import { setupLabel } from '../../lib/setup-labels.js';
import { offeredPresets } from '../../lib/setup-maps.js';
import { MAX_SETUP_NAME, type NamedSetup, type SetupView } from '../../lib/setup-state.js';
import { cityTiles, presetSections, type PresetId, type ResolvedSection } from '../../lib/tile-setups.js';
import { BAR_BUTTON } from './SetupControls.js';
import { SetupMenu } from './SetupMenu.js';
import { SharedSetupNotice } from './SharedSetupNotice.js';

/**
 * The bar above the sections: the setup menu, and in setup mode the setup's
 * name, Done and Reset. While a shared link's setup is previewed, the notice
 * that offers to keep it takes the bar's place.
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
 * hands focus back to its button as it closes (in a microtask); focus then
 * moves on to this field, its text selected, so typing names the setup.
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

export function SetupBar({ view, editing, shown, shared }: {
  view: SetupView;
  /** The visitor's setup in setup mode, if any. */
  editing: NamedSetup | null;
  shown: readonly ResolvedSection[];
  /** A shared link's setup is previewed. */
  shared: boolean;
}) {
  const { t } = useTranslation();
  const finishEditing = useTileSetup((s) => s.finishEditing);
  const triggerId = useId();
  const focusMenu = useRef(false);

  // Once the shared-setup notice has given way, focus goes to the menu button in its place.
  useEffect(() => {
    if (shared || !focusMenu.current) return;
    focusMenu.current = false;
    document.getElementById(triggerId)?.focus();
  }, [shared, triggerId]);

  if (shared) return <SharedSetupNotice onDone={() => { focusMenu.current = true; }} />;

  const done = () => {
    finishEditing();
    document.getElementById(triggerId)?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SetupMenu view={view} shown={shown} triggerId={triggerId} />
        {editing && (
          <>
            <button type="button" className={BAR_BUTTON} onClick={done}>{t('setup.done')}</button>
            <ResetMenu setup={editing} />
          </>
        )}
      </div>
      {editing && (
        <>
          <SetupNameField setup={editing} />
          <p className="text-sm text-muted">{t('setup.editing')}</p>
        </>
      )}
    </div>
  );
}
