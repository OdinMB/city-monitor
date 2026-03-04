import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useSafety } from '../../hooks/useSafety.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { formatRelativeTime } from '../../lib/format-time.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

const FRESH_MAX_AGE = 15 * 60 * 1000; // 15 min (cron every 10 min)

export function SafetyStrip() {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useSafety(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  const reports = data ?? [];

  return (
    <section className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {t('panel.safety.title')}
      </h2>

      {isError ? (
        <StripErrorFallback domain="Safety" onRetry={refetch} />
      ) : isLoading ? (
        <Skeleton lines={4} />
      ) : reports.length === 0 ? (
        <p className="text-sm text-gray-400 py-2 text-center">{t('panel.safety.empty')}</p>
      ) : (
        <>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <a
              key={report.id}
              href={report.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2.5 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {report.title}
                  </div>
                  {report.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                      {report.description}
                    </p>
                  )}
                </div>
                {report.district && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {report.district}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {formatRelativeTime(report.publishedAt)}
              </div>
            </a>
          ))}
        </div>
        {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
        </>
      )}
    </section>
  );
}
