import { describe, it, expect } from 'vitest';
import { getUvLevel, uvIndexForToday } from './uv-levels.js';

describe('uvIndexForToday', () => {
  const forecast = { today: 3, tomorrow: 5, dayAfter: 7, forecastDay: '2026-06-10' };
  const tz = 'Europe/Berlin';

  it('returns null without a forecast', () => {
    expect(uvIndexForToday(undefined, tz)).toBeNull();
  });

  it('uses today on the forecast day', () => {
    expect(uvIndexForToday(forecast, tz, new Date('2026-06-10T10:00:00Z'))).toBe(3);
  });

  it('moves on a day before DWD publishes the next forecast', () => {
    expect(uvIndexForToday(forecast, tz, new Date('2026-06-11T05:00:00Z'))).toBe(5);
    expect(uvIndexForToday(forecast, tz, new Date('2026-06-12T05:00:00Z'))).toBe(7);
  });

  it('counts days in the city time zone, not UTC', () => {
    // 23:30 UTC on the 10th is already 01:30 on the 11th in Berlin
    expect(uvIndexForToday(forecast, tz, new Date('2026-06-10T23:30:00Z'))).toBe(5);
  });

  it('returns null once the forecast no longer covers today', () => {
    expect(uvIndexForToday(forecast, tz, new Date('2026-06-13T10:00:00Z'))).toBeNull();
    expect(uvIndexForToday(forecast, tz, new Date('2026-06-09T10:00:00Z'))).toBeNull();
  });

  it('takes a forecast without a date as starting today', () => {
    expect(uvIndexForToday({ today: 2, tomorrow: 4, dayAfter: 4 }, tz, new Date('2026-06-13T10:00:00Z'))).toBe(2);
  });
});

describe('getUvLevel', () => {
  it('returns low for UV index 0-2', () => {
    expect(getUvLevel(0)).toEqual({ level: 'low', color: '#4ade80' });
    expect(getUvLevel(1)).toEqual({ level: 'low', color: '#4ade80' });
    expect(getUvLevel(2)).toEqual({ level: 'low', color: '#4ade80' });
  });

  it('returns moderate for UV index 3-5', () => {
    expect(getUvLevel(3)).toEqual({ level: 'moderate', color: '#facc15' });
    expect(getUvLevel(4)).toEqual({ level: 'moderate', color: '#facc15' });
    expect(getUvLevel(5)).toEqual({ level: 'moderate', color: '#facc15' });
  });

  it('returns high for UV index 6-7', () => {
    expect(getUvLevel(6)).toEqual({ level: 'high', color: '#fb923c' });
    expect(getUvLevel(7)).toEqual({ level: 'high', color: '#fb923c' });
  });

  it('returns veryHigh for UV index 8-10', () => {
    expect(getUvLevel(8)).toEqual({ level: 'veryHigh', color: '#ef4444' });
    expect(getUvLevel(10)).toEqual({ level: 'veryHigh', color: '#ef4444' });
  });

  it('returns extreme for UV index 11+', () => {
    expect(getUvLevel(11)).toEqual({ level: 'extreme', color: '#a855f7' });
    expect(getUvLevel(15)).toEqual({ level: 'extreme', color: '#a855f7' });
  });

  it('handles fractional values by flooring', () => {
    expect(getUvLevel(2.9)).toEqual({ level: 'low', color: '#4ade80' });
    expect(getUvLevel(5.5)).toEqual({ level: 'moderate', color: '#facc15' });
  });
});
