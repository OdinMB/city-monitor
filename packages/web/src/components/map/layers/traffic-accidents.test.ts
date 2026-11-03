import { describe, expect, it } from 'vitest';
import type { TrafficAccident } from '../../../lib/api.js';
import { countBySeverity, matchesAccidentFilter } from './traffic-accidents';

// [lon, lat, severity, month, weekday, hour, kind, type, participants]
const BIKE_AND_CAR: TrafficAccident = [13.4, 52.5, 2, 5, 6, 17, 5, 2, 1 | 2];
const PEDESTRIAN: TrafficAccident = [13.4, 52.5, 1, 1, 1, 23, 6, 4, 4];
const CARS: TrafficAccident = [13.4, 52.5, 3, 3, 4, 8, 2, 6, 2];
const ALL = [BIKE_AND_CAR, PEDESTRIAN, CARS, CARS];

describe('accident filter', () => {
  it('keeps accidents with a bicycle, with a pedestrian, or all', () => {
    expect(ALL.filter((a) => matchesAccidentFilter(a, 'bike'))).toEqual([BIKE_AND_CAR]);
    expect(ALL.filter((a) => matchesAccidentFilter(a, 'pedestrian'))).toEqual([PEDESTRIAN]);
    expect(ALL.filter((a) => matchesAccidentFilter(a, 'all'))).toHaveLength(4);
  });

  it('counts the filtered accidents per severity', () => {
    expect(countBySeverity(ALL, 'all')).toEqual([0, 1, 1, 2]);
    expect(countBySeverity(ALL, 'bike')).toEqual([0, 0, 1, 0]);
  });
});
