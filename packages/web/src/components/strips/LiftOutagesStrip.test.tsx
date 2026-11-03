import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { LiftOutage, LiftOutageData } from '../../lib/api.js';
import { LiftOutagesStrip } from './LiftOutagesStrip.js';

const lift = (n: number): LiftOutage => ({
  id: `0${10 + n}-01`, kind: 'lift', station: `Station ${n}`, unit: 'Aufzug 01', lat: null, lon: null, info: null,
});
const escalator = (id: string, station: string): LiftOutage => ({
  id, kind: 'escalator', station, unit: 'Fahrtreppe 51', lat: null, lon: null, info: null,
});

const DATA: LiftOutageData = {
  outages: [
    ...[1, 2, 3, 4, 5, 6].map(lift),
    escalator('011-51', 'Dom/HBf.'), escalator('011-52', 'Dom/HBf.'), escalator('081-51', 'Heumarkt/alt'),
  ],
  updated: '2026-11-02T04:12:28+01:00',
};

let data: LiftOutageData | null = DATA;

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'koeln', name: 'Köln', timezone: 'Europe/Berlin' }),
}));

vi.mock('../../hooks/useLiftOutages.js', () => ({
  useLiftOutages: () => ({ data, fetchedAt: '2026-11-02T03:15:00Z', isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('LiftOutagesStrip', () => {
  afterEach(() => {
    cleanup();
    data = DATA;
  });

  it('lists five lifts and counts the escalators by station while collapsed', () => {
    render(<LiftOutagesStrip />);
    expect(screen.getByText('Lifts out of service: 6')).toBeTruthy();
    expect(screen.getByText('Station 5')).toBeTruthy();
    expect(screen.queryByText('Station 6')).toBeNull();
    expect(screen.getByText('+1 more')).toBeTruthy();
    expect(screen.getByText('Escalators out of service: 3')).toBeTruthy();
    expect(screen.getByText('Stations affected: 2')).toBeTruthy();
  });

  it('lists every lift and each escalator station with its count when expanded', () => {
    render(<LiftOutagesStrip expanded />);
    expect(screen.getByText('Station 6')).toBeTruthy();
    expect(screen.queryByText('+1 more')).toBeNull();
    expect(screen.getByText('Dom/HBf.').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Heumarkt/alt')).toBeTruthy();
  });

  it('says everything works for an empty list, and that there is no data without one', () => {
    data = { outages: [], updated: null };
    render(<LiftOutagesStrip />);
    expect(screen.getByText('All lifts and escalators in service')).toBeTruthy();
    cleanup();

    data = null;
    render(<LiftOutagesStrip />);
    expect(screen.getByText('No outage data')).toBeTruthy();
  });

  it('tags DB stations next to KVB\'s, with DB\'s planned return date', () => {
    const db: LiftOutage = { ...lift(9), id: 'db-1', station: 'Köln Hbf', unit: 'zu Gleis 4/5', operator: 'db', resumeDate: '2026-11-20' };
    data = { outages: [db, lift(1)], updated: null };
    render(<LiftOutagesStrip />);
    const row = screen.getByText('Köln Hbf').closest('li')!;
    expect(row.textContent).toContain('DB');
    expect(row.textContent).toContain('back Nov 20');
    expect(screen.getByText('Station 1').closest('li')!.textContent).not.toContain('DB');
    cleanup();

    // A list of DB stations alone needs no tag
    data = { outages: [db], updated: null };
    render(<LiftOutagesStrip />);
    expect(screen.getByText('Köln Hbf').closest('li')!.textContent).toBe('Köln Hbfzu Gleis 4/5back Nov 20');
  });
});
