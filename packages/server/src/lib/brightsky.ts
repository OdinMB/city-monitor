/**
 * BrightSky adapter — wraps DWD's MOSMIX forecast + observation network.
 * Used as the weather forecast source for German cities.
 *
 * Endpoints:
 *   /current_weather?lat=&lon=          → current observation
 *   /weather?lat=&lon=&date=&last_date= → hourly observations + forecast for a date range
 *
 * BrightSky has no per-IP rate limit and requires no API key. See
 * https://brightsky.dev — replaces api.open-meteo.com to avoid 429s caused
 * by Render's shared egress IP exhausting Open-Meteo's 10k/day per-IP quota.
 */

import SunCalc from 'suncalc';
import type {
  CityConfig,
  WeatherData,
  CurrentWeather,
  HourlyForecast,
  DailyForecast,
} from '@city-monitor/shared';
import { createLogger } from './logger.js';

const log = createLogger('brightsky');

const BRIGHTSKY_BASE = 'https://api.brightsky.dev';
const TIMEOUT_MS = 15_000;

// --- Public types ---

export interface BrightSkyHourly {
  timestamp: string;
  temperature: number;
  precipitation: number;
  precipitation_probability: number | null;
  icon: string;
}

interface BrightSkyCurrent {
  weather: {
    timestamp: string;
    temperature: number;
    relative_humidity: number;
    wind_speed_10: number;
    wind_direction_10: number | null;
    precipitation_60: number;
    icon: string;
    condition: string;
  };
}

interface BrightSkyForecastEnvelope {
  weather: BrightSkyHourly[];
}

// --- WMO mapping ---

// Maps BrightSky's icon enum to a representative WMO weather code present in
// packages/web/src/lib/weather-codes.ts. Throws on unknown icons so an upstream
// enum change surfaces loudly in tests rather than silently emitting code 0.
const ICON_TO_WMO: Record<string, number> = {
  'clear-day': 0,
  'clear-night': 0,
  'partly-cloudy-day': 2,
  'partly-cloudy-night': 2,
  cloudy: 3,
  fog: 45,
  wind: 3, // BrightSky's `wind` flags high wind, often with overcast/front conditions
  rain: 63,
  snow: 73,
  sleet: 67,
  hail: 96,
  thunderstorm: 95,
};

export function iconToWmoCode(icon: string): number {
  const code = ICON_TO_WMO[icon];
  if (code === undefined) {
    throw new Error(`unknown BrightSky icon: ${icon}`);
  }
  return code;
}

// --- Apparent temperature (Steadman formula, BoM Australia variant) ---
// AT = T + 0.33 * e − 0.7 * v − 4.0
// where e = humidity-adjusted vapor pressure, v = wind speed in m/s.
export function apparentTemp(tempC: number, humidityPct: number, windKmh: number): number {
  const e = (humidityPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  const windMs = windKmh / 3.6;
  return tempC + 0.33 * e - 0.7 * windMs - 4.0;
}

// --- Daily rollup ---

interface IntlDateParts {
  year: string;
  month: string;
  day: string;
  hour?: string;
}

function localDateParts(timestampUtc: string, timezone: string): IntlDateParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(timestampUtc));
  const out: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  // V8's en-CA reports `hour: '00'` with the next day's date at midnight (verified).
  return out as unknown as IntlDateParts;
}

function localDate(timestampUtc: string, timezone: string): string {
  const p = localDateParts(timestampUtc, timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

function localHour(timestampUtc: string, timezone: string): number {
  const p = localDateParts(timestampUtc, timezone);
  return Number(p.hour);
}

export function rollUpDaily(
  hourly: BrightSkyHourly[],
  lat: number,
  lon: number,
  timezone: string,
): DailyForecast[] {
  const buckets = new Map<string, BrightSkyHourly[]>();
  for (const h of hourly) {
    const date = localDate(h.timestamp, timezone);
    const arr = buckets.get(date);
    if (arr) arr.push(h);
    else buckets.set(date, [h]);
  }

  const out: DailyForecast[] = [];
  const sortedEntries = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [date, entries] of sortedEntries) {
    const temps = entries.map((e) => e.temperature);
    const precip = entries.reduce((sum, e) => sum + (e.precipitation ?? 0), 0);

    // Pick the entry whose local hour is closest to 12:00 — represents the day's "feel".
    const repr = entries.reduce((best, e) => {
      const bestDist = Math.abs(localHour(best.timestamp, timezone) - 12);
      const eDist = Math.abs(localHour(e.timestamp, timezone) - 12);
      return eDist < bestDist ? e : best;
    });

    const noonUtcForDate = new Date(`${date}T12:00:00Z`);
    const sun = SunCalc.getTimes(noonUtcForDate, lat, lon);

    out.push({
      date,
      high: Math.max(...temps),
      low: Math.min(...temps),
      weatherCode: iconToWmoCode(repr.icon),
      precip: Math.round(precip * 10) / 10,
      sunrise: sun.sunrise.toISOString(),
      sunset: sun.sunset.toISOString(),
    });
  }
  return out;
}

// --- HTTP + transforms ---

async function getJson<T>(url: string, label: string, cityId: string): Promise<T> {
  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`BrightSky ${label} ${response.status} for ${cityId}: ${body.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

function transformCurrent(raw: BrightSkyCurrent['weather']): CurrentWeather {
  return {
    temp: raw.temperature,
    feelsLike: apparentTemp(raw.temperature, raw.relative_humidity, raw.wind_speed_10),
    humidity: raw.relative_humidity,
    precipitation: raw.precipitation_60 ?? 0,
    weatherCode: iconToWmoCode(raw.icon),
    windSpeed: raw.wind_speed_10,
    windDirection: raw.wind_direction_10 ?? 0,
  };
}

function transformHourly(raw: BrightSkyHourly[]): HourlyForecast[] {
  return raw.map((h) => ({
    // Frontend (WeatherStrip, WeatherPopover) compares time strings and does
    // `entry.time + ':00Z'` to build a Date. Use the same offset-less
    // YYYY-MM-DDTHH:MM shape Open-Meteo produced so existing code keeps working.
    time: new Date(h.timestamp).toISOString().slice(0, 16),
    temp: h.temperature,
    precipProb: h.precipitation_probability ?? 0,
    weatherCode: iconToWmoCode(h.icon),
  }));
}

export async function fetchBrightSkyForecast(city: CityConfig): Promise<WeatherData> {
  const { lat, lon } = city.dataSources.weather;

  // BrightSky's /weather wants a date range. Request today through today+6 in
  // the city's local timezone — matches Open-Meteo's previous forecast_days=7.
  const todayLocal = localDate(new Date().toISOString(), city.timezone);
  const [y, m, d] = todayLocal.split('-').map(Number);
  const lastLocal = new Date(Date.UTC(y!, m! - 1, d! + 6)).toISOString().slice(0, 10);

  const currentUrl = `${BRIGHTSKY_BASE}/current_weather?lat=${lat}&lon=${lon}`;
  const forecastUrl = `${BRIGHTSKY_BASE}/weather?lat=${lat}&lon=${lon}&date=${todayLocal}&last_date=${lastLocal}`;

  const [currentRaw, forecastRaw] = await Promise.all([
    getJson<BrightSkyCurrent>(currentUrl, 'current_weather', city.id),
    getJson<BrightSkyForecastEnvelope>(forecastUrl, 'weather', city.id),
  ]);

  return {
    current: transformCurrent(currentRaw.weather),
    hourly: transformHourly(forecastRaw.weather),
    daily: rollUpDaily(forecastRaw.weather, lat, lon, city.timezone),
    alerts: [], // populated by the existing DWD-direct fetchDwdAlerts call in ingest-weather.ts
  };
}
