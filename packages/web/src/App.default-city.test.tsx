import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App.js';

// The active city set is a constant in config/index.ts, so these tests swap
// it through a mock to cover a fork that deactivates Berlin.
const active = vi.hoisted(() => ({ ids: ['berlin'] }));

vi.mock('./config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/index.js')>();
  const { berlin } = await import('./config/cities/berlin.js');
  const { hamburg } = await import('./config/cities/hamburg.js');
  const activeCities = () => [berlin, hamburg].filter((c) => active.ids.includes(c.id));
  return {
    ...actual,
    getCityConfig: (id: string) => activeCities().find((c) => c.id === id),
    getAllCities: activeCities,
    getDefaultCityId: () => actual.getDefaultCityId(activeCities()),
  };
});

function LocationProbe() {
  return <output data-testid="pathname">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('App home page', () => {
  it('lets the visitor choose a city at / when several are active', async () => {
    active.ids = ['hamburg', 'berlin'];
    renderAt('/');
    const links = await screen.findAllByRole('link', { name: /^(Berlin|Hamburg)/ });
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/berlin', '/hamburg']);
    expect(screen.getByTestId('pathname').textContent).toBe('/');
  });

  it('sends / to the only active city: a fork with one city sees no picker', async () => {
    active.ids = ['berlin'];
    renderAt('/');
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/berlin'));
  });

  it('sends / to the first active city when Berlin is inactive', async () => {
    active.ids = ['hamburg'];
    renderAt('/');
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/hamburg'));
  });

  it('sends an inactive city to the picker when several are active', async () => {
    active.ids = ['hamburg', 'berlin'];
    renderAt('/koeln');
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/'));
    expect(await screen.findByRole('link', { name: /^Hamburg/ })).toBeTruthy();
  });

  it('sends an inactive /berlin on to the first active city instead of looping', async () => {
    active.ids = ['hamburg'];
    renderAt('/berlin');
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/hamburg'));
  });
});
