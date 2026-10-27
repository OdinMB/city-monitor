import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import type { ApiResponse, CityConfig, TransitAlert } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { CityContext } from '../../hooks/CityContext.js';
import { hamburg } from '../../config/cities/hamburg.js';
import { staleAfter } from '../../lib/freshness.js';
import { TransitStrip } from './TransitStrip.js';

const ALERT: TransitAlert = {
  id: 't1',
  line: 'U2',
  lines: ['U2'],
  type: 'planned-work',
  severity: 'high',
  message: 'Sperrung: Zugverkehr unterbrochen',
  detail: 'Aufgrund von Bauarbeiten zwischen Alexanderplatz und Ruhleben gesperrt bis 06:00. Bitte nutzen Sie den Schienenersatzverkehrsbusanschluss.',
  station: 'S+U Alexanderplatz Bhf (Berlin)',
  location: { lat: 52.5219, lon: 13.4115 },
  affectedStops: [],
};

/**
 * Berlin by default. `fetchedAt` defaults to now; null is what the API sends
 * when it has no transit data. `city` sets the config directly, for a city
 * that is not active yet.
 */
function createWrapper(
  alerts: TransitAlert[],
  { fetchedAt = new Date().toISOString(), city }: { fetchedAt?: string | null; city?: CityConfig } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const response: ApiResponse<TransitAlert[]> = { data: alerts, fetchedAt };
  queryClient.setQueryData(['transit', city?.id ?? 'berlin'], response);

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {city
          ? <CityContext.Provider value={city}>{children}</CityContext.Provider>
          : <CityProvider cityId="berlin">{children}</CityProvider>}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function rowToggle(message: string): HTMLElement {
  const text = screen.getByText(message);
  const button = text.closest('button');
  if (!button) throw new Error(`no row button for "${message}"`);
  return button;
}

describe('TransitStrip disruption rows', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  });

  afterEach(async () => {
    // Unmount first so the language reset does not re-render outside act().
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('is compact by default: one clamped line, no detail text', () => {
    render(<TransitStrip />, { wrapper: createWrapper([ALERT]) });

    const toggle = rowToggle(ALERT.message);
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.hasAttribute('aria-controls')).toBe(false);
    expect(screen.getByText(ALERT.message).className).toContain('line-clamp-1');
    expect(screen.queryByText(ALERT.detail)).toBeNull();
    expect(screen.queryByText(ALERT.station, { exact: false })).toBeNull();
  });

  it('expands a row in place to the full text and station, and collapses it again', () => {
    render(<TransitStrip />, { wrapper: createWrapper([ALERT]) });

    const toggle = rowToggle(ALERT.message);
    toggle.focus();
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const message = screen.getByText(ALERT.message);
    expect(message.className).not.toContain('line-clamp');
    expect(message.className).toContain('wrap-anywhere');

    const regionId = toggle.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    const region = document.getElementById(regionId!);
    expect(region).not.toBeNull();
    expect(region!.textContent).toContain(ALERT.detail);
    expect(region!.textContent).toContain(`Reported at: ${ALERT.station}`);
    expect(region!.className).toContain('wrap-anywhere');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(ALERT.detail)).toBeNull();
    expect(screen.getByText(ALERT.message).className).toContain('line-clamp-1');
  });

  it('expands rows independently', () => {
    const second: TransitAlert = { ...ALERT, id: 't2', line: 'S1', lines: ['S1'], message: 'Verspätungen', detail: 'Wegen einer Signalstörung kommt es zu Verspätungen von ca. 10 Minuten.' };
    render(<TransitStrip />, { wrapper: createWrapper([ALERT, second]) });

    fireEvent.click(rowToggle(second.message));

    expect(rowToggle(second.message).getAttribute('aria-expanded')).toBe('true');
    expect(rowToggle(ALERT.message).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(second.detail)).toBeTruthy();
    expect(screen.queryByText(ALERT.detail)).toBeNull();
  });

  it('does not repeat the remark text when it equals the summary', () => {
    const plain: TransitAlert = { ...ALERT, detail: ALERT.message };
    render(<TransitStrip />, { wrapper: createWrapper([plain]) });

    fireEvent.click(rowToggle(plain.message));

    expect(screen.getAllByText(plain.message)).toHaveLength(1);
    expect(screen.getByText(plain.station, { exact: false })).toBeTruthy();
  });

  it.each([
    // White 12px bold text needs 4.5:1 (WCAG 1.4.3). The badges have no dark
    // variant, so each pair is the same in both themes.
    ['U2', ['bg-blue-600', 'text-white']], // 5.3:1
    ['S1', ['bg-green-700', 'text-white']], // 4.9:1 (green-600 was 3.2:1)
    ['M10', ['bg-red-600', 'text-white']], // 4.8:1
    ['RE1', ['bg-yellow-600', 'text-gray-900']], // 6.1:1 (white was 2.9:1)
    ['100', ['bg-yellow-600', 'text-gray-900']],
  ])('gives the %s line badge colours at 4.5:1', (line, classes) => {
    render(<TransitStrip />, { wrapper: createWrapper([{ ...ALERT, line, lines: [line] }]) });
    const badge = screen.getByText(line);
    for (const cls of classes) expect(badge.classList.contains(cls), `${line}: ${badge.className}`).toBe(true);
    expect(badge.classList.contains('bg-green-600')).toBe(false);
    if (classes.includes('text-gray-900')) expect(badge.classList.contains('text-white')).toBe(false);
  });

  it.each(['de', 'en', 'tr', 'ar'])('has a translated station label (%s)', async (lang) => {
    const label = i18n.getResource(lang, 'translation', 'panel.transit.station');
    expect(typeof label).toBe('string');
    expect((label as string).length).toBeGreaterThan(0);

    await i18n.changeLanguage(lang);
    render(<TransitStrip />, { wrapper: createWrapper([ALERT]) });
    fireEvent.click(rowToggle(ALERT.message));
    expect(screen.getByText(`${label as string}:`)).toBeTruthy();
  });
});

describe('TransitStrip all-clear and freshness', () => {
  const MIN = 60_000;
  const NOW = new Date('2026-10-27T06:20:00Z'); // 07:20 in Berlin (CET)
  const FRESH = '2026-10-27T06:12:00Z'; // 07:12 in Berlin, 8 min ago
  const STALE = '2026-10-27T04:12:00Z'; // 05:12 in Berlin, 2 h ago
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * MIN).toISOString();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  it('says all clear, with the time of the check on the city clock, when fresh data has no disruptions', () => {
    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: FRESH }) });

    expect(screen.getByText('All clear — no disruptions')).toBeTruthy();
    expect(screen.getByText('Checked 07:12')).toBeTruthy();
    expect(screen.queryByText(/may be outdated/)).toBeNull();
  });

  it('says there is no transit data, not all clear, before any data has arrived', () => {
    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: null }) });

    expect(screen.getByText('No transit data available')).toBeTruthy();
    expect(screen.queryByText(/All clear/)).toBeNull();
    expect(screen.queryByText(/Checked/)).toBeNull();
  });

  it('says there is no transit data for a city without a transit source', () => {
    // Hamburg has no transit source; the API answers { data: [], fetchedAt: null } for it.
    expect(hamburg.dataSources.transit).toBeUndefined();
    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: null, city: hamburg }) });

    expect(screen.getByText('No transit data available')).toBeTruthy();
    expect(screen.queryByText(/All clear/)).toBeNull();
  });

  it('never says all clear on stale data: an empty list shows the outdated note instead', () => {
    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: STALE }) });

    expect(screen.getByText('Data may be outdated (last checked 05:12)')).toBeTruthy();
    expect(screen.queryByText(/All clear/)).toBeNull();
    expect(screen.queryByText('No transit data available')).toBeNull();
  });

  it('shows stale disruptions with the outdated note above them', () => {
    render(<TransitStrip />, { wrapper: createWrapper([ALERT], { fetchedAt: STALE }) });

    const note = screen.getByText('Data may be outdated (last checked 05:12)');
    const row = rowToggle(ALERT.message);
    expect(note.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/All clear/)).toBeNull();
  });

  it('shows fresh disruptions without a note', () => {
    render(<TransitStrip />, { wrapper: createWrapper([ALERT], { fetchedAt: FRESH }) });

    expect(rowToggle(ALERT.message)).toBeTruthy();
    expect(screen.queryByText(/may be outdated/)).toBeNull();
    expect(screen.queryByText(/All clear/)).toBeNull();
  });

  it('turns all clear into the outdated note once the data is older than the transit threshold', () => {
    const limit = staleAfter('transit') / MIN;

    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: minutesAgo(limit) }) });
    expect(screen.getByText('All clear — no disruptions')).toBeTruthy();
    cleanup();

    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: minutesAgo(limit + 1) }) });
    expect(screen.queryByText(/All clear/)).toBeNull();
    expect(screen.getByText(/^Data may be outdated \(last checked \d\d:\d\d\)$/)).toBeTruthy();
  });

  it('dates the last check when it was not today', () => {
    const twoDaysAgo = '2026-10-25T04:12:00Z';
    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: twoDaysAgo }) });

    const when = new Date(twoDaysAgo).toLocaleString('en', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin',
    });
    expect(screen.getByText(`Data may be outdated (last checked ${when})`)).toBeTruthy();
  });

  it.each(['de', 'en', 'tr', 'ar'])('has each state translated (%s)', async (lang) => {
    for (const key of ['allClear', 'checkedAt', 'noData', 'mayBeOutdated']) {
      const value = i18n.getResource(lang, 'translation', `panel.transit.${key}`);
      expect(typeof value, `${lang}: panel.transit.${key}`).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
      if (key === 'checkedAt' || key === 'mayBeOutdated') expect(value).toContain('{{time}}');
    }

    await i18n.changeLanguage(lang);
    const time = new Date(FRESH).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' });
    const staleTime = new Date(STALE).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' });

    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: FRESH }) });
    expect(screen.getByText(i18n.t('panel.transit.allClear'))).toBeTruthy();
    expect(screen.getByText(i18n.t('panel.transit.checkedAt', { time }))).toBeTruthy();
    cleanup();

    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: null }) });
    expect(screen.getByText(i18n.t('panel.transit.noData'))).toBeTruthy();
    cleanup();

    render(<TransitStrip />, { wrapper: createWrapper([], { fetchedAt: STALE }) });
    expect(screen.getByText(i18n.t('panel.transit.mayBeOutdated', { time: staleTime }))).toBeTruthy();
    expect(document.body.textContent).not.toContain('panel.transit');
  });
});
