import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { App } from './App.js';
import { berlin } from './config/cities/berlin.js';
import { hamburg } from './config/cities/hamburg.js';
import { loadStyle } from './components/map/base.js';

// Two active cities whatever the config holds, so the top bar's switcher shows.
vi.mock('./config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/index.js')>();
  const { berlin } = await import('./config/cities/berlin.js');
  const { hamburg } = await import('./config/cities/hamburg.js');
  const cities = [berlin, hamburg];
  return {
    ...actual,
    getCityConfig: (id: string) => cities.find((c) => c.id === id),
    getAllCities: () => cities,
    getDefaultCityId: () => 'berlin',
  };
});

// The base-map style resolves at once; the stand-in map is test-setup.ts's.
vi.mock('./components/map/base.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./components/map/base.js')>()),
  loadStyle: vi.fn(),
}));

const STYLE = { version: 8, sources: {}, layers: [] } as unknown as StyleSpecification;
const MapMock = vi.mocked(maplibregl.Map);
// The pan limit is the city's bounds in every layout (phones open on the
// centre instead of fitting the bounds, so `bounds` itself is layout-dependent).
const lastMapBounds = () => (MapMock.mock.calls.at(-1)?.[0] as maplibregl.MapOptions | undefined)?.maxBounds;

function LocationProbe() {
  return <output data-testid="pathname">{useLocation().pathname}</output>;
}

describe('App city switch', () => {
  // Restore only this spy, not every mock: test-setup.ts's ResizeObserver stays.
  let fetchSpy: { mockRestore: () => void };

  beforeEach(() => {
    // The tiles' data hooks get no data; a fresh Response per call, since a body reads once.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('null'));
    // The stand-in map fires 'load' at once, which draws the marker icons.
    vi.stubGlobal('Path2D', vi.fn());
    vi.mocked(loadStyle).mockResolvedValue(STYLE);
    MapMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  function renderAt(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );
  }

  /** Opens the switcher in `region` and follows its link to `city`. */
  function switchWith(region: HTMLElement, from: string, city: string) {
    const button = within(region).getByRole('button', { name: new RegExp(`^${from}`) });
    fireEvent.click(button);
    const list = document.getElementById(button.getAttribute('aria-controls') ?? '')!;
    fireEvent.click(within(list).getByRole('link', { name: city }));
  }

  // The top bar is the page's banner; the map's sidebar its complementary region.
  const topBar = () => screen.getByRole('banner');
  const sidebar = () => screen.getByRole('complementary');

  it('shows the chosen city\'s map, not the last one\'s, and gives focus back to the switcher', async () => {
    renderAt('/berlin');
    // The map is made once per mount with its city's bounds, so a switch has
    // to mount the city's page afresh.
    await waitFor(() => expect(lastMapBounds()).toEqual(berlin.map.bounds));

    switchWith(topBar(), 'Berlin', 'Hamburg');

    expect(screen.getByTestId('pathname').textContent).toBe('/hamburg');
    await waitFor(() => expect(lastMapBounds()).toEqual(hamburg.map.bounds));
    await waitFor(() =>
      expect(document.activeElement).toBe(within(topBar()).getByRole('button', { name: /^Hamburg/ })),
    );
  });

  it('switches from the sidebar too, giving focus back to the sidebar\'s switcher', async () => {
    renderAt('/berlin');
    await waitFor(() => expect(lastMapBounds()).toEqual(berlin.map.bounds));

    switchWith(sidebar(), 'Berlin', 'Hamburg');

    expect(screen.getByTestId('pathname').textContent).toBe('/hamburg');
    await waitFor(() =>
      expect(document.activeElement).toBe(within(sidebar()).getByRole('button', { name: /^Hamburg/ })),
    );
  });

  it('switches the Sources page to the other city\'s Sources page', async () => {
    renderAt('/berlin/sources');
    await screen.findByRole('heading', { level: 1, name: /Berlin/ });

    // Its one switcher, in the page header.
    switchWith(document.body, 'Berlin', 'Hamburg');

    expect(screen.getByTestId('pathname').textContent).toBe('/hamburg/sources');
    await screen.findByRole('heading', { level: 1, name: /Hamburg/ });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Hamburg/ })),
    );
  });

  it("wears the city's colours on its Sources page too, and drops them on leaving the city", async () => {
    renderAt('/berlin/sources');
    await screen.findByRole('heading', { level: 1, name: /Berlin/ });
    expect(document.documentElement.getAttribute('data-city')).toBe('berlin');

    switchWith(document.body, 'Berlin', 'Hamburg');
    await screen.findByRole('heading', { level: 1, name: /Hamburg/ });
    expect(document.documentElement.getAttribute('data-city')).toBe('hamburg');

    cleanup();
    expect(document.documentElement.hasAttribute('data-city')).toBe(false);
  });
});
