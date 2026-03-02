/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCommandCenter, type TimeRange } from '../../hooks/useCommandCenter.js';

const TIME_RANGES: TimeRange[] = ['1h', '6h', '24h', '48h', '7d', 'all'];

export function TimeRangeSelector() {
  const { t } = useTranslation();
  const timeRange = useCommandCenter((s) => s.timeRange);
  const setTimeRange = useCommandCenter((s) => s.setTimeRange);

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        {t('sidebar.timeRange.label')}
      </h3>
      <div className="grid grid-cols-3 gap-1.5">
        {TIME_RANGES.map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
              timeRange === range
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {t(`sidebar.timeRange.${range}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
