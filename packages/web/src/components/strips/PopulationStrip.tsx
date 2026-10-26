import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { usePopulationSummary } from '../../hooks/usePopulationSummary.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatCount, formatPercent, formatSignedCount, formatSignedPercent, withUnit } from '../../lib/format-value.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

const SEGMENT_COLORS = {
  youth: '#3b82f6',      // blue
  workingAge: '#10b981',  // emerald
  elderly: '#f59e0b',     // amber
};

/* ── Donut chart (SVG) ─────────────────────────────────── */

interface DonutSlice {
  startAngle: number;
  endAngle: number;
  color: string;
  label: string;
  pct: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function AgeDonut({ slices }: { slices: DonutSlice[] }) {
  const { t } = useTranslation();
  const cx = 60, cy = 60, r = 52, innerR = 30;
  const labelR = (r + innerR) / 2;

  return (
    <svg role="img" aria-label={t('panel.population.ageBreakdown')} viewBox="0 0 120 120" className="w-full max-w-[140px] mx-auto">
      {slices.map((slice, i) => {
        const sweep = slice.endAngle - slice.startAngle;
        const large = sweep > Math.PI ? 1 : 0;
        const [x1, y1] = polarToCartesian(cx, cy, r, slice.startAngle);
        const [x2, y2] = polarToCartesian(cx, cy, r, slice.endAngle);
        const [ix1, iy1] = polarToCartesian(cx, cy, innerR, slice.startAngle);
        const [ix2, iy2] = polarToCartesian(cx, cy, innerR, slice.endAngle);
        const d = [
          `M${x1},${y1}`,
          `A${r},${r},0,${large},1,${x2},${y2}`,
          `L${ix2},${iy2}`,
          `A${innerR},${innerR},0,${large},0,${ix1},${iy1}`,
          'Z',
        ].join(' ');
        const midAngle = slice.startAngle + sweep / 2;
        const [lx, ly] = polarToCartesian(cx, cy, labelR, midAngle);
        return (
          <g key={i}>
            <path d={d} fill={slice.color} opacity={0.85}>
              <title>{slice.label}: {formatPercent(slice.pct, 1)}</title>
            </path>
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              fill="#fff" style={{ fontSize: 7, fontWeight: 700 }} pointerEvents="none">
              {formatPercent(slice.pct, 1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const FRESH_MAX_AGE = staleAfter('population');

export function PopulationStrip() {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = usePopulationSummary(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  const ageSlices = useMemo(() => {
    if (!data) return [];
    const segments = [
      { key: 'youth' as const, pct: data.youthPct },
      { key: 'workingAge' as const, pct: data.workingAgePct },
      { key: 'elderly' as const, pct: data.elderlyPct },
    ];
    const result: DonutSlice[] = [];
    let angle = -Math.PI / 2;
    for (const seg of segments) {
      const sweep = (seg.pct / 100) * Math.PI * 2;
      result.push({
        startAngle: angle,
        endAngle: angle + sweep,
        color: SEGMENT_COLORS[seg.key],
        label: t(`panel.population.${seg.key}`),
        pct: seg.pct,
      });
      angle += sweep;
    }
    return result;
  }, [data, t]);

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain={t('panel.population.title')} onRetry={refetch} />;
  if (!data) return <p className="text-sm text-gray-500 dark:text-gray-400 py-2 text-center">{t('panel.population.empty')}</p>;

  const changeColor = data.changeAbsolute >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex flex-col justify-center h-full">
      {/* Total + change */}
      <div className="text-center">
        <div className="text-3xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100">
          {formatCount(data.total, i18n.language)}
        </div>
        {data.changeAbsolute !== 0 && (
          <div className={`text-sm font-medium mt-0.5 ${changeColor}`}>
            {formatSignedCount(data.changeAbsolute, i18n.language, { plusOnZero: true })} ({formatSignedPercent(data.changePct, 1, { plusOnZero: true })}) {t('panel.population.change')}
          </div>
        )}
      </div>

      {/* Age breakdown donut */}
      <div className="mt-4">
        <AgeDonut slices={ageSlices} />
        <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-0.5 mt-1">
          {(['youth', 'workingAge', 'elderly'] as const).map((key) => (
            <span key={key} className="inline-flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-400">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SEGMENT_COLORS[key] }} />
              {t(`panel.population.${key}`)}
            </span>
          ))}
        </div>
      </div>

      {/* Density */}
      {data.density > 0 && (
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">{t('panel.population.densityLabel')}</span>
          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {withUnit(formatCount(data.density, i18n.language), t('panel.population.density'))}
          </span>
        </div>
      )}

      {/* Foreign population */}
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-sm text-gray-600 dark:text-gray-400">{t('panel.population.foreign')}</span>
        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {formatPercent(data.foreignPct, 1)}
        </span>
      </div>

      {/* Source footnote */}
      <TileFooter stale={isStale}>{data.snapshotDate}{agoText && (' · ' + t('stale.updated', { time: agoText }))}</TileFooter>
    </div>
  );
}
