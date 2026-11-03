import { Fan, GlassWater, Toilet } from 'lucide';
import type { DwdHeatTrend, HeatReliefKind, WeatherAlert } from '@city-monitor/shared';
import type { HeatReliefSubLayer } from '../hooks/useCommandCenter.js';
import type { IconNode } from './map-icons.js';
import { warningsInForce } from './weather-warnings.js';

/**
 * The heat-relief layer's kinds of place: the sidebar sub-layer, the icon and
 * its colour on the map and in the sidebar (.context/heat-relief.md).
 */
export const HEAT_RELIEF_KINDS: ReadonlyArray<{ kind: HeatReliefKind; sub: HeatReliefSubLayer; icon: IconNode; color: string }> = [
  { kind: 'cool', sub: 'cool', icon: Fan as IconNode, color: '#0891b2' },
  { kind: 'fountain', sub: 'fountains', icon: GlassWater as IconNode, color: '#2563eb' },
  { kind: 'toilet', sub: 'toilets', icon: Toilet as IconNode, color: '#7c3aed' },
];

/** A fountain that is out of order or out of season. */
export const HEAT_RELIEF_OFF_COLOR = '#9ca3af';

/** Whether `now`'s month lies outside a season of months 1–12 (one that wraps the new year included). */
export function isOutOfSeason(season: { from: number; to: number }, now: Date): boolean {
  const m = now.getMonth() + 1;
  const inSeason = season.from <= season.to ? m >= season.from && m <= season.to : m >= season.from || m <= season.to;
  return !inSeason;
}

/** How many days ahead the heat outlook turns on the hint: today and the next three. */
export const HEAT_OUTLOOK_DAYS = 4;

const DAY_MS = 86_400_000;

/**
 * Why the weather tile points to the heat-relief layer, or null when it does
 * not: `warning` while a DWD heat warning is in force (or the heat trend
 * reports one for today), `outlook` when DWD's heat trend reports a warning or
 * an active heat trend within the next `HEAT_OUTLOOK_DAYS` days. `today` is
 * the city's date ("YYYY-MM-DD"); a trend issued on another day is read from
 * its offset, and one too old says nothing.
 */
export function heatSignal(
  alerts: readonly WeatherAlert[],
  trend: DwdHeatTrend | undefined,
  today: string,
  now: number,
): 'warning' | 'outlook' | null {
  if (warningsInForce(alerts.filter((a) => a.kind === 'heat'), now).length > 0) return 'warning';
  if (!trend) return null;
  const offset = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${trend.issued}T00:00:00Z`)) / DAY_MS);
  if (!Number.isFinite(offset) || offset < 0) return null;
  const ahead = trend.days.slice(offset, offset + HEAT_OUTLOOK_DAYS);
  if (ahead[0] === 1 || ahead[0] === 2) return 'warning';
  return ahead.some((v) => v > 0) ? 'outlook' : null;
}
