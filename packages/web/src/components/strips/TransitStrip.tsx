import { memo, useId, useState } from 'react';
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

/** Each pair reaches 4.5:1 for the badge's 12px bold text, in both themes. */
function getLineBadgeColor(line: string): string {
  if (line.startsWith('U')) return 'bg-blue-600 text-white';
  if (line.startsWith('S')) return 'bg-green-700 text-white';
  if (line.startsWith('M') || line.toLowerCase().includes('tram')) return 'bg-red-600 text-white';
  return 'bg-yellow-600 text-gray-900';
}

function getSeverityDot(severity: TransitAlert['severity']): string {
  if (severity === 'high') return 'bg-red-500';
  if (severity === 'medium') return 'bg-amber-500';
  return 'bg-gray-400';
}

/**
 * One disruption. Collapsed, the summary is clamped to a single line; the row
 * is a button that expands in place to the full summary, the full remark text
 * (when it differs from the summary) and the station the remark was reported at.
 */
const AlertRow = memo(function AlertRow({ alert }: { alert: TransitAlert }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const detail = alert.detail?.trim();
  const showDetail = !!detail && detail !== alert.message.trim();

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        className="w-full flex items-start gap-2 py-1.5 text-start cursor-pointer appearance-none bg-transparent rounded-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span aria-hidden="true" className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${getSeverityDot(alert.severity)}`} />
        <span className="flex items-center gap-1 shrink-0 flex-wrap">
          {(alert.lines ?? [alert.line]).map((ln) => (
            <span key={ln} className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold leading-none ${getLineBadgeColor(ln)}`}>
              {ln}
            </span>
          ))}
        </span>
        <span className={`flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 ${open ? 'wrap-anywhere' : 'line-clamp-1'}`}>
          {alert.message}
        </span>
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mt-1 shrink-0 text-gray-400 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div id={detailId} className="ps-4 pb-2 space-y-1 text-xs text-gray-600 dark:text-gray-400 wrap-anywhere">
          {showDetail && <p className="whitespace-pre-line">{detail}</p>}
          {alert.station && (
            <p>
              <span className="font-medium">{t('panel.transit.station')}:</span> <bdi>{alert.station}</bdi>
            </p>
          )}
        </div>
      )}
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
