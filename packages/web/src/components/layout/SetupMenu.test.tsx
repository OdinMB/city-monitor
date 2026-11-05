import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/CityProvider.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { berlin } from '../../config/cities/berlin.js';
import { defaultView } from '../../lib/setup-state.js';
import { Sidebar } from '../sidebar/Sidebar.js';
import { TopBar } from './TopBar.js';

// Where the setup menu's icon sits. The menu itself is under test in
// TileSections.test.tsx; the map corner's icon in CommandLayout.test.tsx.

const setupInitial = useTileSetup.getState();
const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const menu = () => screen.getByRole('dialog', { name: 'Tiles and map' });

function renderWith(node: ReactNode) {
  useTileSetup.getState().load(berlin, { ...defaultView(), choice: 'commute' });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/berlin']}>
        <CityProvider cityId="berlin">{node}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('the setup menu icon', () => {
  let fetchSpy: { mockRestore: () => void };

  beforeEach(() => {
    useTileSetup.setState(setupInitial, true);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
  });

  it('sits in the top bar, named after the setup shown, its tooltip too', () => {
    renderWith(<TopBar />);
    const icon = screen.getByRole('button', { name: 'Customize tiles and map · Commute' });
    expect(screen.getByRole('banner').contains(icon)).toBe(true);
    expect(icon.id).toBe('setup-menu-topbar');
    expect(icon.getAttribute('title')).toBe('Customize tiles and map · Commute');
  });

  it('comes right before the menu button below lg: only the desktop controls (lg up) are between them', () => {
    renderWith(<TopBar />);
    const icon = document.getElementById('setup-menu-topbar')!;
    const between = icon.nextElementSibling!;
    expect(between.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'lg:flex']));
    expect(between.nextElementSibling!.contains(screen.getByRole('button', { name: 'Menu' }))).toBe(true);
  });

  it('stays in the top bar from lg up, beside the desktop controls, so the bar that slides in on scrolling carries it', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: /min-width/.test(query),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      renderWith(<TopBar />);
      const icon = document.getElementById('setup-menu-topbar')!;
      const header = screen.getByRole('banner');
      // Nothing between it and the header hides it at any width
      for (let el: Element | null = icon; el && el !== header; el = el.parentElement) {
        expect(el.className.split(/\s+/), el.tagName).not.toEqual(expect.arrayContaining(['hidden']));
        expect(el.className, el.tagName).not.toMatch(/(^|\s)(lg|xl|max-\w+):hidden/);
      }
      expect(icon.nextElementSibling!.className.split(/\s+/)).toContain('lg:flex');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('keeps the sliding top bar on screen while its menu is open', () => {
    renderWith(<TopBar />);
    const icon = document.getElementById('setup-menu-topbar')!;
    expect(icon.hasAttribute('data-popover-pinned')).toBe(false);
    fireEvent.click(icon);
    expect(menu()).toBeTruthy();
    expect(icon.hasAttribute('data-popover-pinned')).toBe(true);
  });

  it('opens the sidebar too, before the layer list, and its menu hands focus back to it', async () => {
    renderWith(<><TopBar /><Sidebar /></>);
    const icon = document.getElementById('setup-menu-sidebar')!;
    const sidebar = screen.getByRole('complementary');
    expect(sidebar.contains(icon)).toBe(true);
    expect(icon.getAttribute('aria-label')).toBe('Customize tiles and map · Commute');
    expect(follows(icon, sidebar.querySelector('[data-layer-switches]')!)).toBe(true);

    fireEvent.click(icon);
    await waitFor(() => expect(menu().contains(document.activeElement)).toBe(true));
    expect(document.getElementById('setup-menu-topbar')!.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(icon));
  });
});
