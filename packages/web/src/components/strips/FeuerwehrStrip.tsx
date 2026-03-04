import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useFeuerwehr } from '../../hooks/useFeuerwehr.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDelta(current: number, previous: number | undefined, invert = false): { text: string; color: string } | null {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? '+' : '';
  const value = Math.abs(pct) < 10 ? pct.toFixed(1) : Math.round(pct).toString();
  const isWorse = invert ? pct < 0 : pct > 0;
  const color = isWorse
    ? 'text-red-500 dark:text-red-400'
    : pct === 0
      ? 'text-gray-400'
      : 'text-green-500 dark:text-green-400';
  return { text: `${sign}${value}%`, color };
}

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
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <div className="flex items-baseline gap-3">
        {partial && (
          <span className="text-lg tabular-nums text-gray-400 dark:text-gray-500">{partial}</span>
        )}
        <span className={`text-3xl font-extrabold tabular-nums leading-none ${accent}`}>
          {current}
        </span>
        {delta && (
          <span className={`text-xs font-medium tabular-nums w-12 text-right ${delta.color}`}>
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}


export function FeuerwehrStrip({ expanded }: { expanded: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, isLoading, isError, refetch } = useFeuerwehr(cityId);
  const { t } = useTranslation();

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain="Feuerwehr" onRetry={refetch} />;
  if (!data) return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.feuerwehr.empty')}</p>;

  const { current, partial, previous } = data;

  if (!expanded) {
    // Collapsed: compact rows for 3 stats
    return (
      <div className="flex flex-col gap-3 py-1">
        <StatRow
          label={t('panel.feuerwehr.missions')}
          current={current.missionCountAll.toLocaleString('de-DE')}
          partial={partial ? partial.missionCountAll.toLocaleString('de-DE') : null}
          accent="text-red-600 dark:text-red-400"
          delta={formatDelta(current.missionCountAll, previous?.missionCountAll)}
        />
        <StatRow
          label={t('panel.feuerwehr.emsResponseTime')}
          current={formatTime(current.responseTimeEmsCriticalMedian)}
          partial={partial ? formatTime(partial.responseTimeEmsCriticalMedian) : null}
          accent="text-blue-600 dark:text-blue-400"
          delta={formatDelta(current.responseTimeEmsCriticalMedian, previous?.responseTimeEmsCriticalMedian)}
        />
        <StatRow
          label={t('panel.feuerwehr.fireResponseTime')}
          current={formatTime(current.responseTimeFirePumpMedian)}
          partial={partial ? formatTime(partial.responseTimeFirePumpMedian) : null}
          accent="text-orange-600 dark:text-orange-400"
          delta={formatDelta(current.responseTimeFirePumpMedian, previous?.responseTimeFirePumpMedian)}
        />
        <div className="text-center text-xs text-gray-400 dark:text-gray-500">
          {current.reportMonth}
        </div>
      </div>
    );
  }

  // Expanded: row-based layout — left has number + label + delta, right has just the number
  const stats = [
    {
      left: current.missionCountAll.toLocaleString('de-DE'),
      right: partial?.missionCountAll.toLocaleString('de-DE'),
      label: t('panel.feuerwehr.missions'),
      delta: formatDelta(current.missionCountAll, previous?.missionCountAll),
      accent: 'text-red-600 dark:text-red-400',
      size: 'text-4xl',
    },
    {
      left: formatTime(current.responseTimeEmsCriticalMedian),
      right: partial ? formatTime(partial.responseTimeEmsCriticalMedian) : undefined,
      label: t('panel.feuerwehr.emsResponseTime'),
      delta: formatDelta(current.responseTimeEmsCriticalMedian, previous?.responseTimeEmsCriticalMedian),
      accent: 'text-blue-600 dark:text-blue-400',
      size: 'text-3xl',
    },
    {
      left: formatTime(current.responseTimeFirePumpMedian),
      right: partial ? formatTime(partial.responseTimeFirePumpMedian) : undefined,
      label: t('panel.feuerwehr.fireResponseTime'),
      delta: formatDelta(current.responseTimeFirePumpMedian, previous?.responseTimeFirePumpMedian),
      accent: 'text-orange-600 dark:text-orange-400',
      size: 'text-3xl',
    },
  ];

  return (
    <div className="flex flex-col gap-4 py-1">
      {/* Column headers */}
      <div className="flex">
        <div className="flex-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
          {current.reportMonth}
        </div>
        {partial && (
          <>
            <div className="w-6" />
            <div className="flex-1 flex flex-col items-center">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{partial.reportMonth}</span>
              <span className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
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
              {stat.left}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.label}</div>
            {stat.delta && (
              <div className={`text-xs font-medium tabular-nums ${stat.delta.color}`}>{stat.delta.text}</div>
            )}
          </div>
          {stat.right !== undefined && (
            <>
              <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch mx-3" />
              <div className="flex-1 text-center">
                <div className={`${stat.size} font-extrabold tabular-nums leading-none ${stat.accent}`}>
                  {stat.right}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.label}</div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
