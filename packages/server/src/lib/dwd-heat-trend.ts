/**
 * DWD's heat outlook per warn region (`hwtrend_YYYYMMDD.json`, Zentrum für
 * Medizin-Meteorologische Forschung; CC BY 4.0, source "Deutscher Wetterdienst").
 * One file a day (updated around 01:35 and 15:55 German time; the folder keeps
 * only the last few), keyed by warn-region id:
 * `{ "BXX": { "Name": "Land Berlin", "Bundesland": "8", "Trend": [0, 0, 0, 0, 0, 0, 0, 0] }, … }`.
 * `Trend` holds 8 days from the file's day: 0 none, 1 warning of strong heat
 * stress, 2 warning of extreme heat stress (days 1–2, from the warnings), 3
 * heat trend active, a warning possible (from day 3). Described in
 * Beschreibung_hwtrend_json.pdf in the same folder.
 */
import type { DwdHeatTrend } from '@city-monitor/shared';
import type { WarnRegionMatch } from './dwd-warnings.js';

export const DWD_HEAT_TREND_BASE = 'https://opendata.dwd.de/climate_environment/health/forecasts/heat/';

/** The file of a German calendar day ("2026-07-15" → …/hwtrend_20260715.json). */
export function heatTrendUrl(day: string): string {
  return `${DWD_HEAT_TREND_BASE}hwtrend_${day.replaceAll('-', '')}.json`;
}

/** The calendar day in Germany at `now`, and the day before ("YYYY-MM-DD"). */
export function heatTrendDays(now: Date): [today: string, yesterday: string] {
  const fmt = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  return [fmt(now), fmt(new Date(now.getTime() - 86_400_000))];
}

/**
 * The city's trend from one file: the first region whose `Name` is one of the
 * city's warn regions (the same matcher as the warnings: "Land Berlin",
 * "Hansestadt Hamburg", "Stadt Köln", "Kreis und Stadt München"). Null when no
 * region matches or its `Trend` is not a list of whole numbers 0–3.
 */
export function parseDwdHeatTrend(json: unknown, isCityRegion: WarnRegionMatch, issued: string): DwdHeatTrend | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  for (const region of Object.values(json as Record<string, unknown>)) {
    if (typeof region !== 'object' || region === null) continue;
    const { Name, Trend } = region as { Name?: unknown; Trend?: unknown };
    if (typeof Name !== 'string' || !isCityRegion(Name)) continue;
    if (!Array.isArray(Trend) || Trend.length === 0) return null;
    if (!Trend.every((v) => Number.isInteger(v) && v >= 0 && v <= 3)) return null;
    return { issued, days: Trend as number[] };
  }
  return null;
}
