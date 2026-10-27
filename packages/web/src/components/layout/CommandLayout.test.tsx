import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { NinaWarning } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { CommandLayout } from './CommandLayout.js';

// Only where the warnings sit matters here, not the map itself.
vi.mock('../map/CityMap.js', () => ({ CityMap: () => <div /> }));

const severe: NinaWarning = {
  id: 'mow.DE-BE-TEST-2',
  version: 1,
  startDate: '2026-10-26T09:00:00Z',
  severity: 'severe',
  type: 'Alert',
  source: 'mowas',
  headline: '[Synthetisch] Probewarnung Sturm: Aufenthalt im Freien meiden',
  instruction: 'Meiden Sie den Aufenthalt im Freien.',
};

const minor: NinaWarning = { ...severe, id: 'mow.DE-BE-TEST-1', severity: 'minor', headline: '[Synthetisch] Probewarnung' };

/** A second severe warning with a long text, as real ones often have. */
const longSevere: NinaWarning = {
  ...severe,
  id: 'mow.DE-BE-TEST-3',
  severity: 'extreme',
  headline: '[Synthetisch] Großbrand in einer Lagerhalle: starke Rauchentwicklung in mehreren Bezirken',
  instruction: 'Halten Sie Fenster und Türen geschlossen. Schalten Sie Lüftungs- und Klimaanlagen ab. '.repeat(4).trim(),
  description: 'Synthetische Warnung für die lokale Entwicklung. Es besteht keine Gefahr. '.repeat(12).trim(),
};

function createWrapper(warnings: NinaWarning[]) {
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

/** useIsDesktop() asks for (min-width: 640px); every other query stays false. */
function setViewport(width: 'phone' | 'tablet') {
  window.matchMedia = ((query: string) => ({
    matches: width === 'tablet' && query === '(min-width: 640px)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

// The whole layout renders every tile, which can pass 5s while the full suite
// runs in parallel.
describe('CommandLayout warnings', { timeout: 30_000 }, () => {
  const originalMatchMedia = window.matchMedia;
  let fetchSpy: { mockRestore: () => void };

  beforeEach(() => {
    localStorage.clear();
    // Every other tile stays loading; the warnings come from the cache.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    fetchSpy.mockRestore();
  });

  it.each(['phone', 'tablet'] as const)('puts the warnings above the map on a %s, once', (width) => {
    setViewport(width);
    const { container } = render(<CommandLayout />, { wrapper: createWrapper([severe, minor]) });

    const cards = container.querySelectorAll('.nina-warning');
    expect(cards).toHaveLength(2);
    // The layer drawer's handle sits on the map.
    const onMap = screen.getByRole('button', { name: 'Toggle layers panel' });
    for (const card of cards) expect(follows(card, onMap)).toBe(true);
  });

  it('lets long and several warnings scroll in their own area from tablet width up, leaving the map the rest', () => {
    // jsdom does no layout, so this checks the classes the hero relies on.
    setViewport('tablet');
    const { container } = render(<CommandLayout />, { wrapper: createWrapper([longSevere, severe]) });

    const slot = container.querySelector<HTMLElement>('.hero-warnings')!;
    expect(slot.querySelectorAll('.nina-warning')).toHaveLength(2);
    expect(screen.getByText(longSevere.description!)).toBeTruthy();
    const classes = slot.className.split(/\s+/);
    // A ceiling (55% of the hero with the ticker clearance), and scrolling beyond it.
    expect(classes).toEqual(expect.arrayContaining(['max-h-[calc(55%_-_3rem)]', 'overflow-y-auto', 'shrink-0']));
    // The ticker clearance is a margin, outside the scrolling area.
    expect(classes).toContain('mt-12');
    expect(classes.some((c) => /^p[ty]-/.test(c))).toBe(false);
    // The map takes what is left.
    const map = slot.nextElementSibling!;
    expect(map.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']));
  });

  it('moves the warnings with the map when the page scrolls', async () => {
    // useScrollParallax runs from 1024px (jsdom's window is 1024 wide).
    setViewport('tablet');
    const { container } = render(<CommandLayout />, { wrapper: createWrapper([severe]) });
    const slot = container.querySelector<HTMLElement>('.hero-warnings')!;
    const column = slot.parentElement!;
    expect(column.contains(screen.getByRole('button', { name: 'Toggle layers panel' }))).toBe(true);

    const scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });
    try {
      window.dispatchEvent(new Event('scroll'));
      await waitFor(() => expect(column.style.transform).toBe('translateY(30px)'));
    } finally {
      if (scrollY) Object.defineProperty(window, 'scrollY', scrollY);
      else delete (window as { scrollY?: number }).scrollY;
    }
  });

  it('keeps the space above the tiles from tablet width up, warnings or not', () => {
    setViewport('tablet');
    const { container } = render(<CommandLayout />, { wrapper: createWrapper([]) });
    expect(container.querySelector('.h-hero')!.nextElementSibling!.classList.contains('pt-4')).toBe(true);
  });

  it('drops the layer drawer panel’s ticker clearance while warnings are shown', () => {
    // jsdom applies no stylesheet: check the panel's hook and the rule on it.
    setViewport('tablet');
    const { container } = render(<CommandLayout />, { wrapper: createWrapper([severe]) });
    const panel = container.querySelector('.layer-drawer-panel')!;
    expect(container.querySelector('.hero-warnings')!.nextElementSibling!.contains(panel)).toBe(true);

    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../globals.css'), 'utf8');
    expect(css).toMatch(/\.hero-warnings:not\(:empty\) \+ \* \.layer-drawer-panel \{\s*padding-top: 0\.75rem;\s*\}/);
  });

  it('keeps the phone warnings above the news ticker', () => {
    setViewport('phone');
    const { container } = render(<CommandLayout />, { wrapper: createWrapper([severe]) });

    const card = container.querySelector('.nina-warning')!;
    const hero = container.querySelector('.h-hero')!;
    expect(follows(card, hero)).toBe(true);
  });

  it.each(['phone', 'tablet'] as const)('adds nothing on a %s when there are no warnings', (width) => {
    setViewport(width);
    const { container } = render(<CommandLayout />, { wrapper: createWrapper([]) });

    expect(container.querySelector('.nina-warning')).toBeNull();
    // The slot the warnings would fill is empty, so `empty:hidden` takes it out.
    const onMap = screen.getByRole('button', { name: 'Toggle layers panel' });
    const slots = [...container.querySelectorAll('.empty\\:hidden')].filter((el) => follows(el, onMap));
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) expect(slot.childNodes).toHaveLength(0);
  });
});
