import { describe, it, expect } from 'vitest';
import { parseDwdPollenJson } from './ingest-pollen.js';
import type { PollenForecast } from '@city-monitor/shared';

// Minimal DWD response structure for Berlin (region_id=50, partregion_id=-1)
const SAMPLE_DWD_JSON = {
  name: 'Pollenflug-Gefahrenindex',
  sender: 'Deutscher Wetterdienst',
  last_update: '2026-03-04 11:00 Uhr',
  next_update: '2026-03-05 11:00 Uhr',
  legend: {},
  content: [
    {
      region_id: 10,
      region_name: 'Schleswig-Holstein und Hamburg',
      partregion_id: 11,
      partregion_name: 'Inseln und Marschen',
      Pollen: {
        Hasel: { today: '1', tomorrow: '1', dayafter_to: '1' },
        Erle: { today: '2', tomorrow: '2', dayafter_to: '2' },
        Esche: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Birke: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Graeser: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Roggen: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Beifuss: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Ambrosia: { today: '0', tomorrow: '0', dayafter_to: '0' },
      },
    },
    {
      region_id: 10,
      region_name: 'Schleswig-Holstein und Hamburg',
      partregion_id: 12,
      partregion_name: 'Geest, Schleswig-Holstein und Hamburg',
      Pollen: {
        Hasel: { today: '2', tomorrow: '2-3', dayafter_to: '2-3' },
        Erle: { today: '2-3', tomorrow: '2-3', dayafter_to: '2-3' },
        Esche: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Birke: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Graeser: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Roggen: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Beifuss: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Ambrosia: { today: '0', tomorrow: '0', dayafter_to: '0' },
      },
    },
    {
      region_id: 50,
      region_name: 'Brandenburg und Berlin',
      partregion_id: -1,
      partregion_name: '',
      Pollen: {
        Hasel: { today: '2', tomorrow: '2-3', dayafter_to: '2-3' },
        Birke: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Graeser: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Erle: { today: '2-3', tomorrow: '2-3', dayafter_to: '2-3' },
        Esche: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Ambrosia: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Roggen: { today: '0', tomorrow: '0', dayafter_to: '0' },
        Beifuss: { today: '0', tomorrow: '0', dayafter_to: '0' },
      },
    },
  ],
};

describe('parseDwdPollenJson', () => {
  it('extracts Berlin region (id=50, partregion=-1)', () => {
    const result = parseDwdPollenJson(SAMPLE_DWD_JSON, 50, -1);
    expect(result).not.toBeNull();
    expect(result!.region).toBe('Brandenburg und Berlin');
    expect(result!.pollen.Hasel.today).toBe('2');
    expect(result!.pollen.Hasel.tomorrow).toBe('2-3');
    expect(result!.pollen.Erle.today).toBe('2-3');
    expect(result!.pollen.Birke.today).toBe('0');
  });

  it('extracts Hamburg sub-region (id=10, partregion=12)', () => {
    const result = parseDwdPollenJson(SAMPLE_DWD_JSON, 10, 12);
    expect(result).not.toBeNull();
    expect(result!.region).toBe('Geest, Schleswig-Holstein und Hamburg');
    expect(result!.pollen.Hasel.today).toBe('2');
    expect(result!.pollen.Erle.today).toBe('2-3');
  });

  it('extracts updatedAt from last_update field', () => {
    const result = parseDwdPollenJson(SAMPLE_DWD_JSON, 50, -1);
    expect(result!.updatedAt).toBe('2026-03-04 11:00 Uhr');
  });

  it('returns null for unknown region', () => {
    const result = parseDwdPollenJson(SAMPLE_DWD_JSON, 99, -1);
    expect(result).toBeNull();
  });

  it('returns null for wrong partregion', () => {
    // Region 10 exists but partregion 99 does not
    const result = parseDwdPollenJson(SAMPLE_DWD_JSON, 10, 99);
    expect(result).toBeNull();
  });

  it('returns null for empty content', () => {
    const empty = { ...SAMPLE_DWD_JSON, content: [] };
    const result = parseDwdPollenJson(empty, 50, -1);
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON (missing content)', () => {
    const result = parseDwdPollenJson({}, 50, -1);
    expect(result).toBeNull();
  });

  it('maps dayafter_to to dayAfterTomorrow', () => {
    const result = parseDwdPollenJson(SAMPLE_DWD_JSON, 50, -1);
    expect(result!.pollen.Hasel.dayAfterTomorrow).toBe('2-3');
  });

  it('handles all 8 pollen types', () => {
    const result = parseDwdPollenJson(SAMPLE_DWD_JSON, 50, -1) as PollenForecast;
    const types = Object.keys(result.pollen);
    expect(types).toHaveLength(8);
    expect(types).toContain('Hasel');
    expect(types).toContain('Erle');
    expect(types).toContain('Esche');
    expect(types).toContain('Birke');
    expect(types).toContain('Graeser');
    expect(types).toContain('Roggen');
    expect(types).toContain('Beifuss');
    expect(types).toContain('Ambrosia');
  });

  it('handles off-season data (all -1)', () => {
    const offSeason = {
      ...SAMPLE_DWD_JSON,
      content: [{
        region_id: 50,
        region_name: 'Brandenburg und Berlin',
        partregion_id: -1,
        partregion_name: '',
        Pollen: {
          Hasel: { today: '-1', tomorrow: '-1', dayafter_to: '-1' },
          Erle: { today: '-1', tomorrow: '-1', dayafter_to: '-1' },
          Esche: { today: '-1', tomorrow: '-1', dayafter_to: '-1' },
          Birke: { today: '-1', tomorrow: '-1', dayafter_to: '-1' },
          Graeser: { today: '-1', tomorrow: '-1', dayafter_to: '-1' },
          Roggen: { today: '-1', tomorrow: '-1', dayafter_to: '-1' },
          Beifuss: { today: '-1', tomorrow: '-1', dayafter_to: '-1' },
          Ambrosia: { today: '-1', tomorrow: '-1', dayafter_to: '-1' },
        },
      }],
    };
    const result = parseDwdPollenJson(offSeason, 50, -1);
    expect(result).not.toBeNull();
    expect(result!.pollen.Hasel.today).toBe('-1');
    expect(result!.pollen.Graeser.tomorrow).toBe('-1');
  });
});
