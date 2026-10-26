import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/CityProvider.js';
import { Shell } from './Shell.js';

const news = {
  items: [
    { id: '1', title: 'First headline', url: 'https://example.com/1', sourceName: 'Source A', publishedAt: '2026-10-26T08:00:00Z', category: 'local', tier: 1 },
  ],
  categories: {},
  updatedAt: '2026-10-26T08:00:00Z',
};

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['news', 'digest', 'berlin'], { data: news, fetchedAt: new Date().toISOString() });
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

describe('Shell top bar', () => {
  const originalMatchMedia = window.matchMedia;
  // Restore only this spy: restoreAllMocks would also strip the ResizeObserver
  // mock from test-setup.ts, which Shell needs.
  let fetchSpy: { mockRestore: () => void };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(null), { status: 200 }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    fetchSpy.mockRestore();
  });

  it('keeps the bar and ticker in the page flow on a phone and publishes their height', () => {
    setViewport('phone');
    const { container } = render(<Shell><div /></Shell>, { wrapper: createWrapper() });

    const block = container.querySelector<HTMLElement>('.topbar-slide')!;
    expect(block.classList.contains('sticky')).toBe(true);
    expect(block.classList.contains('fixed')).toBe(false);
    expect(block.style.transform).toBe('');
    expect(block.querySelector('header')).toBeTruthy();
    expect(block.querySelector('[role="marquee"]')).toBeTruthy();
    // jsdom has no layout: the block measures 0px
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--phone-header-h')).toBe('0px');
  });

  it('slides the bar and ticker in on scroll from tablet width up', () => {
    setViewport('tablet');
    const { container } = render(<Shell><div /></Shell>, { wrapper: createWrapper() });

    const block = container.querySelector<HTMLElement>('.topbar-slide')!;
    expect(block.classList.contains('fixed')).toBe(true);
    expect(block.style.transform).toMatch(/^translateY\(/);
    expect(block.querySelector('[role="marquee"]')).toBeTruthy();
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--phone-header-h')).toBe('');
  });
});
