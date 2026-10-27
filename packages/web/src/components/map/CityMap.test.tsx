import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import type { ReactNode } from 'react';
import i18n from 'i18next';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { CityProvider } from '../../hooks/CityProvider.js';
import { useTheme } from '../../hooks/useTheme.js';
import { MapErrorFallback } from '../ErrorFallback.js';
import { CityMap } from './CityMap.js';
import { loadStyle } from './base.js';

// loadStyle's own failures (error status, network, bad JSON) are in base.test.ts;
// here it simply resolves or rejects.
vi.mock('./base.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./base.js')>()),
  loadStyle: vi.fn(),
}));

const loadStyleMock = vi.mocked(loadStyle);
const MapMock = vi.mocked(maplibregl.Map);
const STYLE = { version: 8, sources: {}, layers: [] } as unknown as StyleSpecification;
const TOUCH_HINT = 'CooperativeGesturesHandler.MobileHelpText';

/** The stand-in map test-setup.ts returns from `new Map()`. */
type StandInMap = {
  on: Mock;
  remove: Mock;
  cooperativeGestures: { enable: Mock; disable: Mock; isEnabled: Mock };
  _locale: Record<string, string>;
};
const lastMap = () => MapMock.mock.results.at(-1)!.value as StandInMap;
const lastOptions = () => MapMock.mock.calls.at(-1)![0] as maplibregl.MapOptions;

// Media queries the page matches; setMedia() changes them as a rotation would.
let matching = new Set<string>();
const mediaListeners = new Set<() => void>();
function setMedia(...queries: string[]) {
  matching = new Set(queries);
  act(() => mediaListeners.forEach((notify) => notify()));
}
const TOUCH_PHONE = ['(pointer: coarse)'];
const TOUCH_LANDSCAPE = ['(pointer: coarse)', '(min-width: 640px)'];
const DESKTOP = ['(min-width: 640px)'];

function renderMap() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  // The same boundary CommandLayout puts around the map.
  return render(
    <ErrorBoundary FallbackComponent={MapErrorFallback}>
      <CityMap />
    </ErrorBoundary>,
    { wrapper },
  );
}

describe('CityMap', () => {
  const originalMatchMedia = window.matchMedia;
  let restoreSpies: Array<() => void> = [];

  beforeEach(() => {
    matching = new Set();
    window.matchMedia = ((query: string) => ({
      get matches() { return matching.has(query); },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, cb: () => void) => { mediaListeners.add(cb); },
      removeEventListener: (_: string, cb: () => void) => { mediaListeners.delete(cb); },
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    // The tiles' data hooks: no data. Style requests go through loadStyle.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('null'));
    // React reports each error a boundary catches; the fallback is what counts here.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The stand-in map fires 'load' at once, which draws the marker icons.
    vi.stubGlobal('Path2D', vi.fn());
    restoreSpies = [() => fetchSpy.mockRestore(), () => consoleSpy.mockRestore(), () => vi.unstubAllGlobals()];
    MapMock.mockClear();
    loadStyleMock.mockReset();
  });

  afterEach(async () => {
    cleanup(); // unmount before the language and theme are put back
    restoreSpies.forEach((restore) => restore());
    window.matchMedia = originalMatchMedia;
    mediaListeners.clear();
    useTheme.setState({ theme: 'light' });
    await i18n.changeLanguage('en');
  });

  describe('when the base-map style cannot be loaded', () => {
    it('shows the map fallback, and Retry loads the style again', async () => {
      loadStyleMock.mockRejectedValueOnce(new Error('Base-map style request failed: 503'));
      loadStyleMock.mockResolvedValue(STYLE);
      renderMap();

      const retry = await screen.findByRole('button', { name: 'Retry' });
      expect(screen.getByText('Map unavailable')).toBeTruthy();
      expect(MapMock).not.toHaveBeenCalled();

      fireEvent.click(retry);
      await waitFor(() => expect(MapMock).toHaveBeenCalledOnce());
      expect(screen.queryByText('Map unavailable')).toBeNull();
      expect(loadStyleMock).toHaveBeenCalledTimes(2);
    });

    it('says so in the visitor\'s language', async () => {
      await i18n.changeLanguage('de');
      loadStyleMock.mockRejectedValue(new TypeError('Failed to fetch'));
      renderMap();

      expect(await screen.findByText('Karte nicht verfügbar')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeTruthy();
    });

    it('shows the fallback when the style for a theme switch fails, and removes the old map', async () => {
      loadStyleMock.mockResolvedValueOnce(STYLE);
      loadStyleMock.mockRejectedValueOnce(new SyntaxError('Unexpected token <'));
      renderMap();
      await waitFor(() => expect(MapMock).toHaveBeenCalledOnce());
      const map = lastMap();

      act(() => useTheme.setState({ theme: 'dark' }));

      expect(await screen.findByText('Map unavailable')).toBeTruthy();
      expect(map.remove).toHaveBeenCalled();
    });
  });

  it('shows the map fallback when the map cannot be created (no WebGL), and Retry tries again', async () => {
    loadStyleMock.mockResolvedValue(STYLE);
    MapMock.mockImplementationOnce(() => {
      throw new Error('Failed to initialize WebGL');
    });
    renderMap();

    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByText('Map unavailable')).toBeTruthy();

    fireEvent.click(retry);
    await waitFor(() => expect(MapMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Map unavailable')).toBeNull();
  });

  it('keeps the map up when a tile fails to load', async () => {
    loadStyleMock.mockResolvedValue(STYLE);
    renderMap();
    await waitFor(() => expect(MapMock).toHaveBeenCalledOnce());
    const map = lastMap();

    const errorHandlers = map.on.mock.calls
      .filter(([type]) => type === 'error')
      .map((call) => call.at(-1) as (e: unknown) => void);
    act(() => errorHandlers.forEach((handler) => handler({ type: 'error', error: new Error('tile 404') })));

    expect(screen.queryByText('Map unavailable')).toBeNull();
    expect(map.remove).not.toHaveBeenCalled();
  });

  describe('gestures', () => {
    beforeEach(() => {
      loadStyleMock.mockResolvedValue(STYLE);
    });

    it('on a touch phone, lets one finger scroll the page and gives the hint in the UI language', async () => {
      await i18n.changeLanguage('de');
      setMedia(...TOUCH_PHONE);
      renderMap();
      await waitFor(() => expect(MapMock).toHaveBeenCalledOnce());

      expect(lastOptions().cooperativeGestures).toBe(true);
      expect(lastOptions().locale?.[TOUCH_HINT]).toBe(i18n.t('panel.map.gestureHint.touch'));
      expect(lastOptions().locale?.[TOUCH_HINT]).not.toBe(i18n.getFixedT('en')('panel.map.gestureHint.touch'));
    });

    it.each([
      ['a desktop', DESKTOP],
      ['a narrow window driven by a mouse', []],
      ['a phone held sideways or a tablet', TOUCH_LANDSCAPE],
    ])('leaves %s as it is', async (_name, media) => {
      setMedia(...media);
      renderMap();
      await waitFor(() => expect(MapMock).toHaveBeenCalledOnce());

      expect(lastOptions().cooperativeGestures).toBe(false);
      expect(lastMap().cooperativeGestures.isEnabled()).toBe(false);
    });

    it('follows the phone turning upright and back', async () => {
      setMedia(...TOUCH_LANDSCAPE);
      renderMap();
      await waitFor(() => expect(MapMock).toHaveBeenCalledOnce());
      const map = lastMap();

      setMedia(...TOUCH_PHONE);
      expect(map.cooperativeGestures.isEnabled()).toBe(true);

      setMedia(...TOUCH_LANDSCAPE);
      expect(map.cooperativeGestures.isEnabled()).toBe(false);
    });

    it('rewrites the hint when the language changes', async () => {
      setMedia(...TOUCH_PHONE);
      renderMap();
      await waitFor(() => expect(MapMock).toHaveBeenCalledOnce());
      const map = lastMap();
      const enables = map.cooperativeGestures.enable.mock.calls.length;

      await act(() => i18n.changeLanguage('tr'));

      expect(map._locale[TOUCH_HINT]).toBe(i18n.getFixedT('tr')('panel.map.gestureHint.touch'));
      // MapLibre builds the hint's text when it is enabled, so it is enabled afresh.
      expect(map.cooperativeGestures.enable.mock.calls.length).toBeGreaterThan(enables);
      expect(map.cooperativeGestures.isEnabled()).toBe(true);
    });
  });
});
