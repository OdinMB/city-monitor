import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useFeuerwehr } from '../../hooks/useFeuerwehr.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatDelta, formatTime } from '../../lib/format-stats.js';
import { formatCount } from '../../lib/format-value.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

function StatRow({
  label,
  current,
  partial,
  accent,
  delta,
}: {
  label: string;
  current: string;
  partial: string | null;
  accent: string;
  delta: { text: string; color: string } | null;
}) {
  // Where the label and the figures don't fit on one line (a long label, a
  // narrow tile), the figures wrap below it to the row's end instead of
  // running past the tile's edge, which cut the change off.
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <div className="flex items-baseline gap-3 ms-auto">
        {partial && (
          <span className="text-lg tabular-nums text-muted">{partial}</span>
        )}
        <span className={`text-3xl font-extrabold tabular-nums leading-none ${accent}`}>
          {current}
        </span>
        {delta && (
          <span className={`text-xs font-medium tabular-nums w-12 text-end ${delta.color}`}>
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}


const FRESH_MAX_AGE = staleAfter('feuerwehr');

export function FeuerwehrStrip({ expanded }: { expanded: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useFeuerwehr(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain={t('panel.feuerwehr.title')} onRetry={refetch} />;
  if (!data) return <p className="text-sm text-muted py-2 text-center">{t('panel.feuerwehr.empty')}</p>;

  const { current, partial, previous } = data;

  // Each stat: the last complete month, the running month when there is one, and the change on the month before.
  const stats = [
    {
      current: formatCount(current.missionCountAll, i18n.language),
      partial: partial ? formatCount(partial.missionCountAll, i18n.language) : null,
      label: t('panel.feuerwehr.missions'),
      delta: formatDelta(current.missionCountAll, previous?.missionCountAll),
      accent: 'text-red-600 dark:text-red-400',
      size: 'text-4xl',
    },
    {
      current: formatTime(current.responseTimeEmsCriticalMedian),
      partial: partial ? formatTime(partial.responseTimeEmsCriticalMedian) : null,
      label: t('panel.feuerwehr.emsResponseTime'),
      delta: formatDelta(current.responseTimeEmsCriticalMedian, previous?.responseTimeEmsCriticalMedian),
      accent: 'text-blue-600 dark:text-blue-400',
      size: 'text-3xl',
    },
    {
      current: formatTime(current.responseTimeFirePumpMedian),
      partial: partial ? formatTime(partial.responseTimeFirePumpMedian) : null,
      label: t('panel.feuerwehr.fireResponseTime'),
      delta: formatDelta(current.responseTimeFirePumpMedian, previous?.responseTimeFirePumpMedian),
      accent: 'text-orange-600 dark:text-orange-400',
      size: 'text-3xl',
    },
  ];

  if (!expanded) {
    // Collapsed: compact rows for 3 stats
    return (
      <>
        <div className="flex flex-col gap-3 py-1">
          {stats.map((stat) => (
            <StatRow
              key={stat.label}
              label={stat.label}
              current={stat.current}
              partial={stat.partial}
              accent={stat.accent}
              delta={stat.delta}
            />
          ))}
          <div className="text-center text-xs text-muted">
            {current.reportMonth}
          </div>
        </div>
        {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
      </>
    );
  }

  // Expanded: row-based layout — left has number + label + delta, right has just the number
  return (
    <>
      <div className="flex flex-col gap-4 py-1">
        {/* Column headers */}
        <div className="flex">
          <div className="flex-1 text-center text-xs font-medium text-muted">
            {current.reportMonth}
          </div>
          {partial && (
            <>
              <div className="w-6" />
              <div className="flex-1 flex flex-col items-center">
                <span className="text-xs font-medium text-muted">{partial.reportMonth}</span>
                <span className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium badge-caution">
                  {t('panel.feuerwehr.partial')}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Stat rows — items-start keeps numbers aligned at top */}
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-start">
            <div className="flex-1 text-center">
              <div className={`${stat.size} font-extrabold tabular-nums leading-none ${stat.accent}`}>
                {stat.current}
              </div>
              <div className="text-xs text-muted mt-1">{stat.label}</div>
              {stat.delta && (
                <div className={`text-xs font-medium tabular-nums ${stat.delta.color}`}>{stat.delta.text}</div>
              )}
            </div>
            {stat.partial !== null && (
              <>
                <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch mx-3" />
                <div className="flex-1 text-center">
                  <div className={`${stat.size} font-extrabold tabular-nums leading-none ${stat.accent}`}>
                    {stat.partial}
                  </div>
                  <div className="text-xs text-muted mt-1">{stat.label}</div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
