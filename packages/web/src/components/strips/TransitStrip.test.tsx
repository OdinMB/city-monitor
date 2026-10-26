import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import type { ApiResponse, TransitAlert } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
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

function createWrapper(alerts: TransitAlert[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const response: ApiResponse<TransitAlert[]> = { data: alerts, fetchedAt: new Date().toISOString() };
  queryClient.setQueryData(['transit', 'berlin'], response);

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
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
