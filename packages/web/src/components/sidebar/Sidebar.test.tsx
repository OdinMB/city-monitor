import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CityProvider } from '../../hooks/CityProvider.js';
import { Sidebar } from './Sidebar.js';

// The active city set is a constant in config/index.ts: swap it through a mock.
const active = vi.hoisted(() => ({ ids: ['berlin'] }));

vi.mock('../../config/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/index.js')>();
  const { berlin } = await import('../../config/cities/berlin.js');
  const { hamburg } = await import('../../config/cities/hamburg.js');
  const activeCities = () => [berlin, hamburg].filter((c) => active.ids.includes(c.id));
  return {
    ...actual,
    getCityConfig: (id: string) => activeCities().find((c) => c.id === id),
    getAllCities: activeCities,
  };
});

function renderSidebar() {
  render(
    <MemoryRouter initialEntries={['/berlin']}>
      <CityProvider cityId="berlin">
        <Sidebar />
      </CityProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('Sidebar city switcher', () => {
  it('is not there with one active city: a fork with one city sees no change', () => {
    active.ids = ['berlin'];
    renderSidebar();
    expect(screen.queryByText('BERLIN')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('opens the sidebar with the city switcher when several cities are active', () => {
    active.ids = ['berlin', 'hamburg'];
    renderSidebar();
    const sidebar = screen.getByRole('complementary');
    const button = screen.getByRole('button', { name: /^Berlin/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    // Above the layer list: the first control in the sidebar.
    expect(sidebar.querySelector('button')).toBe(button);
  });
});
