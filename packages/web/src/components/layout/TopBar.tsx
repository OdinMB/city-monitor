/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTheme } from '../../hooks/useTheme.js';
import { useWeather } from '../../hooks/useWeather.js';
import { getWeatherInfo } from '../../lib/weather-codes.js';

export function TopBar() {
  const city = useCityConfig();
  const { theme, toggle } = useTheme();
  const { data: weather } = useWeather(city.id);

  const current = weather?.current;
  const weatherInfo = current ? getWeatherInfo(current.weatherCode) : null;

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <h1
          className="text-lg font-bold"
          style={{ color: city.theme.accent }}
        >
          {city.name}
        </h1>
        {current && weatherInfo && (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {weatherInfo.icon} {Math.round(current.temp)}°
          </span>
        )}
        <span className="text-xs text-gray-400">City Monitor</span>
      </div>
      <button
        onClick={toggle}
        className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? 'Dark' : 'Light'}
      </button>
    </header>
  );
}
