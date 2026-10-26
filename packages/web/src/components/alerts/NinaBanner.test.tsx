import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { NinaWarning } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { NinaBanner } from './NinaBanner.js';

const warning: NinaWarning = {
  id: 'dwd.2.49.0.0.276.0.DWD.PVW.1',
  version: 1,
  startDate: '2026-10-26T08:00:00Z',
  severity: 'moderate',
  type: 'Alert',
  source: 'dwd',
  headline: 'Amtliche WARNUNG vor STURMBÖEN',
  description: 'Es treten Sturmböen mit Geschwindigkeiten um 70 km/h auf.',
};

function createWrapper(warnings: NinaWarning[] = [warning]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['nina', 'berlin'], { data: warnings, fetchedAt: new Date().toISOString() });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('NinaBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [warning], fetchedAt: new Date().toISOString() }), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dismisses a warning even when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    render(<NinaBanner />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText(warning.headline)).toBeNull();
  });

  it('remembers a dismissal in storage when it is available', () => {
    render(<NinaBanner />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(JSON.parse(localStorage.getItem('nina-dismissed') ?? '[]')).toEqual([warning.id]);
  });

  it('exposes the expand state of the details toggle', () => {
    render(<NinaBanner />, { wrapper: createWrapper() });

    const toggle = screen.getByRole('button', { name: 'expand' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(warning.description!)).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('collapse');
    expect(screen.getByText(warning.description!)).toBeTruthy();
  });

  it('rings focused controls in the banner text colour, not the accent', () => {
    // jsdom applies no stylesheet, so check the class and the rule it relies on.
    render(<NinaBanner />, { wrapper: createWrapper() });
    expect(screen.getByRole('alert').classList.contains('nina-warning')).toBe(true);

    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../globals.css'), 'utf8');
    const rule = css.match(/\.nina-warning button:focus-visible \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('outline-color: currentColor;');
  });

  describe('compact', () => {
    it('shows a one-line pill with the severity in words, the source for screen readers', () => {
      render(<NinaBanner compact />, { wrapper: createWrapper() });

      const alert = screen.getByRole('alert');
      expect(alert.classList.contains('rounded-full')).toBe(true);
      expect(screen.getByText(warning.headline).parentElement?.classList.contains('truncate')).toBe(true);
      expect(screen.getByText('Moderate').classList.contains('sr-only')).toBe(false);
      expect(screen.getByText('· DWD').classList.contains('sr-only')).toBe(true);
    });

    it('gives the pill buttons a 24px minimum target', () => {
      render(<NinaBanner compact />, { wrapper: createWrapper() });

      for (const name of ['expand', 'Dismiss']) {
        const button = screen.getByRole('button', { name });
        expect(button.classList.contains('min-w-6')).toBe(true);
        expect(button.classList.contains('min-h-6')).toBe(true);
      }
    });

    it('lets a headline-only warning expand to its full headline', () => {
      const headlineOnly: NinaWarning = { ...warning, id: 'headline-only', description: undefined, instruction: undefined };
      render(<NinaBanner compact />, { wrapper: createWrapper([headlineOnly]) });

      const toggle = screen.getByRole('button', { name: 'expand' });
      fireEvent.click(toggle);

      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText(warning.headline).classList.contains('truncate')).toBe(false);
      expect(screen.getByText('DWD · Moderate')).toBeTruthy();
    });

    it('keeps the full banner without a toggle for a headline-only warning', () => {
      const headlineOnly: NinaWarning = { ...warning, id: 'headline-only', description: undefined, instruction: undefined };
      render(<NinaBanner />, { wrapper: createWrapper([headlineOnly]) });

      expect(screen.queryByRole('button', { name: 'expand' })).toBeNull();
      expect(screen.getByText(warning.headline)).toBeTruthy();
    });

    it('expands to the full card with the details', () => {
      render(<NinaBanner compact />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button', { name: 'expand' }));

      const alert = screen.getByRole('alert');
      expect(alert.classList.contains('rounded-full')).toBe(false);
      expect(screen.getByText('DWD · Moderate').classList.contains('sr-only')).toBe(false);
      expect(screen.getByText(warning.description!)).toBeTruthy();
    });

    it('dismisses from the pill', () => {
      render(<NinaBanner compact />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

      expect(screen.queryByText(warning.headline)).toBeNull();
      expect(JSON.parse(localStorage.getItem('nina-dismissed') ?? '[]')).toEqual([warning.id]);
    });
  });
});
