import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import { FSI, ISOLATE_CONTROL, PDI, isolate } from './bidi.js';
import {
  formatCount,
  formatDecimal,
  formatDegrees,
  formatPercent,
  formatSignedCount,
  formatSignedPercent,
  formatCompactAmount,
  formatCompactReading,
  withUnit,
} from './format-value.js';

describe('formatCount', () => {
  it.each([
    ['en', '3,850,809'],
    ['de', '3.850.809'],
    ['tr', '3.850.809'],
  ])('groups digits the %s way', (lang, expected) => {
    expect(formatCount(3_850_809, lang)).toBe(expected);
  });

  it('uses the given locale in Arabic', () => {
    expect(formatCount(3_850_809, 'ar')).toBe((3_850_809).toLocaleString('ar'));
  });

  it('keeps a negative count and its minus in one run', () => {
    expect(formatCount(-5, 'en')).toBe(isolate('-5'));
  });
});

describe('formatDecimal', () => {
  it('keeps a point and Latin digits whatever the language', () => {
    expect(formatDecimal(24.06, 1)).toBe('24.1');
    expect(formatDecimal(12, 1)).toBe('12.0');
    expect(formatDecimal(-3.42, 1)).toBe(isolate('-3.4'));
  });

  it('rounds to whole numbers with no decimals', () => {
    expect(formatDecimal(12.4, 0)).toBe('12');
    expect(formatDecimal(1.5, 0)).toBe('2');
  });

  it('writes the number as it comes without a count of decimals', () => {
    expect(formatDecimal(1234)).toBe('1234');
    expect(formatDecimal(12.5)).toBe('12.5');
    expect(formatDecimal(-0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('attaches the percent sign', () => {
    expect(formatPercent(24.1, 1)).toBe(isolate('24.1%'));
    expect(formatPercent(0, 1)).toBe(isolate('0.0%'));
    expect(formatPercent(15)).toBe(isolate('15%'));
  });
});

describe('formatDegrees', () => {
  it('attaches the degree sign to the number as it comes', () => {
    expect(formatDegrees(21)).toBe(isolate('21°'));
    expect(formatDegrees(12.5)).toBe(isolate('12.5°'));
  });

  it('keeps the minus in front of a temperature below zero', () => {
    expect(formatDegrees(-3)).toBe(isolate('-3°'));
  });

  it('writes a temperature that rounded to minus zero as 0°', () => {
    expect(formatDegrees(Math.round(-0.4))).toBe(isolate('0°'));
  });
});

describe('formatSignedCount', () => {
  it('puts a plus before a rise and keeps the minus of a fall', () => {
    expect(formatSignedCount(12_345, 'en')).toBe(isolate('+12,345'));
    expect(formatSignedCount(-12_345, 'de')).toBe(isolate('-12.345'));
  });

  it('writes no sign for zero unless asked', () => {
    expect(formatSignedCount(0, 'en')).toBe('0');
    expect(formatSignedCount(0, 'en', { plusOnZero: true })).toBe(isolate('+0'));
  });

  it('builds the run from the count in the UI language', () => {
    expect(formatSignedCount(12_345, 'ar')).toBe(isolate(`+${(12_345).toLocaleString('ar')}`));
  });
});

describe('formatSignedPercent', () => {
  it('puts a plus before a rise and keeps the minus of a fall', () => {
    expect(formatSignedPercent(3.24, 1)).toBe(isolate('+3.2%'));
    expect(formatSignedPercent(-1.5, 1)).toBe(isolate('-1.5%'));
    expect(formatSignedPercent(15)).toBe(isolate('+15%'));
  });

  it('writes no sign for zero unless asked', () => {
    expect(formatSignedPercent(0, 1)).toBe(isolate('0.0%'));
    expect(formatSignedPercent(0)).toBe(isolate('0%'));
    expect(formatSignedPercent(0, 1, { plusOnZero: true })).toBe(isolate('+0.0%'));
  });

  it('keeps the minus of a fall that rounds to zero', () => {
    expect(formatSignedPercent(-0.04, 1)).toBe(isolate('-0.0%'));
  });
});

describe('formatCompactAmount', () => {
  const en = i18n.getFixedT('en');

  it.each([
    [38_500_000_000, isolate('38.5 bn')],
    [40_000_000_000, isolate('40.0 bn')],
    [450_000_000, isolate('450 M')],
    [1_500_000, isolate('2 M')],
    [12_400, isolate('12 K')],
    [999, '999'],
    [0, '0'],
    [-2_500_000_000, isolate('-2.5 bn')],
    [-450_000, isolate('-450 K')],
    [-999, isolate('-999')],
  ])('%d reads "%s"', (amount, expected) => {
    expect(formatCompactAmount(amount, en)).toBe(expected);
  });

  // Same numbers and rounding in every language; only the scale word changes.
  it.each([
    ['de', ['38.5 Mrd.', '450 Mio.', '12 Tsd.']],
    ['tr', ['38.5 Mr', '450 Mn', '12 bin']],
    ['ar', ['38.5 مليار', '450 مليون', '12 ألف']],
  ])('names the scale in %s', (lang, expected) => {
    const t = i18n.getFixedT(lang);
    expect([38_500_000_000, 450_000_000, 12_400, 999].map((n) => formatCompactAmount(n, t))).toEqual([
      ...expected.map(isolate),
      '999',
    ]);
  });
});

describe('formatCompactReading', () => {
  it.each([
    [1_500_000, isolate('1.5M')],
    [1_200, isolate('1.2k')],
    [999_949, isolate('999.9k')],
    [500.4, '500'],
    [0, '0'],
  ])('%d reads "%s"', (value, expected) => {
    expect(formatCompactReading(value)).toBe(expected);
  });
});

describe('withUnit', () => {
  it('puts a space between the value and its unit', () => {
    expect(withUnit('412', 'cm')).toBe(isolate('412 cm'));
    expect(withUnit('4.321', 'pro km²')).toBe(isolate('4.321 pro km²'));
  });

  it('attaches the unit when asked', () => {
    expect(withUnit('5.7', 'mm', { attached: true })).toBe(isolate('5.7mm'));
  });

  it('takes a value from this module into the same run, not a run inside a run', () => {
    expect(withUnit(formatCompactReading(1_200), 'gc/L')).toBe(isolate('1.2k gc/L'));
    expect(withUnit(formatDecimal(-3.42, 1), 'cm')).toBe(isolate('-3.4 cm'));
  });
});

/**
 * In a right-to-left page the bidi algorithm moves a sign or a unit to the
 * other end of its number ("3°-", "km/h 16", "1.9%-"). Every value with a
 * sign, a unit, a symbol or a scale word therefore comes back as one isolated
 * run; a number of digits and separators alone keeps its order without one.
 */
describe('direction-safe output', () => {
  const isOneIsolate = (s: string) =>
    s.length > 2 && s.startsWith(FSI) && s.endsWith(PDI) && !ISOLATE_CONTROL.test(s.slice(1, -1));
  const t = i18n.getFixedT('ar');

  it.each([
    ['formatDegrees', formatDegrees(-3)],
    ['formatPercent', formatPercent(65)],
    ['formatSignedPercent', formatSignedPercent(-1.9, 1)],
    ['formatSignedCount', formatSignedCount(12_829, 'ar', { plusOnZero: true })],
    ['formatCompactAmount', formatCompactAmount(37_400_000_000, t)],
    ['formatCompactReading', formatCompactReading(1_500)],
    ['withUnit', withUnit(formatDecimal(16), 'km/h')],
    ['formatDecimal (negative)', formatDecimal(-2.7)],
  ])('%s returns one isolated run', (_name, value) => {
    expect(isOneIsolate(value)).toBe(true);
  });

  it.each([
    ['formatCount', formatCount(3_850_809, 'ar')],
    ['formatCount (Arabic-Indic digits and separators)', formatCount(1_234.5, 'ar-EG')],
    ['formatDecimal', formatDecimal(412)],
    ['formatCompactReading', formatCompactReading(500)],
  ])('%s leaves a bare number as it is', (_name, value) => {
    expect(value).not.toMatch(ISOLATE_CONTROL);
  });
});
