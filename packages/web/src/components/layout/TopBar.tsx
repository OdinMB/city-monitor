/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTheme } from '../../hooks/useTheme.js';
import { useWeather } from '../../hooks/useWeather.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { getWeatherInfo } from '../../lib/weather-codes.js';
import { WeatherPopover } from './WeatherPopover.js';

const LANGUAGES = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
  { code: 'tr', label: 'TR' },
  { code: 'ar', label: 'AR' },
] as const;

export function TopBar() {
  const city = useCityConfig();
  const { theme, toggle } = useTheme();
  const { data: weather } = useWeather(city.id);
  const { t, i18n } = useTranslation();
  const weatherExpanded = useCommandCenter((s) => s.weatherExpanded);
  const setWeatherExpanded = useCommandCenter((s) => s.setWeatherExpanded);

  const current = weather?.current;
  const weatherInfo = current ? getWeatherInfo(current.weatherCode) : null;

  return (
    <header className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="text-sm font-bold hover:opacity-80"
          style={{ color: city.theme.accent }}
        >
          {city.name}
        </Link>
        {current && weatherInfo && (
          <div className="relative">
            <button
              onClick={() => setWeatherExpanded(!weatherExpanded)}
              className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
              aria-label={t('panel.weather.title')}
            >
              {weatherInfo.icon} {Math.round(current.temp)}°
            </button>
            <WeatherPopover />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => i18n.changeLanguage(lang.code)}
              className={`px-2 py-1 text-xs ${
                i18n.language === lang.code
                  ? 'bg-gray-200 dark:bg-gray-700 font-semibold'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              aria-label={`${t('topbar.language')}: ${lang.label}`}
            >
              {lang.label}
            </button>
          ))}
        </div>
        <button
          onClick={toggle}
          className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? t('topbar.theme.dark') : t('topbar.theme.light')}
        </button>
      </div>
    </header>
  );
}
