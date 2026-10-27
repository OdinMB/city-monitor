import { FSI, ISOLATE_CONTROL, PDI, isolate } from './bidi.js';

/**
 * How a value is shown: numbers in the UI language, decimals, units and
 * signed changes.
 *
 * Digits come from two places. Counts are grouped in the UI language
 * (`formatCount`), so pass `i18n.language`, never `undefined`. Everything
 * else goes through `formatDecimal`, which keeps Latin digits and a point in
 * every language: percentages, shortened amounts and readings. A shortened
 * amount's scale word follows the UI language (`formatCompactAmount`).
 *
 * Direction is decided here too. In an Arabic (right-to-left) page the bidi
 * algorithm moves a sign or a unit to the other end of its number ("3°-",
 * "km/h 16", "1.9%-"), so every value with a sign, a unit, a symbol or a scale
 * word comes back as one isolated run (`isolate` in `lib/bidi.ts`): "-3°",
 * "16 km/h", "+1.9%" in every language. A number of digits and separators
 * alone keeps its order by itself and comes back as it is. Put a value from
 * here straight into JSX or, escaped, into popup HTML; to add a unit to it,
 * pass it to `withUnit`, which keeps the two in one run.
 */

/** The Arabic decimal and thousands separators, U+066B and U+066C. */
const ARABIC_SEPARATORS = String.fromCodePoint(0x066b, 0x066c);

/** Digits and their group and decimal separators only, in Latin or Arabic-Indic script. */
const BARE_NUMBER = new RegExp(`^[\\p{Nd}.,${ARABIC_SEPARATORS}]*$`, 'u');

/** One run: a bare number as it is, anything else isolated. */
function oneRun(text: string): string {
  return BARE_NUMBER.test(text) ? text : isolate(text);
}

/** A value from this module without its isolate, to build a longer run from. */
function unwrap(value: string): string {
  const inner = value.slice(1, -1);
  return value.startsWith(FSI) && value.endsWith(PDI) && !ISOLATE_CONTROL.test(inner) ? inner : value;
}

/** `formatDecimal` before its direction is settled. */
function decimal(n: number, fractionDigits?: number): string {
  return fractionDigits === undefined ? String(n) : n.toFixed(fractionDigits);
}

/** A count grouped the way the UI language groups it: "3,850,809", "3.850.809". */
export function formatCount(n: number, lang: string): string {
  return oneRun(n.toLocaleString(lang));
}

/**
 * A number in Latin digits with a point, in every language. With
 * `fractionDigits` it is rounded to that many decimals ("24.1", "12.0");
 * without, it is written as it comes ("1234", "12.5").
 */
export function formatDecimal(n: number, fractionDigits?: number): string {
  return oneRun(decimal(n, fractionDigits));
}

/** A percentage with the percent sign attached: "24.1%" with one decimal, "15%" for a whole number as it comes. */
export function formatPercent(n: number, fractionDigits?: number): string {
  return isolate(`${decimal(n, fractionDigits)}%`);
}

/** A temperature as it comes with the degree sign attached, the minus in front: "21°", "-3°", "12.5°". */
export function formatDegrees(n: number): string {
  return isolate(`${decimal(n)}°`);
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
  return oneRun(`${plusSign(n, options)}${n.toLocaleString(lang)}`);
}

/** A change in percent, signed: "+3.2%" and "-1.5%" with one decimal, "+15%" for a whole number as it comes. */
export function formatSignedPercent(n: number, fractionDigits?: number, options: SignOptions = {}): string {
  return isolate(`${plusSign(n, options)}${decimal(n, fractionDigits)}%`);
}

/**
 * A large amount shortened with the scale word of the UI language, looked up
 * with `t` under `number.scale.*`: "38.5 bn", "450 Mio.", "12 bin", or as it
 * comes below a thousand. Billions keep one decimal.
 */
export function formatCompactAmount(amount: number, t: (key: string) => string): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return withUnit(decimal(amount / 1_000_000_000, 1), t('number.scale.billion'));
  if (abs >= 1_000_000) return withUnit(decimal(amount / 1_000_000, 0), t('number.scale.million'));
  if (abs >= 1_000) return withUnit(decimal(amount / 1_000, 0), t('number.scale.thousand'));
  return formatDecimal(amount);
}

/**
 * A measured value shortened with an attached scale letter and one decimal:
 * "1.5M", "1.2k", or whole below a thousand ("500").
 */
export function formatCompactReading(value: number): string {
  if (value >= 1_000_000) return isolate(`${decimal(value / 1_000_000, 1)}M`);
  if (value >= 1_000) return isolate(`${decimal(value / 1_000, 1)}k`);
  return formatDecimal(value, 0);
}

/**
 * A formatted value and its unit in one run, with a space between ("412 cm",
 * "4.321 pro km²") or, `attached`, without ("5.7mm"). Pass the value from one
 * of the functions above.
 */
export function withUnit(value: string, unit: string, { attached = false }: { attached?: boolean } = {}): string {
  return isolate(`${unwrap(value)}${attached ? '' : ' '}${unit}`);
}
