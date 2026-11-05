import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useSafety } from '../../hooks/useSafety.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatRelativeTimeI18n } from '../../lib/format-time.js';
import { safeUrl } from '../../lib/safe-url.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { SourceText } from '../SourceText.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { SafetyReport } from '../../lib/api.js';

/** Reports listed while collapsed, and when expanded. */
export const COLLAPSED_REPORTS = 5;
export const EXPANDED_REPORTS = 15;

const FRESH_MAX_AGE = staleAfter('police');

function ReportRow({ report }: { report: SafetyReport }) {
  const { t } = useTranslation();
  return (
    <li className="py-1.5 first:pt-0 last:pb-0">
      <a href={safeUrl(report.url)} target="_blank" rel="noopener noreferrer" className="block group">
        <SourceText as="span" lang="de" className="text-sm text-gray-900 dark:text-gray-100 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
          {report.title}
        </SourceText>
      </a>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted min-w-0">
        {report.district && <SourceText as="span" lang="de" className="min-w-0 truncate">{report.district}</SourceText>}
        {report.location && (
          <span
            className="text-blue-600 dark:text-blue-400"
            role="img"
            aria-label={t('aiNotice.locationEstimated')}
            title={t('aiNotice.locationEstimated')}
          >
            📍
          </span>
        )}
        <span className="ms-auto shrink-0">{formatRelativeTimeI18n(report.publishedAt, t)}</span>
      </div>
    </li>
  );
}

/**
 * The police's newest press releases for the city, newest first, each linked
 * to the original. The same reports are pins on the map's police layer.
 */
export function PoliceStrip({ expanded = false }: { expanded?: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useSafety(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (isLoading) return <Skeleton lines={5} />;
  if (isError) return <StripErrorFallback domain={t('panel.police.title')} onRetry={refetch} />;

  const reports = (data ?? []).slice(0, expanded ? EXPANDED_REPORTS : COLLAPSED_REPORTS);

  return (
    <>
      <div className="flex-1">
        {reports.length === 0 ? (
          <p className="text-sm text-muted py-2 text-center">{t('panel.police.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {reports.map((r) => <ReportRow key={r.id} report={r} />)}
          </ul>
        )}
      </div>
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
