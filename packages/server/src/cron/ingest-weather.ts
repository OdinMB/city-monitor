import type { CityConfig, WeatherData, CurrentWeather, HourlyForecast, DailyForecast, WeatherAlert } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveWeather } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-weather');

export type { WeatherData };

const WEATHER_TIMEOUT_MS = 10_000;

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    sunrise: string[];
    sunset: string[];
  };
}

export function createWeatherIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestWeather(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      try {
        await ingestCityWeather(city, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityWeather(city: CityConfig, cache: Cache, db: Db | null): Promise<void> {
  const { lat, lon } = city.dataSources.weather;

  const url = `https://api.open-meteo.com/v1/forecast`
    + `?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m`
    + `&hourly=temperature_2m,precipitation_probability,weather_code`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset`
    + `&timezone=${encodeURIComponent(city.timezone)}`
    + `&forecast_days=7`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return;

  const raw: OpenMeteoResponse = await response.json();
  const data = transformWeatherData(raw);

  // Fetch DWD alerts for German cities
  if (city.country === 'DE') {
    try {
      const alerts = await fetchDwdAlerts(city);
      data.alerts = alerts;
    } catch {
      log.warn(`${city.id}: DWD alerts failed`);
    }
  }

  cache.set(CK.weather(city.id), data, 1800);

  if (db) {
    try {
      await saveWeather(db, city.id, data);
    } catch (err) {
      log.error(`${city.id} DB write failed`, err);
    }
  }

  log.info(`${city.id}: weather updated`);

  // Fetch air quality alongside weather
  try {
    await ingestCityAirQuality(city, cache);
  } catch {
    log.warn(`${city.id}: air quality failed`);
  }
}

export interface AirQuality {
  current: {
    europeanAqi: number;
    pm25: number;
    pm10: number;
    no2: number;
    o3: number;
    updatedAt: string;
  };
  hourly: Array<{
    time: string;
    europeanAqi: number;
    pm25: number;
    pm10: number;
  }>;
}

interface AirQualityResponse {
  current: {
    european_aqi: number;
    pm10: number;
    pm2_5: number;
    nitrogen_dioxide: number;
    ozone: number;
  };
  hourly: {
    time: string[];
    european_aqi: number[];
    pm2_5: number[];
    pm10: number[];
  };
}

export async function ingestCityAirQuality(city: CityConfig, cache: Cache): Promise<void> {
  const { lat, lon } = city.dataSources.weather;

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality`
    + `?latitude=${lat}&longitude=${lon}`
    + `&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone`
    + `&hourly=european_aqi,pm2_5,pm10`
    + `&timezone=${encodeURIComponent(city.timezone)}`
    + `&forecast_days=2`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return;

  const raw: AirQualityResponse = await response.json();

  const airQuality: AirQuality = {
    current: {
      europeanAqi: raw.current.european_aqi ?? 0,
      pm25: raw.current.pm2_5 ?? 0,
      pm10: raw.current.pm10 ?? 0,
      no2: raw.current.nitrogen_dioxide ?? 0,
      o3: raw.current.ozone ?? 0,
      updatedAt: new Date().toISOString(),
    },
    hourly: (raw.hourly.time ?? []).map((time, i) => ({
      time,
      europeanAqi: raw.hourly.european_aqi?.[i] ?? 0,
      pm25: raw.hourly.pm2_5?.[i] ?? 0,
      pm10: raw.hourly.pm10?.[i] ?? 0,
    })),
  };

  cache.set(CK.airQuality(city.id), airQuality, 1800);
  log.info(`${city.id}: air quality updated (AQI: ${airQuality.current.europeanAqi})`);
}

function transformWeatherData(raw: OpenMeteoResponse): WeatherData {
  const current: CurrentWeather = {
    temp: raw.current.temperature_2m,
    feelsLike: raw.current.apparent_temperature,
    humidity: raw.current.relative_humidity_2m,
    precipitation: raw.current.precipitation,
    weatherCode: raw.current.weather_code,
    windSpeed: raw.current.wind_speed_10m,
    windDirection: raw.current.wind_direction_10m,
  };

  const hourly: HourlyForecast[] = raw.hourly.time.map((time, i) => ({
    time,
    temp: raw.hourly.temperature_2m[i],
    precipProb: raw.hourly.precipitation_probability[i],
    weatherCode: raw.hourly.weather_code[i],
  }));

  const daily: DailyForecast[] = raw.daily.time.map((date, i) => ({
    date,
    high: raw.daily.temperature_2m_max[i],
    low: raw.daily.temperature_2m_min[i],
    weatherCode: raw.daily.weather_code[i],
    precip: raw.daily.precipitation_sum[i],
    sunrise: raw.daily.sunrise[i],
    sunset: raw.daily.sunset[i],
  }));

  return { current, hourly, daily, alerts: [] };
}

async function fetchDwdAlerts(city: CityConfig): Promise<WeatherAlert[]> {
  const response = await log.fetch('https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json', {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return [];

  // DWD wraps JSON in a JSONP callback: warnWetter.loadWarnings(...)
  const text = await response.text();
  const jsonStr = text.replace(/^warnWetter\.loadWarnings\(/, '').replace(/\);?\s*$/, '');

  let parsed: Record<string, Array<{
    headline: string;
    description: string;
    severity: number;
    end: number;
    regionName: string;
  }>>;

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  const alerts: WeatherAlert[] = [];

  // DWD warnings are keyed by region code
  for (const warnings of Object.values(parsed)) {
    if (!Array.isArray(warnings)) continue;
    for (const w of warnings) {
      // Skip minor advisories (severity 1) — only surface meaningful warnings
      if (w.severity < 2) continue;
      // DWD doesn't provide lat/lon per warning, so we filter by region name containing city name
      if (!w.regionName?.toLowerCase().includes(city.name.toLowerCase())) continue;

      alerts.push({
        headline: w.headline,
        severity: w.severity >= 3 ? 'extreme' : w.severity >= 2 ? 'severe' : 'moderate',
        description: w.description,
        validUntil: new Date(w.end).toISOString(),
      });
    }
  }

  return alerts;
}
