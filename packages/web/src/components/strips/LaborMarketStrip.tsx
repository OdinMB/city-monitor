/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useLaborMarket } from '../../hooks/useLaborMarket.js';
import { Skeleton } from '../layout/Skeleton.js';

function formatYoy(percent: number): { text: string; color: string } {
  const sign = percent > 0 ? '+' : '';
  const value = Number.isInteger(percent) ? percent : percent.toFixed(1);
  const color = percent > 0
    ? 'text-red-500 dark:text-red-400'
    : percent < 0
      ? 'text-green-500 dark:text-green-400'
      : 'text-gray-400';
  return { text: `${sign}${value}%`, color };
}

export function LaborMarketStrip() {
  const { id: cityId } = useCityConfig();
  const isBerlin = cityId === 'berlin';
  const { data, isLoading } = useLaborMarket(cityId, isBerlin);
  const { t } = useTranslation();

  if (!isBerlin) return null;
  if (isLoading) return <Skeleton lines={2} />;
  if (!data) return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.laborMarket.empty')}</p>;

  const totalYoy = formatYoy(data.yoyChangePercent);
  const sgbIIYoy = formatYoy(data.sgbIIYoyPercent);

  return (
    <div className="flex flex-col gap-4 py-1">
      {/* Unemployment */}
      <div className="flex flex-col items-center">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('panel.laborMarket.unemployment')}
        </span>
        <span className="text-4xl font-extrabold tabular-nums leading-none text-amber-600 dark:text-amber-400 mt-1">
          {data.unemploymentRate.toFixed(1)}%
        </span>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs">
          <span className="text-gray-500 dark:text-gray-400 tabular-nums">
            {data.totalUnemployed.toLocaleString('de-DE')}
          </span>
          <span className="text-gray-300 dark:text-gray-600">&middot;</span>
          <span className={`font-medium ${totalYoy.color}`}>
            {totalYoy.text} {t('panel.laborMarket.yoy')}
          </span>
        </div>
      </div>

      {/* SGB II */}
      <div className="flex flex-col items-center">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('panel.laborMarket.sgbII')}
        </span>
        <span className="text-4xl font-extrabold tabular-nums leading-none text-orange-600 dark:text-orange-400 mt-1">
          {data.sgbIIRate.toFixed(1)}%
        </span>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs">
          <span className="text-gray-500 dark:text-gray-400 tabular-nums">
            {data.sgbIICount.toLocaleString('de-DE')}
          </span>
          <span className="text-gray-300 dark:text-gray-600">&middot;</span>
          <span className={`font-medium ${sgbIIYoy.color}`}>
            {sgbIIYoy.text} {t('panel.laborMarket.yoy')}
          </span>
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 dark:text-gray-500">
        {data.reportMonth}
      </div>
    </div>
  );
}
