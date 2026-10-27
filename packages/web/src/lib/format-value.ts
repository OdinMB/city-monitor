/**
 * How a value is shown: numbers in the UI language, decimals, units and
 * signed changes.
 *
 * Digits come from two places. Counts are grouped in the UI language
 * (`formatCount`), so pass `i18n.language`, never `undefined`. Everything
 * else goes through `formatDecimal`, which keeps Latin digits and a point in
 * every language: percentages, shortened amounts and readings. A shortened
 * amount's scale word follows the UI language (`formatCompactAmount`).
 */

/** A count grouped the way the UI language groups it: "3,850,809", "3.850.809". */
export function formatCount(n: number, lang: string): string {
  return n.toLocaleString(lang);
}

/**
 * A number in Latin digits with a point, in every language. With
 * `fractionDigits` it is rounded to that many decimals ("24.1", "12.0");
 * without, it is written as it comes ("1234", "12.5").
 */
export function formatDecimal(n: number, fractionDigits?: number): string {
  return fractionDigits === undefined ? String(n) : n.toFixed(fractionDigits);
}

/** A percentage with the percent sign attached: "24.1%" with one decimal, "15%" for a whole number as it comes. */
export function formatPercent(n: number, fractionDigits?: number): string {
  return `${formatDecimal(n, fractionDigits)}%`;
}

interface SignOptions {
  /** Write "+" before zero too ("+0.0%"); otherwise zero has no sign. */
  plusOnZero?: boolean;
}

/** "+" before a rise; a fall brings its own minus. */
function plusSign(n: number, { plusOnZero = false }: SignOptions): string {
  return (plusOnZero ? n >= 0 : n > 0) ? '+' : '';
}

/** A change in a count, signed and grouped in the UI language: "+12,345", "-12.345". */
export function formatSignedCount(n: number, lang: string, options: SignOptions = {}): string {
  return `${plusSign(n, options)}${formatCount(n, lang)}`;
}

/** A change in percent, signed: "+3.2%" and "-1.5%" with one decimal, "+15%" for a whole number as it comes. */
export function formatSignedPercent(n: number, fractionDigits?: number, options: SignOptions = {}): string {
  return `${plusSign(n, options)}${formatPercent(n, fractionDigits)}`;
}

/**
 * A large amount shortened with the scale word of the UI language, looked up
 * with `t` under `number.scale.*`: "38.5 bn", "450 Mio.", "12 bin", or as it
 * comes below a thousand. Billions keep one decimal.
 */
export function formatCompactAmount(amount: number, t: (key: string) => string): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return withUnit(formatDecimal(amount / 1_000_000_000, 1), t('number.scale.billion'));
  if (abs >= 1_000_000) return withUnit(formatDecimal(amount / 1_000_000, 0), t('number.scale.million'));
  if (abs >= 1_000) return withUnit(formatDecimal(amount / 1_000, 0), t('number.scale.thousand'));
  return formatDecimal(amount);
}

/**
 * A measured value shortened with an attached scale letter and one decimal:
 * "1.5M", "1.2k", or whole below a thousand ("500").
 */
export function formatCompactReading(value: number): string {
  if (value >= 1_000_000) return `${formatDecimal(value / 1_000_000, 1)}M`;
  if (value >= 1_000) return `${formatDecimal(value / 1_000, 1)}k`;
  return formatDecimal(value, 0);
}

/** A formatted value and its unit, with a space between: "412 cm", "4.321 pro km²". */
export function withUnit(value: string, unit: string): string {
  return `${value} ${unit}`;
}
