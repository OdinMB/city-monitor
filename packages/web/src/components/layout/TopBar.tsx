/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useRef, useEffect } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const current = weather?.current;
  const weatherInfo = current ? getWeatherInfo(current.weatherCode) : null;
  const aqiLevel = airQuality?.current
    ? getAqiLevel(airQuality.current.europeanAqi)
    : null;

  // Close hamburger menu on outside click or Escape key
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="text-lg font-bold mr-1 shrink-0"
          style={{ color: city.theme.accent }}
        >
          {city.name.toUpperCase()}
        </span>
        {current && weatherInfo && (
          <Popover
            open={weatherOpen}
            onOpenChange={setWeatherOpen}
            hover
            renderTrigger={(ref, props) => (
              <button
                ref={ref as React.Ref<HTMLButtonElement>}
                {...props}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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

      {/* Desktop: inline language + theme */}
      <div className="hidden lg:flex items-stretch gap-2">
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
          className="px-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer flex items-center"
          aria-label={theme === 'light' ? t('topbar.theme.switchDark') : t('topbar.theme.switchLight')}
        >
          {theme === 'light' ? (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" /><path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" /><path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile: hamburger menu */}
      <div className="lg:hidden relative" ref={menuRef}>
        <button
          ref={menuButtonRef}
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-50 min-w-[140px]">
            <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden mb-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    setMenuOpen(false);
                  }}
                  className={`flex-1 px-2 py-1.5 text-xs ${
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
              onClick={() => {
                toggle();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-left cursor-pointer"
            >
              {theme === 'light' ? (
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              ) : (
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" /><path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" /><path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
                </svg>
              )}
              {theme === 'light' ? t('topbar.theme.dark') : t('topbar.theme.light')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
