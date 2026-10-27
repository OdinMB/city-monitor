import type { CityConfig, WeatherData, WeatherAlert, DwdUvForecast, AirQuality } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveWeather } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { fetchBrightSkyForecast } from '../lib/brightsky.js';
import { DWD_WARNINGS_URL, parseDwdWarnings, parseDwdWarningsJsonp } from '../lib/dwd-warnings.js';

const log = createLogger('ingest-weather');

export type { WeatherData, AirQuality };

const WEATHER_TIMEOUT_MS = 15_000;

export function createWeatherIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestWeather(): Promise<void> {
    const cities = getActiveCities();
    const failures: string[] = [];
    for (const city of cities) {
      const provider = city.dataSources.weather.provider;
      if (provider !== 'brightsky') {
        log.warn(`${city.id}: no weather adapter for provider '${provider}' — see .context/weather.md to add one`);
        continue;
      }
      try {
        await ingestCityWeather(city, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
        failures.push(`${city.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`weather ingestion failed — ${failures.join('; ')}`);
    }
  };
}

async function ingestCityWeather(city: CityConfig, cache: Cache, db: Db | null): Promise<void> {
  const data = await fetchBrightSkyForecast(city);

  // DWD alerts and UV — German cities only. BrightSky doesn't expose UV;
  // alerts could move to BrightSky's /alerts endpoint as a follow-up.
  if (city.country === 'DE') {
    try {
      const alerts = await fetchDwdAlerts(city);
      data.alerts = alerts;
    } catch {
      log.warn(`${city.id}: DWD alerts failed`);
    }
    try {
      const dwdUv = await fetchDwdUv(city);
      if (dwdUv) data.dwdUv = dwdUv;
    } catch {
      log.warn(`${city.id}: DWD UV failed`);
    }
  }

  cache.set(CK.weather(city.id), data, 3600);

  if (db) {
    try {
      // Snapshot type 'open-meteo' is a historical opaque key — see plan
      // 2026-05-01_brightsky-migration.md. Renaming is out of scope.
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

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Open-Meteo air-quality ${response.status} for ${city.id}: ${body.slice(0, 200)}`);
  }

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

  cache.set(CK.airQuality(city.id), airQuality, 3600);
  log.info(`${city.id}: air quality updated (AQI: ${airQuality.current.europeanAqi})`);
}

async function fetchDwdAlerts(city: CityConfig): Promise<WeatherAlert[]> {
  const response = await log.fetch(DWD_WARNINGS_URL, {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return [];

  const text = await response.text();
  let alerts: WeatherAlert[] | null = null;
  try {
    alerts = parseDwdWarnings(parseDwdWarningsJsonp(text), city.name);
  } catch {
    // not JSON: reported below like any other unexpected shape
  }
  if (!alerts) {
    log.warn(`${city.id}: DWD warnings.json is not in the expected shape — run npm run check:weather`);
    return [];
  }
  return alerts;
}

const YMD = /^(\d{4}-\d{2}-\d{2})/;

function uvValue(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Picks one city's forecast out of DWD's uvi.json:
 * `{ forecast_day, last_update, content: [{ city, forecast: { today, tomorrow, dayafter_to } }] }`.
 * `forecastDay` comes from `forecast_day`, or else from the date of `last_update`.
 * Returns null when the city is missing or a value is not a non-negative number.
 */
export function parseDwdUv(json: unknown, cityName: string): DwdUvForecast | null {
  if (!json || typeof json !== 'object') return null;
  const { content, forecast_day, last_update } = json as Record<string, unknown>;
  if (!Array.isArray(content)) return null;

  const name = cityName.toLowerCase();
  const entry = (content as unknown[]).find((c) =>
    typeof c === 'object' && c !== null && String((c as { city?: unknown }).city ?? '').toLowerCase() === name,
  ) as { forecast?: unknown } | undefined;
  if (!entry || typeof entry.forecast !== 'object' || entry.forecast === null) return null;

  const forecast = entry.forecast as Record<string, unknown>;
  const today = uvValue(forecast.today);
  const tomorrow = uvValue(forecast.tomorrow);
  const dayAfter = uvValue(forecast.dayafter_to);
  if (today === null || tomorrow === null || dayAfter === null) return null;

  const day = [forecast_day, last_update]
    .map((v) => (typeof v === 'string' ? YMD.exec(v)?.[1] : undefined))
    .find((v) => v !== undefined);

  return day ? { today, tomorrow, dayAfter, forecastDay: day } : { today, tomorrow, dayAfter };
}

async function fetchDwdUv(city: CityConfig): Promise<DwdUvForecast | null> {
  const response = await log.fetch('https://opendata.dwd.de/climate_environment/health/alerts/uvi.json', {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return null;

  const forecast = parseDwdUv(await response.json(), city.name);
  if (!forecast) log.warn(`${city.id}: no usable UV forecast in DWD uvi.json`);
  return forecast;
}
