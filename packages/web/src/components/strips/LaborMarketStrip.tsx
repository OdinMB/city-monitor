import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useLaborMarket } from '../../hooks/useLaborMarket.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatYoy } from '../../lib/format-stats.js';
import { formatCount, formatPercent } from '../../lib/format-value.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

const FRESH_MAX_AGE = staleAfter('laborMarket');

/** One rate: its label, the rate, the head count and the change on last year. */
function RateBlock({ label, rate, count, yoyPercent, accent }: {
  label: string;
  rate: number;
  count: number;
  yoyPercent: number;
  accent: string;
}) {
  const { t, i18n } = useTranslation();
  const yoy = formatYoy(yoyPercent);

  return (
    <div className="flex flex-col items-center">
      <span className="text-sm font-medium text-muted">
        {label}
      </span>
      <span className={`text-4xl font-extrabold tabular-nums leading-none ${accent} mt-1`}>
        {formatPercent(rate, 1)}
      </span>
      <div className="flex items-center gap-1.5 mt-1.5 text-xs">
        <span className="text-muted tabular-nums">
          {formatCount(count, i18n.language)}
        </span>
        <span className="text-gray-300 dark:text-gray-600">&middot;</span>
        <span className={`font-medium ${yoy.color}`}>
          {yoy.text} {t('panel.laborMarket.yoy')}
        </span>
      </div>
    </div>
  );
}

export function LaborMarketStrip() {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useLaborMarket(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain={t('panel.laborMarket.title')} onRetry={refetch} />;
  if (!data) return <p className="text-sm text-muted py-2 text-center">{t('panel.laborMarket.empty')}</p>;

  return (
    <>
      <div className="flex flex-col gap-4 py-1">
        <RateBlock
          label={t('panel.laborMarket.unemployment')}
          rate={data.unemploymentRate}
          count={data.totalUnemployed}
          yoyPercent={data.yoyChangePercent}
          accent="text-amber-600 dark:text-amber-400"
        />
        <RateBlock
          label={t('panel.laborMarket.underemployment')}
          rate={data.underemploymentRate}
          count={data.underemploymentCount}
          yoyPercent={data.underemploymentYoyPercent}
          accent="text-orange-600 dark:text-orange-400"
        />
        <RateBlock
          label={t('panel.laborMarket.sgbII')}
          rate={data.sgbIIRate}
          count={data.sgbIICount}
          yoyPercent={data.sgbIIYoyPercent}
          accent="text-red-600 dark:text-red-400"
        />
      </div>
      <TileFooter stale={isStale}>{data.reportMonth}{agoText && (' · ' + t('stale.updated', { time: agoText }))}</TileFooter>
    </>
  );
}
