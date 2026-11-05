import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App.js';
import { useTileSetup } from './hooks/useTileSetup.js';
import { defaultMapState, useCommandCenter, type DataLayer } from './hooks/useCommandCenter.js';
import { shareUrl } from './lib/setup-link.js';
import { cookieString, writePrefs } from './lib/setup-cookie.js';
import { defaultView } from './lib/setup-state.js';
import { presetMap } from './lib/setup-maps.js';
import { berlin } from './config/cities/berlin.js';
import { isolate } from './lib/bidi.js';

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
    const link = new URL(shareUrl('https://citymonitor.app', 'berlin', 'health', map));
    renderAt(`/berlin${link.search}&utm_source=x`);

    expect(await screen.findByRole('region', { name: "You're viewing a shared setup." }, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Air and allergies' })).toBeTruthy();
    expect([...useCommandCenter.getState().activeLayers]).toEqual(['crime']);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/berlin?utm_source=x'));
    // Still the shared setup: the address change is no visit of its own
    expect(screen.getByRole('region', { name: "You're viewing a shared setup." })).toBeTruthy();
    expect(document.cookie).not.toContain('cm_setup=');
  });

  it('opens with the setup saved in the cookie', async () => {
    writePrefs({
      berlin: {
        view: {
          ...defaultView(),
          choice: 'm2',
          customSetups: [
            { id: 'm1', name: 'Pendeln', sections: [{ id: 'c1', tiles: ['transit', 'crisis'] }], hidden: [] },
            { id: 'm2', name: 'Kiez', sections: [{ id: 'c1', name: 'Mein Kiez', tiles: ['weather', 'crisis'] }], hidden: [] },
          ],
        },
        touched: 1,
      },
    });
    renderAt('/berlin');
    expect(await screen.findByRole('heading', { level: 2, name: 'Mein Kiez' }, { timeout: 10_000 })).toBeTruthy();
    // Each setup menu icon on the page (top bar, sidebar, map corner) names it
    const icons = screen.getAllByRole('button', { name: /^Customize tiles and map/ });
    expect(icons.map((icon) => icon.id)).toEqual(['setup-menu-topbar', 'setup-menu-sidebar', 'setup-menu-map']);
    for (const icon of icons) expect(icon.getAttribute('aria-label')).toBe(`Customize tiles and map · ${isolate('Kiez')}`);
  });

  it('shows the map of the preset chosen in the menu, and keeps the choice', async () => {
    renderAt('/berlin');
    fireEvent.click((await screen.findAllByRole('button', { name: /^Customize tiles and map/ }, { timeout: 10_000 }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Day out' }));
    expect([...useCommandCenter.getState().activeLayers].sort()).toEqual([...presetMap('dayOut', berlin).activeLayers].sort());
    expect(document.cookie).toContain('cm_setup=');
  });
});
