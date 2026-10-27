import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import i18n from 'i18next';
import type { NinaWarning } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { NinaBanner } from './NinaBanner.js';

// Hamburg is configured but not active; let it render here, for switching cities.
vi.mock('../../config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/index.js')>();
  const { hamburg } = await import('../../config/cities/hamburg.js');
  return { ...actual, getCityConfig: (id: string) => (id === 'hamburg' ? hamburg : actual.getCityConfig(id)) };
});

const moderate: NinaWarning = {
  id: 'mow.DE-BE-TEST-1',
  version: 1,
  startDate: '2026-10-26T08:00:00Z',
  severity: 'moderate',
  type: 'Alert',
  source: 'mowas',
  headline: '[Synthetisch] Rauchentwicklung in Mitte',
  description: 'Es kommt zu starker Rauchentwicklung.',
  instruction: 'Halten Sie Fenster und Türen geschlossen.',
};

const severe: NinaWarning = {
  id: 'mow.DE-BE-TEST-2',
  version: 1,
  startDate: '2026-10-26T09:00:00Z',
  severity: 'severe',
  type: 'Alert',
  source: 'mowas',
  headline: '[Synthetisch] Probewarnung Sturm: Aufenthalt im Freien meiden',
  description: 'Synthetische Warnung für die lokale Entwicklung.',
  instruction: 'Meiden Sie den Aufenthalt im Freien.',
};

const KEY = 'nina-dismissed';

function stored(): unknown {
  const raw = localStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
}

function setup(warnings: NinaWarning[] | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (warnings) queryClient.setQueryData(['nina', 'berlin'], { data: warnings, fetchedAt: new Date().toISOString() });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(<NinaBanner />, { wrapper });
  // React Query tells its observers in a later task, so let act wait for one.
  const serve = (next: NinaWarning[]) =>
    act(async () => {
      queryClient.setQueryData(['nina', 'berlin'], { data: next, fetchedAt: new Date().toISOString() });
      await new Promise((done) => setTimeout(done, 0));
    });
  return { ...view, serve };
}

describe('NinaBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    // Keep the query on the data each test sets: a refetch would replace it.
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
  });

  afterEach(async () => {
    // Unmount first, so switching the language back re-renders nothing.
    cleanup();
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
  });

  describe('dismissing', () => {
    it('dismisses a warning even when browser storage is blocked', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      setup([moderate]);

      fireEvent.click(screen.getByRole('button', { name: `Dismiss: ${moderate.headline}` }));

      expect(screen.queryByText(moderate.headline)).toBeNull();
    });

    it('shows the warnings when reading browser storage fails', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      setup([moderate]);

      expect(screen.getByText(moderate.headline)).toBeTruthy();
    });

    it('remembers a dismissal of this version of the warning, for this city', () => {
      setup([moderate]);

      fireEvent.click(screen.getByRole('button', { name: `Dismiss: ${moderate.headline}` }));

      expect(stored()).toEqual({ berlin: [`${moderate.id}@1`] });
    });

    it("keeps another tab's dismissal when this tab dismisses one", () => {
      setup([moderate, severe]);
      // Another tab, open since before, dismissed the severe warning.
      localStorage.setItem(KEY, JSON.stringify({ berlin: [`${severe.id}@1`] }));

      fireEvent.click(screen.getByRole('button', { name: `Dismiss: ${moderate.headline}` }));

      expect(stored()).toEqual({ berlin: [`${severe.id}@1`, `${moderate.id}@1`] });
    });

    it('keeps a dismissed warning hidden on the next visit', () => {
      localStorage.setItem(KEY, JSON.stringify({ berlin: [`${moderate.id}@1`] }));
      setup([moderate, severe]);

      expect(screen.queryByText(moderate.headline)).toBeNull();
      expect(screen.getByText(severe.headline)).toBeTruthy();
    });

    it('shows a dismissed warning again when it is updated', async () => {
      const { serve } = setup([moderate]);
      fireEvent.click(screen.getByRole('button', { name: `Dismiss: ${moderate.headline}` }));
      expect(screen.queryByText(moderate.headline)).toBeNull();

      await serve([{ ...moderate, version: 2 }]);

      expect(screen.getByText(moderate.headline)).toBeTruthy();
    });

    it('forgets dismissals of warnings that are no longer listed', async () => {
      localStorage.setItem(KEY, JSON.stringify({ berlin: ['mow.ended@3', `${moderate.id}@1`] }));
      const { serve } = setup([moderate]);

      expect(stored()).toEqual({ berlin: [`${moderate.id}@1`] });

      await serve([]);

      expect(stored()).toBeNull();
    });

    it("leaves another city's dismissals alone", () => {
      localStorage.setItem(KEY, JSON.stringify({ hamburg: ['mow.hamburg@1'], berlin: ['mow.ended@1'] }));
      setup([moderate]);

      expect(stored()).toEqual({ hamburg: ['mow.hamburg@1'] });
    });

    it("keeps a city's dismissals while its warnings load after a switch from another city", () => {
      localStorage.setItem(KEY, JSON.stringify({ hamburg: ['mow.hamburg@1'] }));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      queryClient.setQueryData(['nina', 'berlin'], { data: [moderate], fetchedAt: new Date().toISOString() });
      const page = (cityId: string) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <CityProvider cityId={cityId}><NinaBanner /></CityProvider>
          </MemoryRouter>
        </QueryClientProvider>
      );
      const { rerender } = render(page('berlin'));

      // Until Hamburg's list arrives, the query keeps Berlin's on screen.
      rerender(page('hamburg'));

      expect(stored()).toEqual({ hamburg: ['mow.hamburg@1'] });
    });

    it('keeps its dismissals while the warnings are still loading', () => {
      localStorage.setItem(KEY, JSON.stringify({ berlin: [`${moderate.id}@1`] }));
      setup(undefined);

      expect(stored()).toEqual({ berlin: [`${moderate.id}@1`] });
    });

    it('shows warnings dismissed under the old list of bare ids, and drops that list', () => {
      localStorage.setItem(KEY, JSON.stringify([moderate.id]));
      setup([moderate]);

      expect(screen.getByText(moderate.headline)).toBeTruthy();
      expect(stored()).toBeNull();
    });
  });

  describe('how much of a warning shows', () => {
    it('opens a severe warning with what to do visible', () => {
      setup([severe]);

      expect(screen.getByText(severe.instruction!)).toBeTruthy();
      const toggle = screen.getByRole('button', { name: `Hide what to do: ${severe.headline}` });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('opens an extreme warning with what to do visible', () => {
      setup([{ ...severe, severity: 'extreme' }]);

      expect(screen.getByText(severe.instruction!)).toBeTruthy();
    });

    it('keeps a moderate warning to its headline until it is expanded', () => {
      setup([moderate]);

      const toggle = screen.getByRole('button', { name: `Show what to do: ${moderate.headline}` });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText(moderate.instruction!)).toBeNull();
      expect(screen.queryByText(moderate.description!)).toBeNull();
      // jsdom does no layout: the headline is cut to one line by its class.
      expect(screen.getByText(moderate.headline).classList.contains('truncate')).toBe(true);

      fireEvent.click(toggle);

      expect(screen.getByText(moderate.headline).classList.contains('truncate')).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.getAttribute('aria-label')).toBe(`Hide what to do: ${moderate.headline}`);
      expect(screen.getByText(moderate.instruction!)).toBeTruthy();
      expect(screen.getByText(moderate.description!)).toBeTruthy();
    });

    it('keeps a minor notice to its headline', () => {
      setup([{ ...moderate, severity: 'minor' }]);

      expect(screen.queryByText(moderate.instruction!)).toBeNull();
    });

    it('keeps an all-clear compact, whatever its severity', () => {
      setup([{ ...severe, type: 'Cancel' }]);

      expect(screen.queryByText(severe.instruction!)).toBeNull();
    });

    it('names the toggle after the details when a warning has no instruction', () => {
      setup([{ ...moderate, instruction: undefined }]);

      fireEvent.click(screen.getByRole('button', { name: `Show details: ${moderate.headline}` }));

      expect(screen.getByRole('button', { name: `Hide details: ${moderate.headline}` })).toBeTruthy();
    });

    it('announces only severe and extreme warnings as alerts', () => {
      setup([moderate, severe]);

      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent).toContain(severe.headline);
    });
  });

  describe('language', () => {
    it.each(['de', 'tr', 'ar'])('names the buttons after the warning in %s', async (lng) => {
      await i18n.changeLanguage(lng);
      setup([moderate]);

      const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '');
      expect(names).toHaveLength(2);
      for (const name of names) {
        expect(name).toContain(moderate.headline);
        expect(name).not.toMatch(/Show what to do|Dismiss|nina\./);
      }
    });

    it('says the text is the official German text outside German', async () => {
      setup([severe]);
      expect(screen.getByText('Official text in German', { exact: false })).toBeTruthy();

      await act(() => i18n.changeLanguage('de'));
      expect(screen.queryByText('Amtlicher Text auf Deutsch', { exact: false })).toBeNull();
    });

    it('says so in a compact warning once it is expanded', () => {
      setup([moderate]);
      expect(screen.queryByText('Official text in German', { exact: false })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: `Show what to do: ${moderate.headline}` }));

      expect(screen.getByText('Official text in German', { exact: false })).toBeTruthy();
    });

    it('isolates the German text and marks its language, so it keeps its word order in Arabic', () => {
      // Bidi moved the neutral characters of "[Synthetisch] Probewarnung, es
      // besteht keine Gefahr" around in a right-to-left banner.
      setup([moderate, severe]);
      fireEvent.click(screen.getByRole('button', { name: `Show what to do: ${moderate.headline}` }));

      // A compact headline is cut to one line, so it runs in its own direction
      // and the "…" lands at its end.
      const compact = screen.getByText(moderate.headline);
      expect(compact.getAttribute('dir')).toBe('auto');
      for (const text of [severe.headline, severe.instruction!, severe.description!, moderate.instruction!, moderate.description!]) {
        expect(screen.getByText(text).tagName).toBe('BDI');
      }
      for (const text of [moderate.headline, severe.headline, severe.instruction!, moderate.description!]) {
        expect(screen.getByText(text).getAttribute('lang')).toBe('de');
      }
    });
  });

  it('renders nothing when there are no warnings', () => {
    const { container } = setup([]);

    expect(container.innerHTML).toBe('');
  });

  it('rings focused controls in the banner text colour, not the accent', () => {
    // jsdom applies no stylesheet, so check the class and the rule it relies on.
    const { container } = setup([moderate]);
    expect(container.querySelector('.nina-warning')).toBeTruthy();

    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../globals.css'), 'utf8');
    const rule = css.match(/\.nina-warning button:focus-visible \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('outline-color: currentColor;');
  });
});
