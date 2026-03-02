/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTheme } from '../../hooks/useTheme.js';
import { useWeather } from '../../hooks/useWeather.js';
import { useAirQuality } from '../../hooks/useAirQuality.js';
import { getWeatherInfo } from '../../lib/weather-codes.js';
import { getAqiLevel } from '../../lib/aqi.js';
import { Popover } from './Popover.js';
import { WeatherPopover } from './WeatherPopover.js';
import { AqiTooltip } from './AqiTooltip.js';

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
  const { data: airQuality } = useAirQuality(city.id);
  const { t, i18n } = useTranslation();
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [aqiOpen, setAqiOpen] = useState(false);

  const current = weather?.current;
  const weatherInfo = current ? getWeatherInfo(current.weatherCode) : null;
  const aqiLevel = airQuality?.current
    ? getAqiLevel(airQuality.current.europeanAqi)
    : null;

  return (
    <header className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className="text-lg font-bold mr-1 hover:opacity-80"
          style={{ color: city.theme.accent }}
        >
          {city.name.toUpperCase()}
        </Link>
        {current && weatherInfo && (
          <Popover
            open={weatherOpen}
            onOpenChange={setWeatherOpen}
            hover
            renderTrigger={(ref, props) => (
              <button
                ref={ref as React.Ref<HTMLButtonElement>}
                {...props}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                aria-label={t('panel.weather.title')}
              >
                {weatherInfo.icon} {Math.round(current.temp)}°
              </button>
            )}
            className="max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
          >
            <WeatherPopover />
          </Popover>
        )}
        {airQuality?.current && aqiLevel && (
          <Popover
            open={aqiOpen}
            onOpenChange={setAqiOpen}
            hover
            renderTrigger={(ref, props) => (
              <button
                ref={ref as React.Ref<HTMLButtonElement>}
                {...props}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                aria-label={t('panel.airQuality.title')}
              >
                <span className="font-semibold" style={{ color: aqiLevel.color }}>
                  {Math.round(airQuality.current.europeanAqi)}
                </span>
                {' '}
                <span className="text-gray-500 dark:text-gray-400">
                  AQI · {t(`panel.airQuality.level.${aqiLevel.label}`)}
                </span>
              </button>
            )}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
          >
            <AqiTooltip />
          </Popover>
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
