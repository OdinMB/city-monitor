import type { CityConfig, WeatherData, WeatherAlert, DwdUvForecast, AirQuality } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveWeather } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { fetchBrightSkyForecast } from '../lib/brightsky.js';

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

interface DwdUviResponse {
  content: Array<{
    city: string;
    forecast: { today: number; tomorrow: number; dayafter_to: number };
  }>;
}

async function fetchDwdUv(city: CityConfig): Promise<DwdUvForecast | null> {
  const response = await log.fetch('https://opendata.dwd.de/climate_environment/health/alerts/uvi.json', {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return null;

  const data: DwdUviResponse = await response.json();
  const entry = data.content?.find(
    (c) => c.city.toLowerCase() === city.name.toLowerCase(),
  );
  if (!entry) return null;

  return {
    today: entry.forecast.today,
    tomorrow: entry.forecast.tomorrow,
    dayAfter: entry.forecast.dayafter_to,
  };
}
