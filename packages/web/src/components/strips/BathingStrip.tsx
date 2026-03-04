import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useBathing } from '../../hooks/useBathing.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { BathingSpot } from '../../lib/api.js';

const QUALITY_COLORS: Record<string, string> = {
  good: '#22c55e',
  warning: '#f59e0b',
  poor: '#ef4444',
};

const SLOTS = 7;

/** Returns true when any loaded bathing spot has inSeason === false. */
export function useBathingOffSeason(cityId: string): boolean {
  const { data } = useBathing(cityId);
  return data != null && data.length > 0 && !data[0].inSeason;
}

const SpotRow = memo(function SpotRow({ spot, t }: { spot: BathingSpot; t: (k: string) => string }) {
  const color = QUALITY_COLORS[spot.quality] ?? QUALITY_COLORS.good;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Quality dot */}
      <div className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />

      {/* Name + water body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
            {spot.name}
          </span>
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
          {spot.waterBody}
          {spot.waterTemp != null && <span className="ml-1.5">{spot.waterTemp}°C</span>}
        </div>
      </div>

      {/* Quality badge */}
      <div
        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-white leading-tight"
        style={{ backgroundColor: color }}
      >
        {t(`panel.bathing.quality.${spot.quality}`)}
      </div>
    </div>
  );
});

const FRESH_MAX_AGE = 36 * 60 * 60 * 1000; // 36h (cron daily)

export function BathingStrip({ expanded = true }: { expanded?: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useBathing(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  // Must be above early returns to satisfy Rules of Hooks
  const { goodDisplay, warnDisplay, goodCount, warnCount, poorCount, latestMeasuredAt, offSeason } = useMemo(() => {
    if (!data || data.length === 0) return { goodDisplay: [], warnDisplay: [], goodCount: 0, warnCount: 0, poorCount: 0, latestMeasuredAt: null as string | null, offSeason: false };
    // Separate by quality
    const flagged = data.filter((s) => s.quality === 'warning' || s.quality === 'poor');
    const good = data
      .filter((s) => s.quality === 'good')
      .sort((a, b) => (b.waterTemp ?? -Infinity) - (a.waterTemp ?? -Infinity));

    // Fill slots: warnings first, then good to fill remaining
    const goodSlots = Math.max(0, SLOTS - flagged.length);
    const selected = [...flagged, ...good.slice(0, goodSlots)];

    // Find most recent measurement date across all spots
    const latestDate = data.reduce<string | null>((max, s) =>
      s.measuredAt && (!max || s.measuredAt > max) ? s.measuredAt : max, null);

    return {
      // Display order: good first, then warnings
      goodDisplay: selected.filter((s) => s.quality === 'good'),
      warnDisplay: selected.filter((s) => s.quality !== 'good'),
      goodCount: data.filter((s) => s.quality === 'good').length,
      warnCount: data.filter((s) => s.quality === 'warning').length,
      poorCount: data.filter((s) => s.quality === 'poor').length,
      latestMeasuredAt: latestDate,
      offSeason: !data[0].inSeason,
    };
  }, [data]);

  if (isLoading) {
    return <Skeleton lines={3} />;
  }
  if (isError) return <StripErrorFallback domain="Bathing" onRetry={refetch} />;

  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.bathing.empty')}</p>;
  }

  return (
    <div className="space-y-3">
      {offSeason && (
        <p className="text-xs text-gray-600 dark:text-gray-300 text-center">
          {t('panel.bathing.nextSeason')}
        </p>
      )}
      <div className={offSeason ? 'opacity-40 grayscale space-y-3' : 'space-y-3'}>
      {/* Summary */}
      <div className="flex justify-center gap-3 text-xs font-medium">
        <span style={{ color: QUALITY_COLORS.good }}>{goodCount} {t('panel.bathing.quality.good')}</span>
        {warnCount > 0 && <span style={{ color: QUALITY_COLORS.warning }}>{warnCount} {t('panel.bathing.quality.warning')}</span>}
        {poorCount > 0 && <span style={{ color: QUALITY_COLORS.poor }}>{poorCount} {t('panel.bathing.quality.poor')}</span>}
      </div>

      {/* Warnings */}
      {warnDisplay.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
            {t('panel.bathing.warnings')}
          </div>
          <div className="space-y-2">
            {warnDisplay.map((spot) => <SpotRow key={spot.id} spot={spot} t={t} />)}
          </div>
        </div>
      )}

      {/* Good spots — only when expanded */}
      {expanded && goodDisplay.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
            {t('panel.bathing.best')}
          </div>
          <div className="space-y-2">
            {goodDisplay.map((spot) => <SpotRow key={spot.id} spot={spot} t={t} />)}
          </div>
        </div>
      )}
      <TileFooter stale={isStale}>
        {latestMeasuredAt && t('panel.bathing.measuredAt', { date: new Date(latestMeasuredAt + 'T00:00:00Z').toLocaleDateString(undefined, { timeZone: 'UTC' }) })}
        {latestMeasuredAt && agoText && ' · '}
        {agoText && t('stale.updated', { time: agoText })}
      </TileFooter>
      </div>
    </div>
  );
}
