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
import { koeln } from '../config/cities/koeln.js';

const CITIES: Record<string, CityConfig> = { berlin, hamburg, koeln };

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

function checkBrightSkyCurrent(city: CityConfig) {
  return runCheck('BrightSky current_weather', async () => {
    const { lat, lon } = city.dataSources.weather;
    const url = `https://api.brightsky.dev/current_weather?lat=${lat}&lon=${lon}`;
    const { status, body } = await fetchJson(url);
    const data = body as { weather?: { temperature?: number; icon?: string } };
    if (typeof data.weather?.temperature !== 'number') throw new Error('missing weather.temperature');
    if (typeof data.weather?.icon !== 'string') throw new Error('missing weather.icon');
    return { status, detail: `temp=${data.weather.temperature}°C, icon=${data.weather.icon}` };
  });
}

function checkBrightSkyForecast(city: CityConfig) {
  return runCheck('BrightSky weather (7d)', async () => {
    const { lat, lon } = city.dataSources.weather;
    // Use the city's local date (matches what the adapter sends in production).
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: city.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = fmt.format(new Date());
    const [y, m, d] = today.split('-').map(Number);
    const last = new Date(Date.UTC(y!, m! - 1, d! + 6)).toISOString().slice(0, 10);
    const url = `https://api.brightsky.dev/weather?lat=${lat}&lon=${lon}&date=${today}&last_date=${last}`;
    const { status, body } = await fetchJson(url);
    const data = body as { weather?: Array<{ timestamp?: string; temperature?: number }> };
    if (!Array.isArray(data.weather)) throw new Error('missing weather array');
    if (data.weather.length < 24) throw new Error(`too few entries (${data.weather.length}) for 7-day range`);
    return { status, detail: `${data.weather.length} hourly entries` };
  });
}

// BrightSky's /alerts endpoint exists and works, but production currently uses
// DWD's JSONP /warnings.json directly (see fetchDwdAlerts in ingest-weather.ts).
// `checkDwdWarnings` below is the canonical alerts probe.

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
    const data = body as {
      forecast_day?: string;
      content?: Array<{ city: string; forecast: { today: number; tomorrow: number; dayafter_to: number } }>;
    };
    if (!Array.isArray(data.content)) throw new Error('missing content array');
    const entry = data.content.find((c) => c.city.toLowerCase() === city.name.toLowerCase());
    if (!entry) throw new Error(`no entry for "${city.name}" (${data.content.length} cities in payload)`);
    return {
      status,
      detail: `forecast_day=${data.forecast_day ?? 'missing'}, today=${entry.forecast.today}, tomorrow=${entry.forecast.tomorrow}, dayAfter=${entry.forecast.dayafter_to}`,
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
    checkBrightSkyCurrent(city),
    checkBrightSkyForecast(city),
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
