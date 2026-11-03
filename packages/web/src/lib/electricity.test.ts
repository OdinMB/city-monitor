import { describe, it, expect } from 'vitest';
import type { GridPoint, GridSignal } from './api';
import { co2Now, gridPointAt, greenestHour, groupMix, nextGreenWindow } from './electricity';

const START = Date.parse('2026-11-02T23:00:00Z'); // 00:00 in Berlin
const QH = 15 * 60_000;

/** Quarter-hours from START with these signals and shares; CO₂ measured for the first `measured`. */
function grid(signals: GridSignal[], shares?: number[], measured = 0): GridPoint[] {
  return signals.map((signal, i) => ({
    t: new Date(START + i * QH).toISOString(),
    share: shares?.[i] ?? 30,
    signal,
    co2: i < measured ? 500 - i : null,
    co2Forecast: 520 - i,
  }));
}

describe('gridPointAt', () => {
  it('finds the quarter-hour holding now, and none before or after the grid', () => {
    const g = grid([0, 1, 2]);
    expect(gridPointAt(g, START + QH + 60_000)).toBe(g[1]);
    expect(gridPointAt(g, START - 1)).toBeNull();
    expect(gridPointAt(g, START + 3 * QH)).toBeNull();
  });
});

describe('co2Now', () => {
  it('takes the newest measured value while it is recent', () => {
    expect(co2Now(grid([0, 0, 0, 0], undefined, 2), START + 3 * QH))
      .toEqual({ value: 499, t: new Date(START + QH).toISOString(), forecast: false });
  });

  it('takes the forecast for now when no measurement is recent', () => {
    const g = grid(Array(12).fill(0), undefined, 1);
    expect(co2Now(g, START + 10 * QH)).toEqual({ value: 510, t: new Date(START + 10 * QH).toISOString(), forecast: true });
    expect(co2Now(grid([0, 0]), START)).toEqual({ value: 520, t: new Date(START).toISOString(), forecast: true });
  });
});

describe('nextGreenWindow', () => {
  it('finds the next run of green quarter-hours', () => {
    expect(nextGreenWindow(grid([0, 1, 2, 2, 1, 2]), START)).toEqual({
      start: new Date(START + 2 * QH).toISOString(),
      end: new Date(START + 4 * QH).toISOString(),
    });
  });

  it('starts with the current quarter-hour when it is green, and skips green gone by', () => {
    expect(nextGreenWindow(grid([2, 0, 2, 2, 0]), START + 2 * QH + 1)).toEqual({
      start: new Date(START + 2 * QH).toISOString(),
      end: new Date(START + 4 * QH).toISOString(),
    });
  });

  it('is null when no green is forecast', () => {
    expect(nextGreenWindow(grid([2, 0, 1]), START + QH)).toBeNull();
    expect(nextGreenWindow([], START)).toBeNull();
  });
});

describe('greenestHour', () => {
  it('picks the four quarter-hours ahead with the highest mean share', () => {
    const shares = [90, 90, 90, 90, 20, 40, 60, 60, 60, 60, 10];
    const g = grid(Array(shares.length).fill(1), shares);
    expect(greenestHour(g, START + QH)).toEqual({ start: new Date(START + QH).toISOString(), share: 72.5 });
    // Past the high hour: 20,40,60,60 … 60,60,60,60 … 60,60,60,10
    expect(greenestHour(g, START + 4 * QH)).toEqual({ start: new Date(START + 6 * QH).toISOString(), share: 60 });
    expect(greenestHour(g, START)).toEqual({ start: new Date(START).toISOString(), share: 90 });
    expect(greenestHour(g, START + 8 * QH)).toBeNull();
  });
});

describe('groupMix', () => {
  it('groups the kinds, renewables first, and leaves out groups with no output', () => {
    const groups = groupMix({
      at: '2026-11-03T00:30:00.000Z',
      mw: { windOnshore: 300, windOffshore: 100, solar: 0, hydro: 40, otherRenewable: 10, lignite: 400, hardCoal: 100, gas: 50 },
      renewableShare: 45,
    });
    expect(groups.map((g) => [g.group, g.mw, g.share, g.renewable])).toEqual([
      ['wind', 400, 40, true], ['hydro', 50, 5, true], ['gas', 50, 5, false], ['coal', 500, 50, false],
    ]);
  });
});
