import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWeather } from '../../hooks/useWeather.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { getWeatherInfo } from '../../lib/weather-codes.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

function formatDayName(dateStr: string, locale: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const date = new Date(dateStr + 'T00:00:00Z');
  return Math.abs(date.getTime() - todayUtc) < 86400_000;
}

/** Step size (hours) by time-of-day bucket: 0-6→4h, 6-12→3h, 12-18→2h, 18-24→1h */
function stepForHour(h: number): number {
  if (h < 6) return 4;
  if (h < 12) return 3;
  if (h < 18) return 2;
  return 1;
}

const MAX_HOURLY = 7;

/** Pick 5-7 future hourly entries using adaptive step sizes to cover rest of day. */
function sampleHourly<T extends { time: string }>(hourly: T[], now: string): T[] {
  const future = hourly.filter((h) => h.time >= now);
  if (future.length === 0) return [];

  const result: T[] = [];
  let nextAllowedTime = '';

  for (const entry of future) {
    if (result.length >= MAX_HOURLY) break;
    if (nextAllowedTime && entry.time < nextAllowedTime) continue;
    result.push(entry);
    const hour = parseInt(entry.time.split('T')[1]?.slice(0, 2) ?? '0', 10);
    const d = new Date(entry.time + ':00Z');
    d.setUTCHours(d.getUTCHours() + stepForHour(hour));
    nextAllowedTime = d.toISOString().slice(0, 16);
  }

  return result;
}

const DAILY_COUNT = 7;

const FRESH_MAX_AGE = 45 * 60 * 1000; // 45 min (cron every 30 min)

export function WeatherStrip({ expanded }: { expanded: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useWeather(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain="Weather" onRetry={refetch} />;

  const current = data?.current;
  if (!current) return null;

  const weatherInfo = getWeatherInfo(current.weatherCode);
  const locale = i18n.language === 'de' ? 'de' : 'en';
  const hourly = data?.hourly ?? [];
  const daily = data?.daily ?? [];
  const alerts = data?.alerts ?? [];

  const nowStr = new Date().toISOString().slice(0, 16);
  const sampledHourly = sampleHourly(hourly, nowStr);

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
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('panel.weather.feelsLike')} {Math.round(current.feelsLike)}°
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-3xl leading-tight">{weatherInfo.icon}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{weatherInfo.label}</div>
          </div>
        </div>

        <div className="flex justify-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-2">
          <span>{t('panel.weather.humidity')} {current.humidity}%</span>
          <span>{t('panel.weather.wind')} {Math.round(current.windSpeed)} km/h</span>
          {current.precipitation > 0 && <span>{current.precipitation} mm</span>}
        </div>
      </div>

      {/* Expanded: hourly + daily (no section labels, centered) */}
      {expanded && (
        <>
          {sampledHourly.length > 0 && (
            <div className="mt-4 flex justify-center overflow-x-auto">
              <div className="flex gap-3 shrink-0">
                {sampledHourly.map((h) => {
                  const hour = h.time.split('T')[1]?.slice(0, 5) ?? h.time;
                  const info = getWeatherInfo(h.weatherCode);
                  return (
                    <div key={h.time} className="shrink-0 text-center text-xs">
                      <div className="text-gray-400">{hour}</div>
                      <div className="text-xl my-0.5">{info.icon}</div>
                      <div className="text-gray-900 dark:text-gray-100 font-medium">{Math.round(h.temp)}°</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {daily.length > 0 && (
            <div className="mt-3 flex justify-center overflow-x-auto">
              <div className="flex gap-3 shrink-0">
                {daily.filter((d) => !isToday(d.date)).slice(0, DAILY_COUNT).map((d) => {
                  const dayName = formatDayName(d.date, locale);
                  const info = getWeatherInfo(d.weatherCode);
                  return (
                    <div key={d.date} className="shrink-0 text-center text-xs">
                      <div className="text-gray-500 dark:text-gray-400 mb-0.5">{dayName}</div>
                      <div className="text-2xl my-0.5">{info.icon}</div>
                      <div className="text-gray-900 dark:text-gray-100 font-medium">{Math.round(d.high)}°</div>
                      <div className="text-gray-400">{Math.round(d.low)}°</div>
                      {d.precip > 0 && (
                        <div className="text-blue-500 mt-0.5">{d.precip}mm</div>
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
