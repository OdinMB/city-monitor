import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CityFeature } from '@city-monitor/shared';
import type { SoilMoistureData } from '../../lib/api.js';
import { SoilMoistureStrip } from './SoilMoistureStrip.js';

// 2026-09-03 … 2026-11-01, drying from 70 to 41 % nFK
const HISTORY = Array.from({ length: 60 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 8, 3 + i)).toISOString().slice(0, 10),
  sandy: 70 - Math.round((i * 29) / 59),
  loamy: 80 - Math.round((i * 29) / 59),
}));

const BERLIN: SoilMoistureData = {
  stations: [
    { id: '433', name: 'Berlin-Tempelhof', date: '2026-11-01', sandy: 34, loamy: 29 },
    { id: '403', name: 'Berlin-Dahlem (FU)', date: '2026-11-01', sandy: 45, loamy: 51 },
  ],
  history: HISTORY,
  watering: {
    dataThrough: '2026-10-31',
    last30Days: { litres: 4238, waterings: 141, trees: 70 },
    season: { year: 2026, litres: 157917, waterings: 3674, trees: 2100 },
    previousSeason: { year: 2025, litres: 170152, waterings: 4630, trees: 2500 },
    topDistricts: [{ district: 'Pankow', litres: 30000 }, { district: 'Mitte', litres: 20000 }],
  },
};

let data: SoilMoistureData | null = BERLIN;
let features: CityFeature[] = ['soilMoisture', 'treeWatering'];

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin', timezone: 'Europe/Berlin', features }),
}));

vi.mock('../../hooks/useSoilMoisture.js', () => ({
  useSoilMoisture: () => ({ data, fetchedAt: new Date().toISOString(), isLoading: false, isError: false, refetch: vi.fn() }),
}));

/** Text without the Unicode isolates that keep figures in order in Arabic. */
const plain = (s: string | null | undefined) => (s ?? '').replace(/[⁦-⁩]/g, '');

describe('SoilMoistureStrip', () => {
  afterEach(() => {
    cleanup();
    data = BERLIN;
    features = ['soilMoisture', 'treeWatering'];
  });

  it('shows the stations\' mean, its level, the trend and a watering teaser', () => {
    const { container } = render(<SoilMoistureStrip />);
    const text = plain(container.textContent);
    expect(text).toContain('41%');
    expect(text).toContain('sandy soil under grass · Nov 1');
    expect(screen.getByRole('img', { name: /41%⁩? — Dry/ })).toBeTruthy();
    expect(text).toContain('Dry');
    expect(text).toContain('Plants are starting to run short of water');
    expect(text).toMatch(/↓\d+ pts in 7 days/);
    expect(text).toContain('↓15 pts in 30 days');
    expect(text).toContain('4,238 litres in the 30 days to Oct 31');
    expect(screen.getByRole('link', { name: 'Datenbasis: Deutscher Wetterdienst, Einzelwerte gemittelt' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gieß den Kiez' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: /last 90 days/ })).toBeNull();
  });

  it('adds the 90-day course, each station and the Gieß den Kiez section when expanded', () => {
    const { container } = render(<SoilMoistureStrip expanded />);
    const text = plain(container.textContent);
    expect(screen.getByRole('img', { name: 'Soil moisture under grass on sandy soil, last 90 days' })).toBeTruthy();
    expect(text).toContain('mean of 2 DWD stations');
    expect(text).toContain('DWD station Berlin-Tempelhof34%');
    expect(text).toContain('On loamy soil: 51%');
    expect(text).toContain('Street trees watered by residents (Gieß den Kiez)');
    expect(text).toContain('2026 so far: 157,917 litres for 2,100 trees');
    expect(text).toContain('Most watered this year: Pankow, Mitte');
  });

  it('says when no watering was logged recently', () => {
    data = { ...BERLIN, watering: { ...BERLIN.watering!, last30Days: { litres: 0, waterings: 0, trees: 0 } } };
    const { container } = render(<SoilMoistureStrip expanded />);
    expect(plain(container.textContent)).toContain('No waterings logged in the 30 days to Oct 31');
  });

  it('shows no watering and the plain DWD note for a single-station city without Gieß den Kiez', () => {
    features = ['soilMoisture'];
    data = { stations: [BERLIN.stations[0]!], history: [{ date: '2026-11-01', sandy: 12, loamy: 20 }], watering: BERLIN.watering };
    const { container } = render(<SoilMoistureStrip expanded />);
    const text = plain(container.textContent);
    expect(text).toContain('Very dry');
    expect(text).not.toContain('Gieß den Kiez');
    expect(text).not.toContain('pts in');
    expect(screen.getByRole('link', { name: 'Quelle: Deutscher Wetterdienst' })).toBeTruthy();
  });

  it('says when there is no data', () => {
    data = null;
    render(<SoilMoistureStrip />);
    expect(screen.getByText('No soil moisture data')).toBeTruthy();
  });
});
