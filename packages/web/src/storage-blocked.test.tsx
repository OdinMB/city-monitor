import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { NinaWarning } from '@city-monitor/shared';
import { CityProvider } from './hooks/CityProvider.js';
import { NinaBanner } from './components/alerts/NinaBanner.js';
import { MobileLayerDrawer } from './components/sidebar/MobileLayerDrawer.js';
import { ShortcutToast } from './components/layout/ShortcutToast.js';

/**
 * Browsers that block site data (cookie blocking, some private modes,
 * sandboxed iframes) throw a SecurityError as soon as a page reads the
 * localStorage property; some older private modes hand out the object but
 * throw from its methods. Either way the app must render with its defaults.
 */
type Blocked = 'property' | 'methods';

const securityError = () => new DOMException('The operation is insecure.', 'SecurityError');

function blockStorage(how: Blocked): () => void {
  if (how === 'property') {
    const saved = (['localStorage', 'sessionStorage'] as const).map(
      (name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const,
    );
    for (const [name] of saved) {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => {
          throw securityError();
        },
      });
    }
    return () => {
      for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(window, name, descriptor);
    };
  }
  const spies = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((method) =>
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw securityError();
    }),
  );
  return () => spies.forEach((spy) => spy.mockRestore());
}

function stubColourScheme(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    // index.html writes the query without the space.
    matches: dark && /^\(prefers-color-scheme: ?dark\)$/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** The inline script in index.html that preloads the map style for the stored theme. */
function themePreloadScript(): () => void {
  const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((body) => body.includes("'theme'"));
  if (!script) throw new Error('theme preload script not found in index.html');
  return new Function(script) as () => void;
}

/** Runs the index.html preload script and returns the URL it preloads. */
function runThemePreloadScript(): string {
  const run = themePreloadScript();
  const before = new Set(document.head.querySelectorAll('link[rel="preload"]'));
  run();
  const added = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')].filter(
    (link) => !before.has(link),
  );
  expect(added).toHaveLength(1);
  added[0].remove();
  return added[0].href;
}

const warning: NinaWarning = {
  id: 'dwd.2.49.0.0.276.0.DWD.PVW.1',
  version: 1,
  startDate: '2026-10-26T08:00:00Z',
  severity: 'moderate',
  type: 'Alert',
  source: 'dwd',
  headline: 'Amtliche WARNUNG vor STURMBÖEN',
};

function cityWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['nina', 'berlin'], { data: [warning], fetchedAt: new Date().toISOString() });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The theme store reads storage when its module loads, so the app is imported
// afresh inside each test. Transform the module graph once up front; the
// re-import still evaluates the whole app, hence the longer timeout there.
beforeAll(async () => {
  await import('./App.js');
}, 60_000);

// Spies are restored one by one: vi.restoreAllMocks() would also strip the
// ResizeObserver and maplibre mocks that test-setup.ts installs.
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

describe.each(['property', 'methods'] as const)('with browser storage blocked (%s access throws)', (how) => {
  let unblock: () => void;
  let fetchSpy: { mockRestore: () => void };

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    unblock = blockStorage(how);
  });

  afterEach(() => {
    unblock();
    fetchSpy.mockRestore();
  });

  it('renders the dashboard and switches the theme for the current page view', async () => {
    vi.resetModules();
    const { App } = await import('./App.js');
    render(
      <MemoryRouter initialEntries={['/berlin']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getAllByText('BERLIN').length).toBeGreaterThanOrEqual(1), {
      timeout: 10_000,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeTruthy();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  }, 30_000);

  it('starts the theme from the system colour scheme', async () => {
    stubColourScheme(true);
    vi.resetModules();
    const { useTheme } = await import('./hooks/useTheme.js');

    expect(useTheme.getState().theme).toBe('dark');
    useTheme.getState().toggle();
    expect(useTheme.getState().theme).toBe('light');
  });

  it('still preloads a map style from the HTML shell', () => {
    stubColourScheme(false);
    expect(runThemePreloadScript()).toContain('positron');
    stubColourScheme(true);
    expect(runThemePreloadScript()).toContain('dark-matter');
  });

  it('shows and dismisses NINA warnings', () => {
    render(<NinaBanner />, { wrapper: cityWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText(warning.headline)).toBeNull();
  });

  it('opens the mobile layer drawer and stops its first-use animation', () => {
    render(<MobileLayerDrawer />, { wrapper: cityWrapper() });
    const handle = screen.getByRole('button', { name: 'Toggle layers panel' });
    expect(handle.className).toContain('animate-drawer-breathe');

    fireEvent.click(handle);

    expect(handle.className).not.toContain('animate-drawer-breathe');
  });

  it('shows the keyboard shortcut hint and lets it be dismissed', () => {
    vi.useFakeTimers();
    render(<ShortcutToast />);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hides the keyboard shortcut hint on its own timer', () => {
    vi.useFakeTimers();
    render(<ShortcutToast />);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: /keyboard shortcuts/i })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('with browser storage available', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('restores and saves the theme', async () => {
    localStorage.setItem('theme', 'dark');
    vi.resetModules();
    const { useTheme } = await import('./hooks/useTheme.js');

    expect(useTheme.getState().theme).toBe('dark');
    useTheme.getState().toggle();
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('preloads the map style for the stored theme from the HTML shell', () => {
    localStorage.setItem('theme', 'dark');
    expect(runThemePreloadScript()).toContain('dark-matter');
  });

  it('remembers that the keyboard shortcut hint was seen', () => {
    vi.useFakeTimers();
    render(<ShortcutToast />);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
    expect(localStorage.getItem('hasSeenKeyboardHints')).toBe('1');
  });
});
