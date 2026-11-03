import { describe, it, expect } from 'vitest';
import type { WeatherAlert } from '@city-monitor/shared';
import { heatSignal, isOutOfSeason } from './heat-relief.js';

const NOW = Date.parse('2026-07-15T10:00:00Z');
const heat = (validUntil: string): WeatherAlert => ({ headline: 'Amtliche WARNUNG vor HITZE', severity: 'moderate', description: '', validUntil, kind: 'heat' });

describe('isOutOfSeason', () => {
  it('reads a season within one year', () => {
    expect(isOutOfSeason({ from: 4, to: 10 }, new Date(2026, 6, 1))).toBe(false);
    expect(isOutOfSeason({ from: 4, to: 10 }, new Date(2026, 3, 1))).toBe(false);
    expect(isOutOfSeason({ from: 4, to: 10 }, new Date(2026, 9, 31))).toBe(false);
    expect(isOutOfSeason({ from: 4, to: 10 }, new Date(2026, 10, 1))).toBe(true);
    expect(isOutOfSeason({ from: 4, to: 10 }, new Date(2026, 2, 31))).toBe(true);
  });

  it('reads a season that wraps the new year', () => {
    expect(isOutOfSeason({ from: 11, to: 2 }, new Date(2026, 0, 10))).toBe(false);
    expect(isOutOfSeason({ from: 11, to: 2 }, new Date(2026, 6, 10))).toBe(true);
  });
});

describe('heatSignal', () => {
  it('says warning while a DWD heat warning is in force', () => {
    expect(heatSignal([heat('2026-07-15T17:00:00Z')], undefined, '2026-07-15', NOW)).toBe('warning');
  });

  it('ignores a heat warning that has ended and warnings of other kinds', () => {
    expect(heatSignal([heat('2026-07-14T17:00:00Z')], undefined, '2026-07-15', NOW)).toBeNull();
    const storm: WeatherAlert = { headline: 'Sturmböen', severity: 'moderate', description: '', validUntil: '2026-07-15T17:00:00Z' };
    expect(heatSignal([storm], undefined, '2026-07-15', NOW)).toBeNull();
  });

  it('says warning when the trend reports a heat warning for today', () => {
    expect(heatSignal([], { issued: '2026-07-15', days: [1, 1, 3, 0, 0, 0, 0, 0] }, '2026-07-15', NOW)).toBe('warning');
  });

  it('says outlook for heat within the next four days, and nothing beyond', () => {
    expect(heatSignal([], { issued: '2026-07-15', days: [0, 0, 3, 0, 0, 0, 0, 0] }, '2026-07-15', NOW)).toBe('outlook');
    expect(heatSignal([], { issued: '2026-07-15', days: [0, 0, 0, 2, 0, 0, 0, 0] }, '2026-07-15', NOW)).toBe('outlook');
    expect(heatSignal([], { issued: '2026-07-15', days: [0, 0, 0, 0, 3, 3, 0, 0] }, '2026-07-15', NOW)).toBeNull();
  });

  it('reads yesterday\'s trend from today on', () => {
    // Issued yesterday: its day 1 is today
    expect(heatSignal([], { issued: '2026-07-14', days: [3, 0, 0, 0, 0, 0, 0, 0] }, '2026-07-15', NOW)).toBeNull();
    expect(heatSignal([], { issued: '2026-07-14', days: [0, 2, 0, 0, 0, 0, 0, 0] }, '2026-07-15', NOW)).toBe('warning');
  });

  it('says nothing without heat, for a trend from the future, or one too old', () => {
    expect(heatSignal([], { issued: '2026-07-15', days: [0, 0, 0, 0, 0, 0, 0, 0] }, '2026-07-15', NOW)).toBeNull();
    expect(heatSignal([], { issued: '2026-07-16', days: [3, 3, 3, 3, 3, 3, 3, 3] }, '2026-07-15', NOW)).toBeNull();
    expect(heatSignal([], { issued: '2026-07-01', days: [3, 3, 3, 3, 3, 3, 3, 3] }, '2026-07-15', NOW)).toBeNull();
  });
});
