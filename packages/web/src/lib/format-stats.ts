import { formatSignedPercent } from './format-value.js';

/**
 * Format seconds as mm:ss (e.g. 452 -> "7:32").
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Percentage delta with the colour role class for its direction
 * (`text-negative`, `text-positive`, `text-muted` for no change; globals.css).
 * @param current  - current value
 * @param previous - previous value (returns null if undefined or 0)
 * @param invert   - if true, negative change is "worse" (default: positive is worse)
 */
export function formatDelta(
  current: number,
  previous: number | undefined,
  invert = false,
): { text: string; color: string } | null {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  // One decimal below ±10 %, whole percent from there.
  const text = Math.abs(pct) < 10 ? formatSignedPercent(pct, 1) : formatSignedPercent(Math.round(pct));
  const isWorse = invert ? pct < 0 : pct > 0;
  const color = isWorse ? 'text-negative' : pct === 0 ? 'text-muted' : 'text-positive';
  return { text, color };
}

/**
 * Year-over-year percentage with the colour role class for its direction.
 * Simplified version of formatDelta for pre-computed YoY percentages
 * where positive = worse (higher unemployment).
 */
export function formatYoy(percent: number): { text: string; color: string } {
  // A whole percentage as it comes, otherwise one decimal.
  const text = Number.isInteger(percent) ? formatSignedPercent(percent) : formatSignedPercent(percent, 1);
  const color = percent > 0 ? 'text-negative' : percent < 0 ? 'text-positive' : 'text-muted';
  return { text, color };
}
