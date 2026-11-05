import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { useCityLayers } from '../../hooks/useHospitals.js';
import { showMapLayers } from '../../hooks/useShowMapLayers.js';
import { layersOn } from '../../lib/map-layers.js';
import { BAR_BUTTON } from './SetupControls.js';

/**
 * Setup mode's map row: the layers the setup shows (the ones switched on, in
 * the layer list's order and words), that switching layers changes the
 * setup's map, and a button that takes the visitor to the layer list
 * (useShowMapLayers): the map scrolls into view, and the sidebar takes focus
 * or the layer drawer opens.
 */
export function SetupMapRow() {
  const { t } = useTranslation();
  const city = useCityConfig();
  const available = useCityLayers(city);
  const activeLayers = useCommandCenter((s) => s.activeLayers);
  const shown = layersOn(activeLayers, available.layers);
  const labelId = useId();
  const noteId = useId();

  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={noteId} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm">
      <span id={labelId} className="font-semibold text-gray-900 dark:text-gray-100">{t('setup.map.label')}</span>
      {shown.length > 0 ? (
        <ul aria-label={t('setup.map.layers')} className="flex flex-wrap gap-1.5">
          {shown.map((layer) => (
            <li key={layer} className="rounded-full border border-border bg-surface-0 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-200">
              {t(`sidebar.layers.${layer}`)}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-muted">{t('setup.map.none')}</span>
      )}
      <button type="button" className={`${BAR_BUTTON} ms-auto`} onClick={showMapLayers}>{t('setup.map.change')}</button>
      <p id={noteId} className="basis-full text-xs text-muted">{t('setup.mapSaved')}</p>
    </div>
  );
}
