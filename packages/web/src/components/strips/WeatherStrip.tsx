import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWeather } from '../../hooks/useWeather.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { getWeatherInfo } from '../../lib/weather-codes.js';
import { getUvLevel } from '../../lib/uv-levels.js';
import { formatDayName } from '../../lib/format-day-name.js';
import { cityDate, cityHour, forecastInstant, formatCityClock, upcomingHourly } from '../../lib/city-time.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { UvIndexToday } from '../UvIndexToday.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

/** Step size (hours) by the city's time of day: 0-6→4h, 6-12→3h, 12-18→2h, 18-24→1h */
function stepForHour(h: number): number {
  if (h < 6) return 4;
  if (h < 12) return 3;
  if (h < 18) return 2;
  return 1;
}

const MAX_HOURLY = 7;
const HOUR_MS = 3_600_000;

/** Pick 5-7 upcoming hourly entries using adaptive step sizes to cover rest of day. */
function sampleHourly<T extends { time: string }>(hourly: T[], now: Date, timeZone: string): T[] {
  const result: T[] = [];
  let nextAllowed = -Infinity;

  for (const entry of upcomingHourly(hourly, now)) {
    if (result.length >= MAX_HOURLY) break;
    const at = forecastInstant(entry.time);
    if (at < nextAllowed) continue;
    result.push(entry);
    nextAllowed = at + stepForHour(cityHour(at, timeZone)) * HOUR_MS;
  }

  return result;
}

const DAILY_COUNT = 7;

const FRESH_MAX_AGE = staleAfter('weather');

export function WeatherStrip({ expanded }: { expanded: boolean }) {
  const { id: cityId, timezone } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useWeather(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  const rawHourly = data?.hourly;
  const sampledHourly = useMemo(() => {
    if (!rawHourly || rawHourly.length === 0) return [];
    return sampleHourly(rawHourly, new Date(), timezone);
  }, [rawHourly, timezone]);

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain={t('panel.weather.title')} onRetry={refetch} />;

  const current = data?.current;
  if (!current) return null;

  const weatherInfo = getWeatherInfo(current.weatherCode);
  const locale = i18n.language;
  const daily = data?.daily ?? [];
  const alerts = data?.alerts ?? [];
  const today = cityDate(new Date(), timezone);

  return (
    <>
      <div className={expanded ? '' : 'flex-1 flex flex-col justify-center'}>
        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-3 space-y-1">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="p-2 rounded text-xs bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
              >
                <span className="font-semibold">{alert.headline}</span>
              </div>
            ))}
          </div>
        )}

        {/* Current conditions — 2×2 aligned grid */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
              {Math.round(current.temp)}°
            </div>
            <div className="text-xs text-muted mt-1">
              {t('panel.weather.feelsLike')} {Math.round(current.feelsLike)}°
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-3xl leading-tight">{weatherInfo.icon}</div>
            <div className="text-xs text-muted mt-1">{t(weatherInfo.labelKey)}</div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted mt-2">
          <span>{t('panel.weather.humidity')} {current.humidity}%</span>
          <span>{t('panel.weather.wind')} {Math.round(current.windSpeed)} km/h</span>
          {current.precipitation > 0 && <span>{current.precipitation} mm</span>}
          <UvIndexToday forecast={data?.dwdUv} />
        </div>
      </div>

      {/* Expanded: hourly + daily (no section labels, centered) */}
      {expanded && (
        <>
          {sampledHourly.length > 0 && (
            <div className="mt-4 flex justify-center overflow-x-auto">
              <div className="flex gap-3 shrink-0">
                {sampledHourly.map((h) => {
                  const hour = formatCityClock(forecastInstant(h.time), timezone);
                  const info = getWeatherInfo(h.weatherCode);
                  return (
                    <div key={h.time} className="shrink-0 text-center text-xs">
                      <div className="text-muted">{hour}</div>
                      <div className="text-xl my-0.5">{info.icon}</div>
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

          {daily.length > 0 && (
            <div className="mt-3 flex justify-center overflow-x-auto">
              <div className="flex gap-3 shrink-0">
                {daily.filter((d) => d.date !== today).slice(0, DAILY_COUNT).map((d) => {
                  const dayName = formatDayName(d.date, locale);
                  const info = getWeatherInfo(d.weatherCode);
                  return (
                    <div key={d.date} className="shrink-0 text-center text-xs">
                      <div className="text-muted mb-0.5">{dayName}</div>
                      <div className="text-2xl my-0.5">{info.icon}</div>
                      <div className="text-gray-900 dark:text-gray-100 font-medium">{Math.round(d.high)}°</div>
                      <div className="text-muted">{Math.round(d.low)}°</div>
                      {d.precip > 0 && (
                        <div className="text-blue-500 mt-0.5">{d.precip}mm</div>
                      )}
                      {d.uvIndexMax != null && d.uvIndexMax > 0 && (
                        <div className="mt-0.5" style={{ color: getUvLevel(d.uvIndexMax).color }}>
                          UV {Math.round(d.uvIndexMax)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}


        </>
      )}
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
