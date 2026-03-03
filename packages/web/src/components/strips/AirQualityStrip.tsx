/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useAirQuality } from '../../hooks/useAirQuality.js';
import { useAirQualityGrid } from '../../hooks/useAirQualityGrid.js';
import { getAqiLevel } from '../../lib/aqi.js';
import { Skeleton } from '../layout/Skeleton.js';

/* ── AQI scale segments ───────────────────────────────────── */

const SCALE_SEGMENTS = [
  { max: 20, color: '#50C878', key: 'good' },
  { max: 40, color: '#FFD700', key: 'fair' },
  { max: 60, color: '#FF8C00', key: 'moderate' },
  { max: 80, color: '#FF4444', key: 'poor' },
  { max: 100, color: '#8B008B', key: 'veryPoor' },
] as const;

const SCALE_MAX = 100;

function AqiScale({ aqi, t }: { aqi: number; t: (k: string) => string }) {
  const pct = Math.min(Math.max(aqi / SCALE_MAX, 0), 1) * 100;

  return (
    <div className="space-y-1">
      <div className="relative">
        <div className="flex h-2 rounded-full overflow-hidden">
          {SCALE_SEGMENTS.map((s) => (
            <div key={s.key} className="flex-1" style={{ backgroundColor: s.color }} />
          ))}
        </div>
        {/* Marker */}
        <div
          className="absolute -top-0.5 w-0 h-0"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        >
          <div
            className="w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 shadow"
            style={{ backgroundColor: getAqiLevel(aqi).color }}
          />
        </div>
      </div>
      {/* Labels */}
      <div className="flex">
        {SCALE_SEGMENTS.map((s) => (
          <span key={s.key} className="flex-1 text-center text-[9px] text-gray-400 dark:text-gray-500">
            {t(`panel.airQuality.level.${s.key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Pollutant mini-card ──────────────────────────────────── */

interface PollutantCardProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

const PollutantCard = memo(function PollutantCard({ label, value, max, color }: PollutantCardProps) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1 mb-0.5">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{label}</span>
        <span className="text-[11px] tabular-nums text-gray-700 dark:text-gray-200 font-semibold">
          {value.toFixed(1)}
          <span className="font-normal text-gray-400 dark:text-gray-500 ml-0.5">&#xb5;g/m&#xb3;</span>
        </span>
      </div>
      <div className="h-1 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
        />
      </div>
    </div>
  );
});

/* ── Station row ──────────────────────────────────────────── */

const StationEntry = memo(function StationEntry({ name, aqi }: { name: string; aqi: number }) {
  const level = getAqiLevel(aqi);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: level.color }} />
      <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate">{name}</span>
      <span className="text-[11px] tabular-nums font-semibold text-gray-700 dark:text-gray-200 ml-auto shrink-0">
        {aqi}
      </span>
    </div>
  );
});

/* ── Main component ───────────────────────────────────────── */

export function AirQualityStrip({ expanded }: { expanded: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useAirQuality(cityId);
  const { data: gridData } = useAirQualityGrid(cityId);
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton lines={2} />;
  }

  if (!data) return null;

  const level = getAqiLevel(data.current.europeanAqi);
  const aqiValue = Math.round(data.current.europeanAqi);

  // Filter to WAQI stations (have aqicn.org URL), sort by name for stable order, take 8
  const stations = useMemo(
    () => (gridData ?? [])
      .filter((s) => s.url?.includes('aqicn.org'))
      .sort((a, b) => a.station.localeCompare(b.station))
      .slice(0, 8),
    [gridData],
  );

  return (
    <>
      <div className={expanded ? '' : 'flex-1 flex flex-col justify-center'}>
        {/* Centered AQI number + level */}
        <div className="flex flex-col items-center gap-2 mb-3">
          <span className="text-3xl font-bold leading-none" style={{ color: level.color }}>
            {aqiValue}
          </span>
          <span className="text-sm font-semibold" style={{ color: level.color }}>
            {t(`panel.airQuality.level.${level.label}`)} (AQI)
          </span>
        </div>

        {/* Scale bar */}
        <AqiScale aqi={aqiValue} t={t} />
      </div>

      {/* Expanded: trend → pollutants → stations */}
      {expanded && (
        <>
          {/* Pollutant grid */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            <PollutantCard label="PM2.5" value={data.current.pm25} max={75} color={level.color} />
            <PollutantCard label="NO&#x2082;" value={data.current.no2} max={200} color={level.color} />
            <PollutantCard label="PM10" value={data.current.pm10} max={150} color={level.color} />
            <PollutantCard label="O&#x2083;" value={data.current.o3} max={180} color={level.color} />
          </div>

          {/* Station measurements */}
          {stations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {stations.map((s) => (
                  <StationEntry
                    key={s.url ?? s.station}
                    name={s.station.replace(/, Berlin, Germany$/, '').replace(/, Germany$/, '')}
                    aqi={s.europeanAqi}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
