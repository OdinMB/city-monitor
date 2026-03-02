/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useAirQuality } from '../../hooks/useAirQuality.js';
import { getAqiLevel } from '../../lib/aqi.js';

export function AqiTooltip() {
  const { id: cityId } = useCityConfig();
  const { data } = useAirQuality(cityId);
  const { t } = useTranslation();

  if (!data) return null;

  const level = getAqiLevel(data.current.europeanAqi);

  return (
    <div className="p-3 w-56">
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex flex-col items-center px-2 py-1 rounded ${level.bg}`}>
          <span className="text-lg font-bold" style={{ color: level.color }}>
            {Math.round(data.current.europeanAqi)}
          </span>
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t(`panel.airQuality.level.${level.label}`)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            European AQI
          </div>
        </div>
      </div>

      <div className="space-y-1 text-xs">
        <PollutantRow label="PM2.5" value={data.current.pm25} unit="µg/m³" />
        <PollutantRow label="PM10" value={data.current.pm10} unit="µg/m³" />
        <PollutantRow label={`NO\u2082`} value={data.current.no2} unit="µg/m³" />
        <PollutantRow label={`O\u2083`} value={data.current.o3} unit="µg/m³" />
      </div>
    </div>
  );
}

function PollutantRow({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex justify-between text-gray-600 dark:text-gray-400">
      <span>{label}</span>
      <span>{value.toFixed(1)} {unit}</span>
    </div>
  );
}
