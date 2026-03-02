/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsSummary } from '../../hooks/useNewsSummary.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { Skeleton } from '../layout/Skeleton.js';

export function BriefingStrip() {
  const { id: cityId } = useCityConfig();
  const { data: summary, isLoading: summaryLoading } = useNewsSummary(cityId);
  const { data: digest } = useNewsDigest(cityId);
  const { t } = useTranslation();

  const headlineCount = digest?.items?.length ?? 0;

  return (
    <section className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('panel.news.briefing')}
        </h2>
        {headlineCount > 0 && (
          <span className="text-xs text-gray-400">
            {t('panel.news.headlines_count', { count: headlineCount })}
          </span>
        )}
      </div>
      {summaryLoading ? (
        <Skeleton lines={2} />
      ) : summary?.briefing ? (
        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {summary.briefing}
        </p>
      ) : (
        <p className="text-sm text-gray-400">{t('panel.news.empty')}</p>
      )}
    </section>
  );
}
