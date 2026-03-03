/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsSummary } from '../../hooks/useNewsSummary.js';
import { formatRelativeTime } from '../../lib/format-time.js';
import { Skeleton } from '../layout/Skeleton.js';

function BriefingContent({ text }: { text: string }) {
  const lines = text.split('\n').filter(l => l.trim());
  const bullets = lines.filter(l => /^[-•*]\s/.test(l.trim()));

  if (bullets.length > 0) {
    return (
      <ul className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 list-disc list-inside space-y-1">
        {lines.map((line, i) => (
          <li key={i}>{line.replace(/^[-•*]\s+/, '')}</li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
      {text}
    </p>
  );
}

export function BriefingStrip() {
  const { id: cityId } = useCityConfig();
  const { data: summary, isLoading: summaryLoading } = useNewsSummary(cityId);
  const { t } = useTranslation();

  return (
    <>
      {summaryLoading ? (
        <Skeleton lines={2} />
      ) : summary?.briefing ? (
        <>
          <BriefingContent text={summary.briefing} />
          {summary.generatedAt && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {t('panel.news.generatedAgo', { time: formatRelativeTime(summary.generatedAt) })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-400">{t('panel.news.empty')}</p>
      )}
    </>
  );
}
