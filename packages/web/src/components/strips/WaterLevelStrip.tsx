/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWaterLevels } from '../../hooks/useWaterLevels.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { WaterLevelStation } from '../../lib/api.js';

const STATE_COLORS: Record<string, string> = {
  low: '#60a5fa',
  normal: '#22c55e',
  high: '#f59e0b',
  very_high: '#ef4444',
  unknown: '#9ca3af',
};

function getCharValue(station: WaterLevelStation, shortname: string): number | undefined {
  return station.characteristicValues?.find((c) => c.shortname === shortname)?.value;
}

function GaugeBar({ station, t }: { station: WaterLevelStation; t: (k: string) => string }) {
  const mw = getCharValue(station, 'MW');
  const mnw = getCharValue(station, 'MNW') ?? getCharValue(station, 'MTnw');
  const mhw = getCharValue(station, 'MHW') ?? getCharValue(station, 'MThw');
  const color = STATE_COLORS[station.state] ?? STATE_COLORS.unknown;
  const stateKey = station.state === 'very_high' ? 'veryHigh' : (station.state ?? 'unknown');

  // Gauge: show current level as a percentage within the MNW–MHW range
  let pct = 50; // default to midpoint if no characteristic values
  if (mnw != null && mhw != null && mhw > mnw) {
    pct = Math.max(0, Math.min(100, ((station.currentLevel - mnw) / (mhw - mnw)) * 100));
  }

  return (
    <div className="flex items-start gap-3 min-w-0">
      {/* Station info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {station.name}
          </span>
          {station.tidal && (
            <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              {t('panel.waterLevels.tidal')}
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
          {station.waterBody}
          {mw != null && <span className="ml-1.5">{t('panel.waterLevels.meanWater')} {mw} cm</span>}
        </div>

        {/* Gauge bar */}
        <div className="relative">
          <div className="h-2 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          {mnw != null && mhw != null && (
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] text-gray-400">{mnw}</span>
              <span className="text-[9px] text-gray-400">{mhw}</span>
            </div>
          )}
        </div>
      </div>

      {/* Current level + state badge */}
      <div className="shrink-0 text-right">
        <div className="text-lg font-bold tabular-nums leading-none" style={{ color }}>
          {station.currentLevel}
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400">cm</div>
        <div
          className="mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white leading-tight"
          style={{ backgroundColor: color }}
        >
          {t(`panel.waterLevels.state.${stateKey}`)}
        </div>
      </div>
    </div>
  );
}

export function WaterLevelStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useWaterLevels(cityId);
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton lines={3} />;
  }

  if (!data || data.stations.length === 0) {
    return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.waterLevels.allNormal')}</p>;
  }

  const elevated = data.stations.filter((s) => s.state === 'high' || s.state === 'very_high');
  const allNormal = elevated.length === 0;

  return (
    <div className="space-y-3">
      {/* Summary badge */}
      {allNormal ? (
        <p className="text-sm text-green-600 dark:text-green-400 text-center font-medium">
          {t('panel.waterLevels.allNormal')}
        </p>
      ) : (
        <p className="text-sm text-amber-600 dark:text-amber-400 text-center font-medium">
          {t('panel.waterLevels.stationsHigh', { count: elevated.length })}
        </p>
      )}

      {/* Station gauges */}
      {data.stations.map((station) => (
        <GaugeBar key={station.uuid} station={station} t={t} />
      ))}
    </div>
  );
}
