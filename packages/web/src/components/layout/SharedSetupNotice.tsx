import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { restoreOwnSetup } from '../../hooks/useSetupSession.js';
import { isolate } from '../../lib/bidi.js';
import { pickMapState } from '../../lib/map-state.js';
import { setupLabel } from '../../lib/setup-labels.js';
import { MAX_CUSTOM_SETUPS, type CustomSetupId } from '../../lib/setup-state.js';
import { BAR_BUTTON } from './SetupControls.js';

/**
 * While a shared link's setup is previewed: say so, and offer to keep it,
 * with the map as it shows, or go back to the visitor's own. Keeping
 * someone's setup when the visitor already has as many as they can keep asks
 * which one it replaces, or lets them cancel. `onDone` runs once the preview
 * has ended, so focus can go to what replaces this bar.
 */
export function SharedSetupNotice({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const keepShared = useTileSetup((s) => s.keepShared);
  const customSetups = useTileSetup((s) => s.own.customSetups);
  const [replacing, setReplacing] = useState(false);
  const choices = useRef<HTMLDivElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const questionId = useId();

  const keep = (replace?: CustomSetupId) => {
    if (keepShared(pickMapState(useCommandCenter.getState()), replace)) {
      onDone();
      return;
    }
    flushSync(() => setReplacing(true));
    choices.current?.querySelector('button')?.focus();
  };
  const cancel = () => {
    flushSync(() => setReplacing(false));
    keepButton.current?.focus();
  };
  const back = () => {
    restoreOwnSetup(cityId);
    onDone();
  };

  return (
    <div role="region" aria-label={t('setup.shared.notice')} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
      <p className="text-gray-900 dark:text-gray-100">{t('setup.shared.notice')}</p>
      {replacing ? (
        <div ref={choices} role="group" aria-labelledby={questionId} className="flex basis-full flex-wrap items-center gap-2">
          <p id={questionId} className="basis-full text-gray-900 dark:text-gray-100">{t('setup.shared.replaceQuestion', { max: MAX_CUSTOM_SETUPS })}</p>
          {customSetups.map((setup) => (
            <button key={setup.id} type="button" className={BAR_BUTTON} onClick={() => keep(setup.id)}>
              {t('setup.shared.replace', { name: isolate(setupLabel(t, setup)) })}
            </button>
          ))}
          <button type="button" className={BAR_BUTTON} onClick={cancel}>{t('setup.shared.cancel')}</button>
        </div>
      ) : (
        <>
          <button ref={keepButton} type="button" className={BAR_BUTTON} onClick={() => keep()}>{t('setup.shared.keep')}</button>
          <button type="button" className={BAR_BUTTON} onClick={back}>{t('setup.shared.back')}</button>
        </>
      )}
    </div>
  );
}
