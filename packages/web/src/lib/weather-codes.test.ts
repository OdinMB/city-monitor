import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import { getWeatherInfo } from './weather-codes.js';

/** Every WMO code the table names. */
const CODES = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];

const en = (code: number) => i18n.t(getWeatherInfo(code).labelKey, { lng: 'en' });

describe('getWeatherInfo', () => {
  it('returns clear sky for code 0', () => {
    expect(en(0)).toMatch(/clear/i);
    expect(getWeatherInfo(0).icon).toBeTruthy();
  });

  it('returns rain for code 61', () => {
    expect(en(61)).toMatch(/rain/i);
  });

  it('returns snow for code 71', () => {
    expect(en(71)).toMatch(/snow/i);
  });

  it('returns thunderstorm for code 95', () => {
    expect(en(95)).toMatch(/thunder/i);
  });

  it('returns a fallback for unknown codes', () => {
    const info = getWeatherInfo(999);
    expect(i18n.t(info.labelKey, { lng: 'en' })).toBe('Unknown');
    expect(info.icon).toBeTruthy();
  });

  it.each(['en', 'de', 'tr', 'ar'])('names every condition, each differently, in %s', (lng) => {
    const keys = [...CODES.map((c) => getWeatherInfo(c).labelKey), getWeatherInfo(999).labelKey];
    for (const key of keys) expect(i18n.exists(key, { lng, fallbackLng: false }), key).toBe(true);
    const names = keys.map((key) => i18n.t(key, { lng }));
    expect(new Set(names).size).toBe(keys.length);
  });
});
