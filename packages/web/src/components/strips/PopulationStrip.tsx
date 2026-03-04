import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { usePopulationSummary } from '../../hooks/usePopulationSummary.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

function formatChange(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toLocaleString()}`;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

const BAR_COLORS = {
  youth: '#3b82f6',      // blue
  workingAge: '#10b981',  // emerald
  elderly: '#f59e0b',     // amber
};

export function PopulationStrip() {
  const { id: cityId } = useCityConfig();
  const isBerlin = cityId === 'berlin';
  const { data, isLoading, isError, refetch } = usePopulationSummary(cityId);
  const { t } = useTranslation();

  if (!isBerlin) return null;
  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain="Population" onRetry={refetch} />;
  if (!data) return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.population.empty')}</p>;

  const changeColor = data.changeAbsolute >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex flex-col justify-center h-full">
      {/* Total + change */}
      <div className="text-center">
        <div className="text-3xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100">
          {data.total.toLocaleString()}
        </div>
        {data.changeAbsolute !== 0 && (
          <div className={`text-sm font-medium mt-0.5 ${changeColor}`}>
            {formatChange(data.changeAbsolute)} ({formatPct(data.changePct)}) {t('panel.population.change')}
          </div>
        )}
      </div>

      {/* Age breakdown stacked bar */}
      <div className="mt-6">
        <div className="flex h-5 rounded overflow-hidden">
          <div
            className="transition-all"
            style={{ width: `${data.youthPct}%`, backgroundColor: BAR_COLORS.youth }}
            title={`${t('panel.population.youth')}: ${data.youthPct.toFixed(1)}%`}
          />
          <div
            className="transition-all"
            style={{ width: `${data.workingAgePct}%`, backgroundColor: BAR_COLORS.workingAge }}
            title={`${t('panel.population.workingAge')}: ${data.workingAgePct.toFixed(1)}%`}
          />
          <div
            className="transition-all"
            style={{ width: `${data.elderlyPct}%`, backgroundColor: BAR_COLORS.elderly }}
            title={`${t('panel.population.elderly')}: ${data.elderlyPct.toFixed(1)}%`}
          />
        </div>
        <div className="flex justify-between mt-1 text-[11px]">
          <span style={{ color: BAR_COLORS.youth }}>{t('panel.population.youth')} {data.youthPct.toFixed(1)}%</span>
          <span style={{ color: BAR_COLORS.workingAge }}>{t('panel.population.workingAge')} {data.workingAgePct.toFixed(1)}%</span>
          <span style={{ color: BAR_COLORS.elderly }}>{t('panel.population.elderly')} {data.elderlyPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Density */}
      {data.density > 0 && (
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">{t('panel.population.densityLabel')}</span>
          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {data.density.toLocaleString()} {t('panel.population.density')}
          </span>
        </div>
      )}

      {/* Foreign population */}
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-sm text-gray-600 dark:text-gray-400">{t('panel.population.foreign')}</span>
        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {data.foreignPct.toFixed(1)}%
        </span>
      </div>

      {/* Source footnote */}
      <TileFooter>{t('panel.population.source')} · {data.snapshotDate}</TileFooter>
    </div>
  );
}
