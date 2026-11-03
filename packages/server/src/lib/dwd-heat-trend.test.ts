import { describe, it, expect } from 'vitest';
import { heatTrendDays, heatTrendUrl, parseDwdHeatTrend } from './dwd-heat-trend.js';
import { warnRegionMatcher } from './dwd-warnings.js';

// Shape of hwtrend_20261103.json (all zero in November); Berlin's values made up
const FILE = {
  AUI: { Name: 'Kreis Aurich - Binnenland', Bundesland: '3', Trend: [0, 0, 0, 0, 0, 0, 0, 0] },
  BXX: { Name: 'Land Berlin', Bundesland: '8', Trend: [1, 2, 3, 3, 0, 0, 0, 0] },
  KXX: { Name: 'Stadt Köln', Bundesland: '12', Trend: [0, 0, 0, 0, 0, 0, 0, 0] },
  MXX: { Name: 'Kreis und Stadt München', Bundesland: '16', Trend: [0, 0, 3, 0, 0, 0, 0, 0] },
};

describe('heatTrendUrl / heatTrendDays', () => {
  it('names the file of a day', () => {
    expect(heatTrendUrl('2026-07-15')).toBe('https://opendata.dwd.de/climate_environment/health/forecasts/heat/hwtrend_20260715.json');
  });

  it('counts days on the German clock', () => {
    // 23:30 UTC on 14 July is 01:30 on the 15th in Berlin
    expect(heatTrendDays(new Date('2026-07-14T23:30:00Z'))).toEqual(['2026-07-15', '2026-07-14']);
  });
});

describe('parseDwdHeatTrend', () => {
  it('finds a city-state by its name and a city by its exact warn region', () => {
    expect(parseDwdHeatTrend(FILE, warnRegionMatcher('Berlin'), '2026-07-15')).toEqual({ issued: '2026-07-15', days: [1, 2, 3, 3, 0, 0, 0, 0] });
    expect(parseDwdHeatTrend(FILE, warnRegionMatcher('München', 'Kreis und Stadt München'), '2026-07-15')!.days[2]).toBe(3);
  });

  it('returns null for a missing region or a malformed trend', () => {
    expect(parseDwdHeatTrend(FILE, warnRegionMatcher('Hamburg'), '2026-07-15')).toBeNull();
    expect(parseDwdHeatTrend({ BXX: { Name: 'Land Berlin', Trend: [0, 7] } }, warnRegionMatcher('Berlin'), 'x')).toBeNull();
    expect(parseDwdHeatTrend([], warnRegionMatcher('Berlin'), 'x')).toBeNull();
  });
});
