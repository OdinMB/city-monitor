import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { FloodStatus } from '../../lib/api.js';
import { FloodStatusStrip } from './FloodStatusStrip.js';

const DATA: FloodStatus = {
  gauges: [
    {
      id: 'BY_16005701', name: 'München', waterBody: 'Isar', upstream: false, floodClass: 0,
      stateLabel: 'Keine Meldestufe', measuredAt: '2026-11-01T20:30:00+01:00',
      url: 'https://www.hnd.bayern.de/search/go?suche=pegel&id=16005701',
    },
    {
      id: 'BY_16004403', name: 'Puppling', waterBody: 'Isar', upstream: true, floodClass: 2,
      stateLabel: 'Meldestufe 2', measuredAt: '2026-11-01T20:30:00+01:00', url: null,
    },
  ],
  alerts: [],
  updated: '2026-11-01T20:41:47+01:00',
};

let data: FloodStatus | null = DATA;

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'muenchen', name: 'München' }),
}));

vi.mock('../../hooks/useFloodStatus.js', () => ({
  useFloodStatus: () => ({ data, fetchedAt: '2026-11-01T19:42:00Z', isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe('FloodStatusStrip', () => {
  afterEach(async () => {
    cleanup();
    data = DATA;
    await i18n.changeLanguage('en');
  });

  it('shows each gauge’s class in words, the state’s Meldestufe above class 0, and the upstream gauge marked', () => {
    render(<FloodStatusStrip />);
    expect(screen.getByText('No flood')).toBeTruthy();
    expect(screen.getByText('Moderate flood')).toBeTruthy();
    expect(screen.getByText('Meldestufe 2')).toBeTruthy();
    expect(screen.queryByText('Keine Meldestufe')).toBeNull();
    expect(screen.getByText('Upstream')).toBeTruthy();
    expect(screen.getByText('No flood warnings in force')).toBeTruthy();
  });

  it.each(['en', 'de', 'tr', 'ar'])('credits the LHP word for word as a link and shows the Stand in German time (%s)', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<FloodStatusStrip />);
    const credit = screen.getByRole('link', { name: 'Datenquelle: www.hochwasserzentralen.de' });
    expect(credit.getAttribute('href')).toBe('https://www.hochwasserzentralen.de');
    expect(screen.getByText('01.11.2026 20:41')).toBeTruthy();
  });

  it('lists active warnings, highest first as sent, with their area', () => {
    data = {
      ...DATA,
      alerts: [
        { id: 'A', headline: 'Hochwasserwarnung vor Ausuferungen', area: 'Stadt München', level: 4, levelName: 'Hochwasser', url: 'https://www.hnd.bayern.de' },
        { id: 'B', headline: 'Vorwarnung', area: 'Lkr. München', level: 2, levelName: 'Vorwarnung', url: 'javascript:alert(1)' },
      ],
    };
    render(<FloodStatusStrip />);
    const list = screen.getByRole('list', { name: 'Flood warnings' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Hochwasserwarnung vor Ausuferungen' }).getAttribute('href')).toBe('https://www.hnd.bayern.de');
    // A non-web link is not rendered as one
    expect(screen.queryByRole('link', { name: 'Vorwarnung' })?.getAttribute('href') ?? null).toBeNull();
    expect(screen.getByText('Stadt München')).toBeTruthy();
    expect(screen.queryByText('No flood warnings in force')).toBeNull();
  });

  it('says a gauge has no current data', () => {
    data = { ...DATA, gauges: [{ ...DATA.gauges[0]!, floodClass: null, stateLabel: null }] };
    render(<FloodStatusStrip />);
    expect(screen.getByText('No current data')).toBeTruthy();
  });

  it('shows the empty message without data', () => {
    data = null;
    render(<FloodStatusStrip />);
    expect(screen.getByText('No flood data')).toBeTruthy();
  });
});
