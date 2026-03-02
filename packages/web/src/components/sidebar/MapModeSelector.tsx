/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCommandCenter, type MapMode, type PoliticalLayer } from '../../hooks/useCommandCenter.js';

const MODES: MapMode[] = ['default', 'political'];
const POLITICAL_LAYERS: PoliticalLayer[] = ['bezirke', 'bundestag', 'landesparlament'];

export function MapModeSelector() {
  const { t } = useTranslation();
  const mapMode = useCommandCenter((s) => s.mapMode);
  const politicalLayer = useCommandCenter((s) => s.politicalLayer);
  const setMapMode = useCommandCenter((s) => s.setMapMode);
  const setPoliticalLayer = useCommandCenter((s) => s.setPoliticalLayer);

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        {t('sidebar.mapMode.label')}
      </h3>
      <div className="flex gap-1 mb-2">
        {MODES.map((mode) => (
          <button
            key={mode}
            onClick={() => setMapMode(mode)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              mapMode === mode
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {t(`sidebar.mapMode.${mode}`)}
          </button>
        ))}
      </div>

      {mapMode === 'political' && (
        <div className="space-y-1.5 pl-1">
          {POLITICAL_LAYERS.map((layer) => (
            <label
              key={layer}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
            >
              <input
                type="radio"
                name="political-layer"
                checked={politicalLayer === layer}
                onChange={() => setPoliticalLayer(layer)}
                className="text-gray-900 dark:text-gray-100"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {t(`sidebar.political.${layer}`)}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
