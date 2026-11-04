import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App.js';
import { useTileSetup } from './hooks/useTileSetup.js';
import { defaultMapState, useCommandCenter, type DataLayer } from './hooks/useCommandCenter.js';
import { shareUrl } from './lib/setup-link.js';
import { cookieString, writePrefs } from './lib/setup-cookie.js';
import { defaultView } from './lib/setup-state.js';

// The map itself is not under test.
vi.mock('./components/map/CityMap.js', () => ({ CityMap: () => <div /> }));

const setupInitial = useTileSetup.getState();
const mapInitial = useCommandCenter.getState();

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname + search}</output>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('opening a dashboard', { timeout: 30_000 }, () => {
  let fetchSpy: { mockRestore: () => void };

  beforeEach(() => {
    useTileSetup.setState(setupInitial, true);
    useCommandCenter.setState(mapInitial, true);
    document.cookie = cookieString(null, false);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
    document.cookie = cookieString(null, false);
  });

  it('applies a shared link’s setup and map, then takes its parameters out of the address', async () => {
    const map = { ...defaultMapState('berlin'), activeLayers: new Set<DataLayer>(['crime']) };
    const link = new URL(shareUrl('https://citymonitor.app', 'berlin', { choice: 'topics', custom: null }, map));
    renderAt(`/berlin${link.search}&utm_source=x`);

    expect(await screen.findByRole('region', { name: "You're viewing a shared setup." }, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Topics' }).getAttribute('aria-pressed')).toBe('true');
    expect([...useCommandCenter.getState().activeLayers]).toEqual(['crime']);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/berlin?utm_source=x'));
    // Still the shared setup: the address change is no visit of its own
    expect(screen.getByRole('region', { name: "You're viewing a shared setup." })).toBeTruthy();
    expect(document.cookie).not.toContain('cm_setup=');
  });

  it('opens with the setup saved in the cookie', async () => {
    writePrefs({
      berlin: {
        view: { ...defaultView(), choice: 'custom', custom: { sections: [{ id: 'c1', name: 'Mein Kiez', tiles: ['weather', 'support'] }], hidden: [] } },
        touched: 1,
      },
    });
    renderAt('/berlin');
    expect(await screen.findByRole('heading', { level: 2, name: 'Mein Kiez' }, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'My setup' }).getAttribute('aria-pressed')).toBe('true');
  });
});
