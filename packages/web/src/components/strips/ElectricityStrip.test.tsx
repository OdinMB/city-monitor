import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ElectricityData, GridSignal } from '../../lib/api.js';
import { ElectricityStrip } from './ElectricityStrip.js';

const START = Date.parse('2026-11-03T05:00:00Z'); // 06:00 in Berlin
const QH = 15 * 60_000;
const signals: GridSignal[] = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1];

const DATA: ElectricityData = {
  controlArea: '50Hertz',
  mix: {
    at: '2026-11-03T04:15:00.000Z',
    mw: { windOnshore: 3000, windOffshore: 500, solar: 0, biomass: 900, hydro: 100, lignite: 4500, gas: 1000 },
    renewableShare: 45,
  },
  renewableHistory: Array.from({ length: 24 }, (_, i) => ({ t: new Date(START - (24 - i) * 3600_000).toISOString(), share: 30 + i })),
  grid: signals.map((signal, i) => ({
    t: new Date(START + i * QH).toISOString(),
    share: 30 + i * 2,
    signal,
    co2: i === 0 ? 412 : null,
    co2Forecast: 420 - i,
  })),
};

let data: ElectricityData | null = DATA;

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin', timezone: 'Europe/Berlin' }),
}));

vi.mock('../../hooks/useElectricity.js', () => ({
  useElectricity: () => ({ data, fetchedAt: '2026-11-03T05:02:00Z', isLoading: false, isError: false, refetch: vi.fn() }),
}));

/** Text without the Unicode isolates that keep times and figures in order in Arabic. */
const plain = (s: string | null | undefined) => (s ?? '').replace(/[⁦-⁩]/g, '');

describe('ElectricityStrip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START + 10 * 60_000); // 06:10 in Berlin
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    data = DATA;
  });

  it('shows the area\'s renewable share, mix, Germany\'s CO₂ and signal with the next green window', () => {
    const { container } = render(<ElectricityStrip />);
    const text = plain(container.textContent);
    expect(text).toContain('45%');
    expect(text).toContain('renewable share of generation · 50Hertz grid area · 05:15');
    expect(text).toContain('Renewable45%');
    expect(text).toContain('Fossil & other55%');
    expect(screen.getByRole('img', { name: 'Generation mix in the 50Hertz grid area' })).toBeTruthy();
    expect(text).toContain('Wind35%');
    expect(text).toContain('Coal45%');
    expect(text).not.toContain('Solar');
    expect(text).toContain('412 g CO₂/kWh');
    expect(text).toContain('Red: low renewable share');
    expect(text).toContain('Green 08:00–09:30');
    expect(screen.getByRole('link', { name: 'Bundesnetzagentur | SMARD.de' }).getAttribute('href')).toBe('https://www.smard.de/');
    expect(screen.getByRole('link', { name: 'Energy-Charts.info' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toBeTruthy();
    // The 24-hour course and the timeline wait for the expanded tile
    expect(screen.queryByRole('img', { name: /last 24 hours/ })).toBeNull();
  });

  it('adds the 24-hour course, today\'s signal, the greenest hour and power per source when expanded', () => {
    const { container } = render(<ElectricityStrip expanded />);
    const text = plain(container.textContent);
    expect(screen.getByRole('img', { name: 'Renewable share in the 50Hertz grid area, last 24 hours' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Grid signal, Germany, today' })).toBeTruthy();
    expect(text).toContain('Greenest hour ahead: 09:00 (57% renewable)');
    expect(text).toContain('Germany now: 30% of consumption from renewables');
    expect(text).toContain('3.5 GW');
  });

  it('marks CO₂ as a forecast when no recent measurement exists, and says when green is now', () => {
    vi.setSystemTime(START + 9 * QH); // inside the green run, 2¼ hours after the one measurement
    const { container } = render(<ElectricityStrip />);
    const text = plain(container.textContent);
    expect(text).toContain('Green: a good time to use power');
    expect(text).toContain('Green until 09:30');
    expect(text).toContain('411 g CO₂/kWh (forecast)');
  });

  it('says there is no data without any', () => {
    data = null;
    render(<ElectricityStrip />);
    expect(screen.getByText('No electricity data')).toBeTruthy();
  });
});
