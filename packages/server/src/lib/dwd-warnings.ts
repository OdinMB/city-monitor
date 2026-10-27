/**
 * DWD's official weather warnings (warnings.json, the feed behind the WarnWetter app).
 *
 * The file is JSONP: `warnWetter.loadWarnings({ time, warnings, vorabInformation, copyright });`.
 * `warnings` maps each warncell id to a list of entries such as
 * `{ state, stateShort, regionName, type, level, start, end, event, headline, description, instruction, altitudeStart, altitudeEnd }`,
 * with `start` and `end` in epoch milliseconds and `end` null for an open-ended warning.
 * `vorabInformation` holds pre-announcements in the same shape; they are not warnings yet and are not read.
 */

import type { WeatherAlert } from '@city-monitor/shared';

export const DWD_WARNINGS_URL = 'https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json';

/**
 * Severity of each warning `level` that is shown. The levels are DWD's warning tiers plus one:
 * 1 pre-announcement, 2 Wetterwarnung (yellow), 3 markantes Wetter (orange), 4 Unwetter (red),
 * 5 extremes Unwetter (violet); heat warnings use 10 (starke) and 11 (extreme Wärmebelastung).
 * Levels 1 and 2, and any level not listed, are left out.
 */
const SEVERITY_BY_LEVEL = new Map<number, string>([
  [3, 'moderate'],
  [4, 'severe'],
  [5, 'extreme'],
  [10, 'moderate'],
  [11, 'severe'],
]);

/** One entry of a warncell, with the fields every reader relies on checked. */
export interface DwdWarningEntry {
  level: number;
  headline: string;
  regionName: string;
  [field: string]: unknown;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEntry(value: unknown): value is DwdWarningEntry {
  return isObject(value)
    && typeof value.level === 'number'
    && typeof value.headline === 'string'
    && typeof value.regionName === 'string';
}

function warningsOf(json: unknown): Json | null {
  return isObject(json) && isObject(json.warnings) ? json.warnings : null;
}

function isoOrEmpty(ms: unknown): string {
  if (typeof ms !== 'number') return '';
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Strips the `warnWetter.loadWarnings(...)` callback and parses the JSON inside. Throws when it is not JSON. */
export function parseDwdWarningsJsonp(text: string): unknown {
  return JSON.parse(text.replace(/^warnWetter\.loadWarnings\(/, '').replace(/\);?\s*$/, ''));
}

/**
 * The warnings of one city: entries whose `regionName` contains the city name (case-insensitive),
 * at a shown level, each warning once even when it covers several of the city's warncells.
 * Entries without a numeric level or a string headline and region name are skipped.
 * Returns null when the payload has no `warnings` object.
 */
export function parseDwdWarnings(json: unknown, cityName: string): WeatherAlert[] | null {
  const warnings = warningsOf(json);
  if (!warnings) return null;

  const name = cityName.toLowerCase();
  const seen = new Set<string>();
  const alerts: WeatherAlert[] = [];

  for (const entries of Object.values(warnings)) {
    if (!Array.isArray(entries)) continue;
    for (const w of entries) {
      if (!isEntry(w)) continue;
      const severity = SEVERITY_BY_LEVEL.get(w.level);
      if (!severity || !w.regionName.toLowerCase().includes(name)) continue;

      const key = JSON.stringify([w.level, w.headline, w.start, w.end]);
      if (seen.has(key)) continue;
      seen.add(key);

      alerts.push({
        headline: w.headline,
        severity,
        description: typeof w.description === 'string' ? w.description : '',
        validUntil: isoOrEmpty(w.end),
      });
    }
  }

  return alerts;
}

/**
 * Checks that a parsed warnings.json has the shape `parseDwdWarnings` reads: a `warnings` object of
 * warncell lists whose entries carry a numeric `level` and a string `headline` and `regionName`.
 * Throws naming the first mismatch, so a change in DWD's format fails `npm run check:weather`.
 */
export function assertDwdWarningsShape(json: unknown): { cells: number; entries: DwdWarningEntry[] } {
  const warnings = warningsOf(json);
  if (!warnings) throw new Error('missing "warnings" object');

  const entries: DwdWarningEntry[] = [];
  for (const [cell, list] of Object.entries(warnings)) {
    if (!Array.isArray(list)) throw new Error(`warncell ${cell}: expected a list of warnings`);
    for (const w of list) {
      if (!isObject(w)) throw new Error(`warncell ${cell}: entry is not an object`);
      if (typeof w.level !== 'number') throw new Error(`warncell ${cell}: entry without a numeric "level"`);
      if (typeof w.headline !== 'string') throw new Error(`warncell ${cell}: entry without a string "headline"`);
      if (typeof w.regionName !== 'string') throw new Error(`warncell ${cell}: entry without a string "regionName"`);
      entries.push(w as DwdWarningEntry);
    }
  }

  return { cells: Object.keys(warnings).length, entries };
}
