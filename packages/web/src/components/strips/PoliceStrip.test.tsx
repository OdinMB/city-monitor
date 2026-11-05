import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SafetyReport } from '../../lib/api.js';
import { PoliceStrip, COLLAPSED_REPORTS } from './PoliceStrip.js';

const report = (n: number, extra: Partial<SafetyReport> = {}): SafetyReport => ({
  id: `r${n}`,
  title: `Meldung ${n}`,
  description: '',
  publishedAt: new Date(Date.now() - n * 60_000).toISOString(),
  url: `https://example.org/${n}`,
  ...extra,
});

let data: SafetyReport[] | undefined;

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'muenchen', name: 'München', timezone: 'Europe/Berlin' }),
}));

vi.mock('../../hooks/useSafety.js', () => ({
  useSafety: () => ({ data, fetchedAt: new Date().toISOString(), isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('PoliceStrip', () => {
  afterEach(() => {
    cleanup();
    data = undefined;
  });

  it('lists the newest reports while collapsed and more when expanded, each linked', () => {
    data = Array.from({ length: 8 }, (_, i) => report(i + 1));
    render(<PoliceStrip />);
    expect(screen.getAllByRole('link')).toHaveLength(COLLAPSED_REPORTS);
    expect(screen.getByText('Meldung 1').closest('a')?.getAttribute('href')).toBe('https://example.org/1');
    cleanup();
    render(<PoliceStrip expanded />);
    expect(screen.getAllByRole('link')).toHaveLength(8);
  });

  it('shows the district and marks an AI-estimated place', () => {
    data = [report(1, { district: 'Schwabing', location: { lat: 48.16, lon: 11.58, label: 'Leopoldstraße' } })];
    render(<PoliceStrip />);
    expect(screen.getByText('Schwabing')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Location estimated by AI' })).toBeTruthy();
  });

  it('says so when there are no reports', () => {
    data = [];
    render(<PoliceStrip />);
    expect(screen.getByText('No police reports')).toBeTruthy();
  });
});
