import { describe, it, expect } from 'vitest';
import { changeOver, scalePosition, soilMoistureLevel } from './soil-moisture.js';

describe('soilMoistureLevel', () => {
  it.each([
    [12, 'very-dry'], [29.9, 'very-dry'], [30, 'dry'], [49, 'dry'], [50, 'moderate'],
    [79, 'moderate'], [80, 'moist'], [99.9, 'moist'], [100, 'wet'], [116, 'wet'],
  ] as const)('%s %% nFK is %s', (pct, level) => {
    expect(soilMoistureLevel(pct)).toBe(level);
  });
});

describe('changeOver', () => {
  const history = Array.from({ length: 31 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 9, 2 + i)).toISOString().slice(0, 10), // 2026-10-02 … 2026-11-01
    sandy: 70 - i,
    loamy: 80 - i,
  }));

  it('is the sandy-soil change in points from the day `days` before the newest', () => {
    expect(changeOver(history, 7)).toBe(-7);
    expect(changeOver(history, 30)).toBe(-30);
  });

  it('is null without that day or without data', () => {
    expect(changeOver(history, 31)).toBeNull();
    expect(changeOver([], 7)).toBeNull();
  });
});

describe('scalePosition', () => {
  it.each([
    [0, 0], [15, 10], [30, 20], [40, 30], [50, 40], [65, 50], [80, 60], [100, 80], [110, 90], [120, 100], [150, 100], [-5, 0],
  ] as const)('%s %% nFK sits at %s %% of the scale', (pct, pos) => {
    expect(scalePosition(pct)).toBeCloseTo(pos);
  });
});
