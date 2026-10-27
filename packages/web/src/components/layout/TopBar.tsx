import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWeather } from '../../hooks/useWeather.js';
import { useAirQuality } from '../../hooks/useAirQuality.js';
import { useWarningsInForce } from '../../hooks/useWarningsInForce.js';
import { getWeatherInfo } from '../../lib/weather-codes.js';
import { getAqiLevel } from '../../lib/aqi.js';
import { formatDegrees } from '../../lib/format-value.js';
import { highestWarningLevel } from '../../lib/weather-warnings.js';
import { WarningLevelBadge } from '../WeatherWarnings.js';
import { Popover } from './Popover.js';
import { WeatherPopover } from './WeatherPopover.js';
import { AqiTooltip } from './AqiTooltip.js';
import { HeaderControls } from './HeaderControls.js';

export function TopBar() {
  const city = useCityConfig();
  const { data: weather } = useWeather(city.id);
  const { data: airQuality } = useAirQuality(city.id);
  const { t } = useTranslation();
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [aqiOpen, setAqiOpen] = useState(false);

  const current = weather?.current;
  const weatherInfo = current ? getWeatherInfo(current.weatherCode) : null;
  const aqiLevel = airQuality?.current
    ? getAqiLevel(airQuality.current.europeanAqi)
    : null;
  const temp = current ? Math.round(current.temp) : null;
  const warning = highestWarningLevel(useWarningsInForce(weather?.alerts ?? []));
  const weatherName = `${t('panel.weather.title')}: ${temp}°${warning ? `, ${t(`panel.weather.warning.level.${warning}`)}` : ''}`;
  const aqi = airQuality?.current ? Math.round(airQuality.current.europeanAqi) : null;
  const aqiLevelText = aqiLevel ? t(`panel.airQuality.level.${aqiLevel.label}`) : '';
  const aqiName = t('panel.airQuality.aqi');

  return (
    <header className="relative flex items-center justify-between px-4 py-1.5 border-b border-border bg-surface-1">
      {/* Centered city name — desktop only */}
      <span
        className="hidden md:block absolute left-1/2 -translate-x-1/2 text-lg font-bold pointer-events-none"
        style={{ color: 'var(--accent)' }}
      >
        {city.name.toUpperCase()}
      </span>

      <div className="flex items-center gap-2 min-w-0">
        <span
          className="md:hidden text-lg font-bold me-1 shrink-0"
          style={{ color: 'var(--accent)' }}
        >
          {city.name.toUpperCase()}
        </span>
        {current && weatherInfo && (
          <Popover
            open={weatherOpen}
            onOpenChange={setWeatherOpen}
            hover
            label={t('panel.weather.title')}
            renderTrigger={(ref, props) => (
              <button
                ref={ref as React.Ref<HTMLButtonElement>}
                {...props}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                aria-label={weatherName}
              >
                {weatherInfo.icon} {formatDegrees(temp!)}
                {warning && (
                  <WarningLevelBadge level={warning} className="ms-1.5 px-1 py-px">
                    {t(`panel.weather.warning.short.${warning}`)}
                  </WarningLevelBadge>
                )}
              </button>
            )}
            className="max-h-[80vh] overflow-y-auto bg-surface-1 border border-border rounded-lg shadow-lg"
          >
            <WeatherPopover />
          </Popover>
        )}
        {airQuality?.current && aqiLevel && (
          <Popover
            open={aqiOpen}
            onOpenChange={setAqiOpen}
            hover
            label={t('panel.airQuality.title')}
            renderTrigger={(ref, props) => (
              <button
                ref={ref as React.Ref<HTMLButtonElement>}
                {...props}
                // On a narrow phone this chip gives way: min-w-0 lets it shrink and its words end in "…",
                // while its number, the weather chip and its warning badge stay whole and nothing runs
                // under the menu button.
                className="inline-flex items-center gap-1 min-w-0 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap"
                aria-label={`${t('panel.airQuality.title')}: ${aqi} ${aqiName}, ${aqiLevelText}`}
              >
                <span className="shrink-0 font-semibold" style={{ color: aqiLevel.color }}>
                  {aqi}
                </span>
                <span className="min-w-0 truncate text-muted">
                  {aqiName} · {aqiLevelText}
                </span>
              </button>
            )}
            className="bg-surface-1 border border-border rounded-lg shadow-lg"
          >
            <AqiTooltip />
          </Popover>
        )}
      </div>

      <HeaderControls />
    </header>
  );
}
