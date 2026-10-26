import { describe, it, expect } from 'vitest';
import {
  formatCount,
  formatDecimal,
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
});

describe('formatDecimal', () => {
  it('keeps a point and Latin digits whatever the language', () => {
    expect(formatDecimal(24.06, 1)).toBe('24.1');
    expect(formatDecimal(12, 1)).toBe('12.0');
    expect(formatDecimal(-3.42, 1)).toBe('-3.4');
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
    expect(formatPercent(24.1, 1)).toBe('24.1%');
    expect(formatPercent(0, 1)).toBe('0.0%');
    expect(formatPercent(15)).toBe('15%');
  });
});

describe('formatSignedCount', () => {
  it('puts a plus before a rise and keeps the minus of a fall', () => {
    expect(formatSignedCount(12_345, 'en')).toBe('+12,345');
    expect(formatSignedCount(-12_345, 'de')).toBe('-12.345');
  });

  it('writes no sign for zero unless asked', () => {
    expect(formatSignedCount(0, 'en')).toBe('0');
    expect(formatSignedCount(0, 'en', { plusOnZero: true })).toBe('+0');
  });
});

describe('formatSignedPercent', () => {
  it('puts a plus before a rise and keeps the minus of a fall', () => {
    expect(formatSignedPercent(3.24, 1)).toBe('+3.2%');
    expect(formatSignedPercent(-1.5, 1)).toBe('-1.5%');
    expect(formatSignedPercent(15)).toBe('+15%');
  });

  it('writes no sign for zero unless asked', () => {
    expect(formatSignedPercent(0, 1)).toBe('0.0%');
    expect(formatSignedPercent(0)).toBe('0%');
    expect(formatSignedPercent(0, 1, { plusOnZero: true })).toBe('+0.0%');
  });

  it('keeps the minus of a fall that rounds to zero', () => {
    expect(formatSignedPercent(-0.04, 1)).toBe('-0.0%');
  });
});

describe('formatCompactAmount', () => {
  it.each([
    [38_500_000_000, '38.5 bn'],
    [40_000_000_000, '40.0 bn'],
    [450_000_000, '450 M'],
    [1_500_000, '2 M'],
    [12_400, '12 K'],
    [999, '999'],
    [0, '0'],
    [-2_500_000_000, '-2.5 bn'],
    [-450_000, '-450 K'],
  ])('%d reads "%s"', (amount, expected) => {
    expect(formatCompactAmount(amount)).toBe(expected);
  });
});

describe('formatCompactReading', () => {
  it.each([
    [1_500_000, '1.5M'],
    [1_200, '1.2k'],
    [999_949, '999.9k'],
    [500.4, '500'],
    [0, '0'],
  ])('%d reads "%s"', (value, expected) => {
    expect(formatCompactReading(value)).toBe(expected);
  });
});

describe('withUnit', () => {
  it('puts a space between the value and its unit', () => {
    expect(withUnit('412', 'cm')).toBe('412 cm');
    expect(withUnit('4.321', 'pro km²')).toBe('4.321 pro km²');
  });
});
