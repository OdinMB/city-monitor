import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTransit } from '../../hooks/useTransit.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { TransitAlert } from '../../lib/api.js';

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const COLLAPSED_MAX = 6;
const EXPANDED_MAX = 12;

function getLineBadgeColor(line: string): string {
  if (line.startsWith('U')) return 'bg-blue-600 text-white';
  if (line.startsWith('S')) return 'bg-green-600 text-white';
  if (line.startsWith('M') || line.toLowerCase().includes('tram')) return 'bg-red-600 text-white';
  return 'bg-yellow-600 text-white';
}

function getSeverityDot(severity: TransitAlert['severity']): string {
  if (severity === 'high') return 'bg-red-500';
  if (severity === 'medium') return 'bg-amber-500';
  return 'bg-gray-400';
}

const AlertRow = memo(function AlertRow({ alert }: { alert: TransitAlert }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${getSeverityDot(alert.severity)}`} />
      <div className="flex items-center gap-1 shrink-0 flex-wrap">
        {(alert.lines ?? [alert.line]).map((ln) => (
          <span key={ln} className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold leading-none ${getLineBadgeColor(ln)}`}>
            {ln}
          </span>
        ))}
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1 min-w-0">
        {alert.message}
      </p>
    </div>
  );
});

const FRESH_MAX_AGE = staleAfter('transit');

export function TransitStrip({ expanded = false, onExpand }: { expanded?: boolean; onExpand?: () => void }) {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useTransit(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  const alerts = data ?? [];
  const sorted = [...alerts].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
  );

  const limit = expanded ? EXPANDED_MAX : COLLAPSED_MAX;
  const visible = sorted.slice(0, limit);
  const hiddenCount = sorted.length - visible.length;

  if (isError) return <StripErrorFallback domain={t('panel.transit.title')} onRetry={refetch} />;

  if (isLoading) return <Skeleton lines={4} />;

  return (
    <>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2 text-center flex-1">{t('panel.transit.empty')}</p>
      ) : (
        <div>
          {visible.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
          {/* pb-0.5 -mb-0.5: a 24px target (WCAG 2.5.8) without moving the text
              or the footer; the extra 2px sits below, clear of the rows. */}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onExpand}
              className="w-full text-xs text-gray-500 dark:text-gray-400 text-center pt-1.5 pb-0.5 -mb-0.5 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              +{hiddenCount} {t('panel.transit.more')}
            </button>
          )}
        </div>
      )}
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
