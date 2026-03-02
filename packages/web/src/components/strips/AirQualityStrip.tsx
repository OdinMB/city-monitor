/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useAirQuality } from '../../hooks/useAirQuality.js';
import { getAqiLevel } from '../../lib/aqi.js';
import { Skeleton } from '../layout/Skeleton.js';

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 120;
  const h = 28;
  const step = w / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(' ');

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PollutantBar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gray-500 dark:bg-gray-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 text-right text-gray-600 dark:text-gray-400">
        {value.toFixed(1)} {unit}
      </span>
    </div>
  );
}

export function AirQualityStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useAirQuality(cityId);
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <section className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {t('panel.airQuality.title')}
        </h2>
        <Skeleton lines={3} />
      </section>
    );
  }

  if (!data) return null;

  const level = getAqiLevel(data.current.europeanAqi);
  const hourlyAqi = data.hourly.slice(0, 24).map((h) => h.europeanAqi);

  return (
    <section className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
        {t('panel.airQuality.title')}
      </h2>

      <div className="flex items-start gap-4">
        {/* AQI badge */}
        <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${level.bg}`}>
          <span
            className="text-2xl font-bold"
            style={{ color: level.color }}
          >
            {Math.round(data.current.europeanAqi)}
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {t(`panel.airQuality.level.${level.label}`)}
          </span>
        </div>

        {/* Pollutant breakdown + sparkline */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <PollutantBar label="PM2.5" value={data.current.pm25} max={75} unit="\u00b5g/m\u00b3" />
          <PollutantBar label="PM10" value={data.current.pm10} max={150} unit="\u00b5g/m\u00b3" />
          <PollutantBar label={`NO\u2082`} value={data.current.no2} max={200} unit="\u00b5g/m\u00b3" />
          <PollutantBar label={`O\u2083`} value={data.current.o3} max={180} unit="\u00b5g/m\u00b3" />
        </div>

        {/* 24h sparkline */}
        <div className="hidden sm:flex flex-col items-center gap-0.5">
          <Sparkline data={hourlyAqi} color={level.color} />
          <span className="text-[10px] text-gray-400">{t('panel.airQuality.trend')}</span>
        </div>
      </div>
    </section>
  );
}
