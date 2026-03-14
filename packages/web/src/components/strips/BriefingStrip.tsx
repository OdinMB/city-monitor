import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsSummary } from '../../hooks/useNewsSummary.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { formatRelativeTimeI18n } from '../../lib/format-time.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

function BriefingContent({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  return (
    <div className="text-base leading-relaxed text-gray-700 dark:text-gray-300 space-y-3">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

const FRESH_MAX_AGE = 30 * 60 * 1000; // 30 min (summary cron runs every 15 min)

export function BriefingStrip() {
  const { id: cityId } = useCityConfig();
  const { i18n, t } = useTranslation();
  const { data: summary, fetchedAt, isLoading: summaryLoading, isError: summaryError, refetch: summaryRefetch } = useNewsSummary(cityId, i18n.language);
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (summaryError) return <StripErrorFallback domain="Briefing" onRetry={summaryRefetch} />;

  return (
    <>
      {summaryLoading ? (
        <Skeleton lines={2} />
      ) : summary?.briefing ? (
        <>
          <BriefingContent text={summary.briefing} />
          <TileFooter stale={isStale}>
            {summary.generatedAt && t('panel.news.generatedAgo', { time: formatRelativeTimeI18n(summary.generatedAt, t) })}
            {summary.generatedAt && agoText && ' · '}
            {agoText && t('stale.updated', { time: agoText })}
          </TileFooter>
        </>
      ) : (
        <p className="text-sm text-gray-400">{t('panel.news.empty')}</p>
      )}
    </>
  );
}
