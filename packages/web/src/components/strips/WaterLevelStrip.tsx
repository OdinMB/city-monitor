import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWaterLevels } from '../../hooks/useWaterLevels.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatDecimal, withUnit } from '../../lib/format-value.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { WaterLevelStation } from '../../lib/api.js';

/** Each gauge state's signal colour (globals.css): the level figure's text and the state badge's fill. */
const STATE_COLORS: Record<string, { text: string; fill: string }> = {
  low: { text: 'text-signal-info', fill: 'bg-signal-info' },
  normal: { text: 'text-signal-good', fill: 'bg-signal-good' },
  high: { text: 'text-signal-caution', fill: 'bg-signal-caution' },
  very_high: { text: 'text-signal-bad', fill: 'bg-signal-bad' },
  unknown: { text: 'text-signal-unknown', fill: 'bg-signal-unknown' },
};

const StationRow = memo(function StationRow({ station, t }: { station: WaterLevelStation; t: (k: string) => string }) {
  const color = STATE_COLORS[station.state] ?? STATE_COLORS.unknown;
  const stateKey = station.state === 'very_high' ? 'veryHigh' : (station.state ?? 'unknown');

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Left: river + station */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {station.waterBody}
        </div>
        <div className="text-[11px] text-muted truncate">
          {station.name}
          {station.tidal && (
            <span className="ms-1.5 px-1 py-0.5 rounded text-[9px] font-medium badge-info">
              {t('panel.waterLevels.tidal')}
            </span>
          )}
        </div>
      </div>

      {/* Right: current level + state badge */}
      <div className="shrink-0 flex items-center gap-1.5">
        <span className={`text-sm font-semibold tabular-nums ${color.text}`}>
          {withUnit(formatDecimal(station.currentLevel), 'cm')}
        </span>
        <span className={`px-1 py-0.5 rounded text-[9px] font-medium text-white leading-tight ${color.fill}`}>
          {t(`panel.waterLevels.state.${stateKey}`)}
        </span>
      </div>
    </div>
  );
});

const FRESH_MAX_AGE = staleAfter('waterLevels');

export function WaterLevelStrip() {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useWaterLevels(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (isLoading) {
    return <Skeleton lines={3} />;
  }
  if (isError) return <StripErrorFallback domain={t('panel.waterLevels.title')} onRetry={refetch} />;

  if (!data || data.stations.length === 0) {
    return <p className="text-sm text-muted py-2 text-center">{t('panel.waterLevels.empty')}</p>;
  }

  return (
    <>
      <div className="space-y-2 flex-1">
        {data.stations.map((station) => (
          <StationRow key={station.uuid} station={station} t={t} />
        ))}
      </div>
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
