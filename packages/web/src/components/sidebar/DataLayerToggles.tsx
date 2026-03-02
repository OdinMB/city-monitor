/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCommandCenter, type DataLayer } from '../../hooks/useCommandCenter.js';

const LAYERS: DataLayer[] = ['transit', 'events', 'weather', 'news', 'safety'];

export function DataLayerToggles() {
  const { t } = useTranslation();
  const activeLayers = useCommandCenter((s) => s.activeLayers);
  const toggleLayer = useCommandCenter((s) => s.toggleLayer);

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        {t('sidebar.layers.label')}
      </h3>
      <div className="space-y-1.5">
        {LAYERS.map((layer) => (
          <label
            key={layer}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={activeLayers.has(layer)}
              onChange={() => toggleLayer(layer)}
              className="rounded border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t(`sidebar.layers.${layer}`)}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
