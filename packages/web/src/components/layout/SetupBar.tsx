import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import type { SetupView } from '../../lib/setup-state.js';
import { cityTiles, standardSections, type ResolvedSection, type SetupChoice, type StandardSetup } from '../../lib/tile-setups.js';
import { BAR_BUTTON } from './SetupControls.js';
import { ShareSetupButton } from './ShareSetupButton.js';

/**
 * The bar above the sections: the switch between Functional, Topics and My
 * setup (once there is one), always one click away; Customize, or Done and
 * Reset in setup mode; and Share.
 */

function ResetMenu() {
  const { t } = useTranslation();
  const { id: cityId, features } = useCityConfig();
  const resetCustom = useTileSetup((s) => s.resetCustom);
  const [open, setOpen] = useState(false);
  const startFrom = (setup: StandardSetup) => {
    if (!window.confirm(t('setup.resetConfirm', { setup: t(`setup.${setup}`) }))) return;
    resetCustom(standardSections(setup, cityId, cityTiles(features)));
    setOpen(false);
  };
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={BAR_BUTTON} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('setup.reset')}
      </button>
      {open && (
        <>
          <button type="button" className={BAR_BUTTON} onClick={() => startFrom('functional')}>{t('setup.startFromFunctional')}</button>
          <button type="button" className={BAR_BUTTON} onClick={() => startFrom('topics')}>{t('setup.startFromTopics')}</button>
        </>
      )}
    </div>
  );
}

export function SetupBar({ view, editing, shown }: { view: SetupView; editing: boolean; shown: readonly ResolvedSection[] }) {
  const { t } = useTranslation();
  const choose = useTileSetup((s) => s.choose);
  const customize = useTileSetup((s) => s.customize);
  const finishEditing = useTileSetup((s) => s.finishEditing);
  const choices: SetupChoice[] = view.custom ? ['functional', 'topics', 'custom'] : ['functional', 'topics'];

  const startCustomizing = () => {
    // A standard setup is copied into My setup, so an existing one would go.
    if (view.choice !== 'custom' && view.custom && !window.confirm(t('setup.replaceConfirm', { setup: t(`setup.${view.choice}`) }))) return;
    customize(shown);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t('setup.label')} className="inline-flex rounded-lg border border-border overflow-hidden bg-surface-1">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={view.choice === choice}
            onClick={() => choose(choice)}
            className={`min-h-8 px-3 text-sm cursor-pointer ${
              view.choice === choice ? 'bg-gray-200 dark:bg-gray-700 font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {t(`setup.${choice}`)}
          </button>
        ))}
      </div>
      {editing ? (
        <>
          <button type="button" className={BAR_BUTTON} onClick={finishEditing}>{t('setup.done')}</button>
          <ResetMenu />
        </>
      ) : (
        <button type="button" className={BAR_BUTTON} onClick={startCustomizing}>{t('setup.customize')}</button>
      )}
      <ShareSetupButton view={view} />
      {editing && <p className="basis-full text-sm text-muted">{t('setup.editing')}</p>}
    </div>
  );
}
