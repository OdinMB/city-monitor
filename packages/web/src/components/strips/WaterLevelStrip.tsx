import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWaterLevels } from '../../hooks/useWaterLevels.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { WaterLevelStation } from '../../lib/api.js';

const STATE_COLORS: Record<string, string> = {
  low: '#60a5fa',
  normal: '#22c55e',
  high: '#f59e0b',
  very_high: '#ef4444',
  unknown: '#9ca3af',
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
        <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
          {station.name}
          {station.tidal && (
            <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              {t('panel.waterLevels.tidal')}
            </span>
          )}
        </div>
      </div>

      {/* Right: current level + state badge */}
      <div className="shrink-0 flex items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {station.currentLevel} cm
        </span>
        <span
          className="px-1 py-0.5 rounded text-[9px] font-medium text-white leading-tight"
          style={{ backgroundColor: color }}
        >
          {t(`panel.waterLevels.state.${stateKey}`)}
        </span>
      </div>
    </div>
  );
});

export function WaterLevelStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading, isError, refetch } = useWaterLevels(cityId);
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton lines={3} />;
  }
  if (isError) return <StripErrorFallback domain="Water Levels" onRetry={refetch} />;

  if (!data || data.stations.length === 0) {
    return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.waterLevels.empty')}</p>;
  }

  return (
    <div className="space-y-2">
      {data.stations.map((station) => (
        <StationRow key={station.uuid} station={station} t={t} />
      ))}
    </div>
  );
}
