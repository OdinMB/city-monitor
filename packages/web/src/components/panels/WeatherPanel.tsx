/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Panel } from '../layout/Panel.js';
import { Skeleton } from '../layout/Skeleton.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWeather } from '../../hooks/useWeather.js';
import { getWeatherInfo } from '../../lib/weather-codes.js';

export function WeatherPanel() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useWeather(cityId);

  if (isLoading) {
    return <Panel title="Weather"><Skeleton lines={6} /></Panel>;
  }

  const current = data?.current;
  const hourly = data?.hourly ?? [];
  const daily = data?.daily ?? [];
  const alerts = data?.alerts ?? [];

  if (!current) {
    return (
      <Panel title="Weather">
        <p className="text-sm text-gray-400 py-4 text-center">No weather data</p>
      </Panel>
    );
  }

  const weatherInfo = getWeatherInfo(current.weatherCode);

  return (
    <Panel title="Weather">
      {alerts.length > 0 && (
        <div className="mb-3 space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className="p-2 rounded text-sm bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
            >
              <span className="font-semibold">{alert.headline}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-4 mb-4">
        <div>
          <div className="text-4xl font-light text-gray-900 dark:text-gray-100">
            {Math.round(current.temp * 10) / 10}°
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Feels like {Math.round(current.feelsLike)}°
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl">{weatherInfo.icon}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{weatherInfo.label}</div>
        </div>
      </div>

      <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mb-4">
        <span>Humidity {current.humidity}%</span>
        <span>Wind {Math.round(current.windSpeed)} km/h</span>
        {current.precipitation > 0 && <span>Precip {current.precipitation} mm</span>}
      </div>

      {hourly.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Hourly</h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {hourly.filter((h) => h.time >= new Date().toISOString().slice(0, 16)).slice(0, 24).map((h) => {
              const hour = h.time.split('T')[1]?.slice(0, 5) ?? h.time;
              const info = getWeatherInfo(h.weatherCode);
              return (
                <div key={h.time} className="shrink-0 text-center text-xs">
                  <div className="text-gray-400">{hour}</div>
                  <div>{info.icon}</div>
                  <div className="text-gray-900 dark:text-gray-100 font-medium">{Math.round(h.temp)}°</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {daily.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Forecast</h3>
          <div className="space-y-1.5">
            {daily.map((d) => {
              const dayName = formatDayName(d.date);
              const info = getWeatherInfo(d.weatherCode);
              return (
                <div key={d.date} className="flex items-center gap-2 text-sm">
                  <span className="w-12 text-gray-500 dark:text-gray-400 text-xs">{dayName}</span>
                  <span>{info.icon}</span>
                  <span className="text-gray-900 dark:text-gray-100 font-medium">{Math.round(d.high)}°</span>
                  <span className="text-gray-400">{Math.round(d.low)}°</span>
                  {d.precip > 0 && (
                    <span className="text-xs text-blue-500 ml-auto">{d.precip} mm</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

function formatDayName(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00Z');
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    const diff = (date.getTime() - todayUtc) / 86400_000;
    if (diff >= 0 && diff < 1) return 'Today';
    if (diff >= 1 && diff < 2) return 'Tmrw';

    return date.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}
