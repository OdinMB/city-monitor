import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsSummary } from '../../hooks/useNewsSummary.js';
import { formatRelativeTime } from '../../lib/format-time.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';

function BriefingContent({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  return (
    <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 space-y-2">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

export function BriefingStrip() {
  const { id: cityId } = useCityConfig();
  const { i18n, t } = useTranslation();
  const { data: summary, isLoading: summaryLoading, isError: summaryError, refetch: summaryRefetch } = useNewsSummary(cityId, i18n.language);

  if (summaryError) return <StripErrorFallback domain="Briefing" onRetry={summaryRefetch} />;

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
