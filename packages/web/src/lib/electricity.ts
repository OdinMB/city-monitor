/**
 * What the electricity tile reads from the server's ElectricityData at the
 * viewer's "now": the current quarter-hour of Germany's grid, the CO₂ value to
 * show, the next green window of Energy-Charts' traffic light, the greenest
 * hour ahead, and the control area's mix in the groups the bar shows.
 */
import type { ElectricityMix, GenerationKind, GridPoint, GridSignal } from './api.js';

const QUARTER_HOUR_MS = 15 * 60_000;
/** A measured CO₂ value older than this gives way to the forecast for now. */
const CO2_MAX_LAG_MS = 2 * 3600_000;

const startOf = (p: GridPoint) => Date.parse(p.t);

/** Index of the quarter-hour that holds `now`, or of the first one after it; -1 when the grid is over. */
function currentIndex(grid: readonly GridPoint[], now: number): number {
  return grid.findIndex((p) => startOf(p) + QUARTER_HOUR_MS > now);
}

/** The quarter-hour that holds `now`, or null. */
export function gridPointAt(grid: readonly GridPoint[], now: number): GridPoint | null {
  const i = currentIndex(grid, now);
  return i >= 0 && startOf(grid[i]!) <= now ? grid[i]! : null;
}

export interface Co2Reading {
  value: number;
  /** Start of the quarter-hour it is for (ISO). */
  t: string;
  forecast: boolean;
}

/**
 * The newest measured CO₂ intensity, or the forecast for now when the newest
 * measurement is over two hours old (just after midnight, measured values for
 * the new day are not out yet).
 */
export function co2Now(grid: readonly GridPoint[], now: number): Co2Reading | null {
  const measured = grid.filter((p) => p.co2 !== null && startOf(p) <= now).at(-1);
  if (measured && startOf(measured) >= now - CO2_MAX_LAG_MS) return { value: measured.co2!, t: measured.t, forecast: false };
  const current = gridPointAt(grid, now);
  if (current?.co2Forecast != null) return { value: current.co2Forecast, t: current.t, forecast: true };
  return measured ? { value: measured.co2!, t: measured.t, forecast: false } : null;
}

export interface TimeWindow {
  start: string;
  end: string;
}

/** The first run of green quarter-hours (signal 2) from the current one on, or null when none is forecast. */
export function nextGreenWindow(grid: readonly GridPoint[], now: number): TimeWindow | null {
  const from = currentIndex(grid, now);
  if (from < 0) return null;
  const first = grid.findIndex((p, i) => i >= from && p.signal === 2);
  if (first < 0) return null;
  let last = first;
  while (
    last + 1 < grid.length
    && grid[last + 1]!.signal === 2
    && startOf(grid[last + 1]!) === startOf(grid[last]!) + QUARTER_HOUR_MS
  ) last++;
  return { start: grid[first]!.t, end: new Date(startOf(grid[last]!) + QUARTER_HOUR_MS).toISOString() };
}

/**
 * The hour (four consecutive quarter-hours) with the highest renewable share
 * from the current quarter-hour to the end of the forecast; the earliest on a tie.
 */
export function greenestHour(grid: readonly GridPoint[], now: number): { start: string; share: number } | null {
  const from = currentIndex(grid, now);
  if (from < 0) return null;
  let best: { start: string; share: number } | null = null;
  for (let i = from; i + 3 < grid.length; i++) {
    const hour = grid.slice(i, i + 4);
    if (hour.some((p) => p.share === null)) continue;
    if (startOf(hour[3]!) - startOf(hour[0]!) !== 3 * QUARTER_HOUR_MS) continue;
    const share = hour.reduce((s, p) => s + p.share!, 0) / 4;
    if (!best || share > best.share) best = { start: hour[0]!.t, share: Math.round(share * 10) / 10 };
  }
  return best;
}

export type MixGroup = 'wind' | 'solar' | 'biomass' | 'hydro' | 'coal' | 'gas' | 'other';

/**
 * The bar's groups in their order, renewables first. `hydro` takes in SMARD's
 * "other renewables" (a few dozen MW); `other` is pumped storage and other
 * conventional plants. Colours read on both themes' tile surfaces.
 */
export const MIX_GROUPS: ReadonlyArray<{ group: MixGroup; kinds: readonly GenerationKind[]; color: string; renewable: boolean }> = [
  { group: 'wind', kinds: ['windOnshore', 'windOffshore'], color: '#0ea5e9', renewable: true },
  { group: 'solar', kinds: ['solar'], color: '#eab308', renewable: true },
  { group: 'biomass', kinds: ['biomass'], color: '#65a30d', renewable: true },
  { group: 'hydro', kinds: ['hydro', 'otherRenewable'], color: '#2563eb', renewable: true },
  { group: 'gas', kinds: ['gas'], color: '#f97316', renewable: false },
  { group: 'coal', kinds: ['lignite', 'hardCoal'], color: '#78716c', renewable: false },
  { group: 'other', kinds: ['pumpedStorage', 'otherConventional'], color: '#a8a29e', renewable: false },
];

export interface MixShare {
  group: MixGroup;
  color: string;
  mw: number;
  /** % of the area's generation. */
  share: number;
}

/** The mix in the bar's groups, leaving out a group with no output. */
export function groupMix(mix: ElectricityMix): MixShare[] {
  const total = Object.values(mix.mw).reduce((s, v) => s + (v ?? 0), 0);
  if (total <= 0) return [];
  return MIX_GROUPS
    .map(({ group, kinds, color }) => {
      const mw = kinds.reduce((s, k) => s + (mix.mw[k] ?? 0), 0);
      return { group, color, mw, share: (mw / total) * 100 };
    })
    .filter((g) => g.mw > 0);
}

/** The traffic light's colour for a dot or a timeline cell. */
export const SIGNAL_COLORS: Record<GridSignal, string> = {
  2: 'bg-signal-good',
  1: 'bg-signal-caution',
  0: 'bg-signal-bad',
  [-1]: 'bg-signal-bad',
};
