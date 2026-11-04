import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { restoreOwnSetup } from '../../hooks/useSetupSession.js';
import { BAR_BUTTON } from './SetupControls.js';

/** While a shared link's setup is shown: say so, and offer to keep it or go back to the visitor's own. */
export function SharedSetupNotice() {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const keepShared = useTileSetup((s) => s.keepShared);
  return (
    <div role="region" aria-label={t('setup.shared.notice')} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
      <p className="text-gray-900 dark:text-gray-100">{t('setup.shared.notice')}</p>
      <button type="button" className={BAR_BUTTON} onClick={keepShared}>{t('setup.shared.keep')}</button>
      <button type="button" className={BAR_BUTTON} onClick={() => restoreOwnSetup(cityId)}>{t('setup.shared.back')}</button>
    </div>
  );
}
