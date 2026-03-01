/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CityConfig, WeatherData, CurrentWeather, HourlyForecast, DailyForecast, WeatherAlert } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';

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

export function createWeatherIngestion(cache: Cache) {
  return async function ingestWeather(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      try {
        await ingestCityWeather(city, cache);
      } catch (err) {
        console.error(`[ingest-weather] ${city.id} failed:`, err);
      }
    }
  };
}

async function ingestCityWeather(city: CityConfig, cache: Cache): Promise<void> {
  const { lat, lon } = city.dataSources.weather;

  const url = `https://api.open-meteo.com/v1/forecast`
    + `?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m`
    + `&hourly=temperature_2m,precipitation_probability,weather_code`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset`
    + `&timezone=${encodeURIComponent(city.timezone)}`
    + `&forecast_days=5`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) {
    console.warn(`[ingest-weather] ${city.id}: Open-Meteo returned ${response.status}`);
    return;
  }

  const raw: OpenMeteoResponse = await response.json();
  const data = transformWeatherData(raw);

  // Fetch DWD alerts for German cities
  if (city.country === 'DE') {
    try {
      const alerts = await fetchDwdAlerts(city);
      data.alerts = alerts;
    } catch (err) {
      console.warn(`[ingest-weather] ${city.id}: DWD alerts failed:`, err);
    }
  }

  cache.set(`${city.id}:weather`, data, 1800);
  console.log(`[ingest-weather] ${city.id}: weather updated`);
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
  const response = await fetch('https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json', {
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
