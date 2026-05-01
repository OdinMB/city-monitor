/**
 * CLI script that probes all live weather data sources end-to-end.
 *
 * Use this when production weather is silently stale and you need to
 * find out which upstream is failing. Hits the real internet — not
 * picked up by `vitest` / `turbo run test` (filename does not match
 * `*.test.ts`).
 *
 * Usage:
 *   npm run check:weather                # checks Berlin
 *   npm run check:weather -- --city hamburg
 *
 * Exits 0 if every source returns 200 + the expected shape, 1 otherwise.
 */

import type { CityConfig } from '@city-monitor/shared';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';

const CITIES: Record<string, CityConfig> = { berlin, hamburg };

const TIMEOUT_MS = 15_000;

interface CheckResult {
  name: string;
  ok: boolean;
  status: number | null;
  ms: number;
  detail: string;
}

async function runCheck(name: string, fn: () => Promise<{ status: number; detail: string }>): Promise<CheckResult> {
  const start = performance.now();
  try {
    const { status, detail } = await fn();
    return { name, ok: status >= 200 && status < 300, status, ms: Math.round(performance.now() - start), detail };
  } catch (err) {
    return {
      name,
      ok: false,
      status: null,
      ms: Math.round(performance.now() - start),
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0 (check:weather)' },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
  }
  return { status: response.status, body: await response.json() };
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0 (check:weather)' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return { status: response.status, body: await response.text() };
}

function checkOpenMeteoForecast(city: CityConfig) {
  return runCheck('Open-Meteo forecast', async () => {
    const { lat, lon } = city.dataSources.weather;
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,uv_index,uv_index_clear_sky`
      + `&hourly=temperature_2m,precipitation_probability,weather_code,uv_index`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,uv_index_max,uv_index_clear_sky_max`
      + `&timezone=${encodeURIComponent(city.timezone)}`
      + `&forecast_days=7`;
    const { status, body } = await fetchJson(url);
    const data = body as { current?: { temperature_2m?: number }; hourly?: { time?: unknown[] }; daily?: { time?: unknown[] } };
    if (typeof data.current?.temperature_2m !== 'number') throw new Error('missing current.temperature_2m');
    if (!Array.isArray(data.hourly?.time)) throw new Error('missing hourly.time array');
    if (!Array.isArray(data.daily?.time)) throw new Error('missing daily.time array');
    return {
      status,
      detail: `temp=${data.current.temperature_2m}°C, hourly=${data.hourly!.time!.length}, daily=${data.daily!.time!.length}`,
    };
  });
}

function checkOpenMeteoAirQuality(city: CityConfig) {
  return runCheck('Open-Meteo air-quality', async () => {
    const { lat, lon } = city.dataSources.weather;
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality`
      + `?latitude=${lat}&longitude=${lon}`
      + `&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone`
      + `&hourly=european_aqi,pm2_5,pm10`
      + `&timezone=${encodeURIComponent(city.timezone)}`
      + `&forecast_days=2`;
    const { status, body } = await fetchJson(url);
    const data = body as { current?: { european_aqi?: number }; hourly?: { time?: unknown[] } };
    if (typeof data.current?.european_aqi !== 'number') throw new Error('missing current.european_aqi');
    if (!Array.isArray(data.hourly?.time)) throw new Error('missing hourly.time array');
    return { status, detail: `aqi=${data.current.european_aqi}, hourly=${data.hourly!.time!.length}` };
  });
}

function checkDwdWarnings(city: CityConfig) {
  return runCheck('DWD warnings', async () => {
    if (city.country !== 'DE') {
      return { status: 200, detail: 'skipped (non-DE city)' };
    }
    const { status, body } = await fetchText('https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json');
    if (!body.startsWith('warnWetter.loadWarnings(')) throw new Error('expected JSONP wrapper warnWetter.loadWarnings(');
    const jsonStr = body.replace(/^warnWetter\.loadWarnings\(/, '').replace(/\);?\s*$/, '');
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const regions = Object.keys(parsed).length;
    return { status, detail: `${regions} regions in payload` };
  });
}

function checkDwdUv(city: CityConfig) {
  return runCheck('DWD UV', async () => {
    if (city.country !== 'DE') {
      return { status: 200, detail: 'skipped (non-DE city)' };
    }
    const { status, body } = await fetchJson('https://opendata.dwd.de/climate_environment/health/alerts/uvi.json');
    const data = body as { content?: Array<{ city: string; forecast: { today: number; tomorrow: number; dayafter_to: number } }> };
    if (!Array.isArray(data.content)) throw new Error('missing content array');
    const entry = data.content.find((c) => c.city.toLowerCase() === city.name.toLowerCase());
    if (!entry) throw new Error(`no entry for "${city.name}" (${data.content.length} cities in payload)`);
    return {
      status,
      detail: `today=${entry.forecast.today}, tomorrow=${entry.forecast.tomorrow}, dayAfter=${entry.forecast.dayafter_to}`,
    };
  });
}

function formatResult(r: CheckResult): string {
  const verdict = r.ok ? 'OK  ' : 'FAIL';
  const status = r.status === null ? '---' : String(r.status);
  return `${verdict}  ${r.name.padEnd(26)} ${status.padStart(3)}  ${`${r.ms}ms`.padStart(7)}   ${r.detail}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cityIdx = args.indexOf('--city');
  const cityId = cityIdx !== -1 ? args[cityIdx + 1] : 'berlin';

  const city = CITIES[cityId];
  if (!city) {
    console.error(`Unknown city: "${cityId}". Available: ${Object.keys(CITIES).join(', ')}`);
    process.exit(2);
  }

  console.log(`Checking weather sources for ${city.name} (${city.id}, ${city.country}) — timeout ${TIMEOUT_MS}ms each\n`);

  const results = await Promise.all([
    checkOpenMeteoForecast(city),
    checkOpenMeteoAirQuality(city),
    checkDwdWarnings(city),
    checkDwdUv(city),
  ]);

  for (const r of results) {
    console.log(formatResult(r));
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('');
  if (failed === 0) {
    console.log(`All ${results.length} sources OK.`);
    process.exit(0);
  } else {
    console.log(`${failed} of ${results.length} sources failed.`);
    process.exit(1);
  }
}

await main();
