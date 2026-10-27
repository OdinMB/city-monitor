import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWeather } from '../../hooks/useWeather.js';
import { getWeatherInfo } from '../../lib/weather-codes.js';
import { getUvLevel } from '../../lib/uv-levels.js';
import { formatDayName } from '../../lib/format-day-name.js';
import { forecastInstant, formatCityClock, upcomingHourly } from '../../lib/city-time.js';
import { Skeleton } from './Skeleton.js';
import { UvIndexToday } from '../UvIndexToday.js';
import { WeatherWarningList } from '../WeatherWarnings.js';

export function WeatherPopover() {
  const { id: cityId, timezone } = useCityConfig();
  const { data, isLoading } = useWeather(cityId);
  const { t, i18n } = useTranslation();

  if (isLoading) {
    return <div className="p-4 w-72"><Skeleton lines={6} /></div>;
  }

  const current = data?.current;
  const hourly = data?.hourly ?? [];
  const daily = data?.daily ?? [];
  const alerts = data?.alerts ?? [];

  if (!current) {
    return <div className="p-4 text-sm text-gray-400 text-center">{t('panel.weather.empty')}</div>;
  }

  const weatherInfo = getWeatherInfo(current.weatherCode);
  const locale = i18n.language;

  const futureHourly = upcomingHourly(hourly, new Date()).slice(0, 12);

  return (
    <div className="p-4 w-[min(calc(100vw-2rem),36rem)]">
      <WeatherWarningList alerts={alerts} className="mb-3 text-sm" />

      {/* Current conditions */}
      <div className="flex items-start gap-4 mb-4">
        <div>
          <div className="text-4xl font-light text-gray-900 dark:text-gray-100">
            {Math.round(current.temp * 10) / 10}°
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('panel.weather.feelsLike')} {Math.round(current.feelsLike)}°
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl">{weatherInfo.icon}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t(weatherInfo.labelKey)}</div>
        </div>
      </div>

      <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mb-4 flex-wrap">
        <span>{t('panel.weather.humidity')} {current.humidity}%</span>
        <span>{t('panel.weather.wind')} {Math.round(current.windSpeed)} km/h</span>
        {current.precipitation > 0 && <span>{t('panel.weather.precip')} {current.precipitation} mm</span>}
        <UvIndexToday forecast={data?.dwdUv} />
      </div>

      {/* Hourly — horizontal scroll */}
      {futureHourly.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            {t('panel.weather.hourly')}
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {futureHourly.map((h) => {
              const hour = formatCityClock(forecastInstant(h.time), timezone);
              const info = getWeatherInfo(h.weatherCode);
              return (
                <div key={h.time} className="shrink-0 text-center text-xs">
                  <div className="text-gray-400">{hour}</div>
                  <div>{info.icon}</div>
                  <div className="text-gray-900 dark:text-gray-100 font-medium">{Math.round(h.temp)}°</div>
                  {h.uvIndex != null && h.uvIndex > 0 && (
                    <div className="mt-0.5" style={{ color: getUvLevel(h.uvIndex).color }}>
                      {Math.round(h.uvIndex)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily — horizontal on desktop, vertical list on mobile */}
      {daily.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            {t('panel.weather.daily')}
          </h3>

          {/* Desktop: horizontal columns */}
          <div className="hidden sm:flex gap-3 overflow-x-auto pb-1">
            {daily.map((d) => {
              const dayName = formatDayName(d.date, locale, t('panel.weather.today'), t('panel.weather.tomorrow'), timezone);
              const info = getWeatherInfo(d.weatherCode);
              return (
                <div key={d.date} className="shrink-0 text-center text-xs min-w-[3rem]">
                  <div className="text-gray-500 dark:text-gray-400 mb-0.5">{dayName}</div>
                  <div>{info.icon}</div>
                  <div className="text-gray-900 dark:text-gray-100 font-medium">{Math.round(d.high)}°</div>
                  <div className="text-gray-400">{Math.round(d.low)}°</div>
                  {d.precip > 0 && (
                    <div className="text-blue-500 mt-0.5">{d.precip}mm</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile: vertical list */}
          <div className="sm:hidden space-y-1.5">
            {daily.map((d) => {
              const dayName = formatDayName(d.date, locale, t('panel.weather.today'), t('panel.weather.tomorrow'), timezone);
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
    </div>
  );
}
