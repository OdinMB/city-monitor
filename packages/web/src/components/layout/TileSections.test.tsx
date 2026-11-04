import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { WebCityConfig } from '@city-monitor/shared';
import { CityContext } from '../../hooks/CityContext.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { defaultView, type SetupView } from '../../lib/setup-state.js';
import { readSharedParams } from '../../lib/setup-link.js';
import { berlin } from '../../config/cities/berlin.js';
import { muenchen } from '../../config/cities/muenchen.js';
import { TileSections } from './TileSections.js';

// The sections and their controls are under test, not what each tile shows:
// a plain card titled with the tile's id, which still carries setup mode's controls.
vi.mock('./DashboardTile.js', async () => {
  const { Tile } = await import('./Tile.js');
  return { DashboardTile: ({ id }: { id: string }) => <Tile title={id}><p /></Tile> };
});

const setupInitial = useTileSetup.getState();
const sectionHeadings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
const tilesIn = (name: string) =>
  within(screen.getByRole('region', { name })).queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

function renderSections(city: WebCityConfig = berlin, own: SetupView = defaultView(), shared?: SetupView) {
  useTileSetup.getState().load(city.id, own, shared);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityContext.Provider value={city}>
          <TileSections />
        </CityContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TileSections', () => {
  let fetchSpy: { mockRestore: () => void };

  beforeEach(() => {
    useTileSetup.setState(setupInitial, true);
    // No lift data arrives, so Berlin's DB-only lift tile stays hidden.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('setup switch', () => {
    it('opens with Functional, its sections in order, and no My setup to choose yet', () => {
      renderSections();
      expect(pressed('Functional')).toBe('true');
      expect(screen.queryByRole('button', { name: 'My setup' })).toBeNull();
      expect(sectionHeadings()).toEqual(['News', 'Environment', 'Disruptions', 'Crises', 'Background']);
      expect(tilesIn('Crises').at(-1)).toBe('support');
    });

    it('shows Topics in one click and Functional in another', () => {
      renderSections();
      fireEvent.click(screen.getByRole('button', { name: 'Topics' }));
      expect(pressed('Topics')).toBe('true');
      expect(sectionHeadings()).toContain('City hall');
      expect(tilesIn('Health & safety').at(-1)).toBe('support');
      fireEvent.click(screen.getByRole('button', { name: 'Functional' }));
      expect(sectionHeadings()).toContain('Background');
    });

    it('leaves out a section with nothing on screen (München’s transport: DB lifts only, no data yet)', () => {
      renderSections(muenchen, { ...defaultView(), choice: 'topics' });
      expect(sectionHeadings()).not.toContain('Traffic & transport');
    });
  });

  describe('collapsing', () => {
    it('collapses a section from its heading and opens it again', () => {
      renderSections();
      const toggle = within(screen.getByRole('heading', { level: 2, name: 'News' })).getByRole('button');
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(tilesIn('News')).toEqual([]);
      fireEvent.click(toggle);
      expect(tilesIn('News')).toEqual(['briefing', 'news', 'events']);
    });
  });

  describe('setup mode', () => {
    const customize = () => fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    const done = () => fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    it('copies the setup shown into My setup and gives each section and tile its controls', () => {
      renderSections();
      customize();
      expect(pressed('My setup')).toBe('true');
      expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((i) => (i as HTMLInputElement).value))
        .toEqual(['News', 'Environment', 'Disruptions', 'Crises', 'Background']);
      expect(screen.getByRole('button', { name: 'Move Weather up' })).toBeTruthy();
      // The support tile moves but never goes
      expect(screen.getByRole('button', { name: 'Move Support Us down' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Hide Support Us' })).toBeNull();
      done();
      expect(screen.queryByRole('textbox', { name: 'Section name' })).toBeNull();
      expect(useTileSetup.getState().view.choice).toBe('custom');
    });

    it('renames a section', () => {
      renderSections();
      customize();
      fireEvent.change(screen.getAllByRole('textbox', { name: 'Section name' })[0], { target: { value: 'Mein Morgen' } });
      done();
      expect(sectionHeadings()[0]).toBe('Mein Morgen');
    });

    it('moves tiles within and between sections', () => {
      renderSections();
      customize();
      fireEvent.click(screen.getByRole('button', { name: 'Move News up' }));
      expect(tilesIn('News')).toEqual(['news', 'briefing', 'events']);
      fireEvent.change(screen.getByRole('combobox', { name: 'Move Events to section' }), { target: { value: 'crises' } });
      expect(tilesIn('Crises').at(-1)).toBe('events');
      // The first and last tile go no further
      expect((screen.getByRole('button', { name: 'Move News up' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('hides a tile to the tray and adds it back', () => {
      renderSections();
      customize();
      fireEvent.click(screen.getByRole('button', { name: 'Hide Pollen Forecast' }));
      expect(tilesIn('Environment')).not.toContain('pollen');
      const tray = screen.getByRole('region', { name: 'Hidden tiles' });
      expect(within(tray).getByText('Pollen Forecast')).toBeTruthy();
      fireEvent.change(within(tray).getByRole('combobox', { name: 'Add Pollen Forecast to section' }), { target: { value: 'news' } });
      expect(tilesIn('News').at(-1)).toBe('pollen');
      expect(within(screen.getByRole('region', { name: 'Hidden tiles' })).getByText('No hidden tiles.')).toBeTruthy();
    });

    it('moves, deletes and adds sections; a deleted section’s tiles go to the tray', () => {
      renderSections();
      customize();
      fireEvent.click(screen.getByRole('button', { name: 'Move section Environment up' }));
      expect(sectionHeadings().slice(0, 2)).toEqual(['Environment', 'News']);
      fireEvent.click(screen.getByRole('button', { name: 'Delete section News' }));
      expect(sectionHeadings()).not.toContain('News');
      expect(within(screen.getByRole('region', { name: 'Hidden tiles' })).getByText('Briefing')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
      expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((i) => (i as HTMLInputElement).value).at(-1)).toBe('New section');
    });

    it('asks before a standard setup replaces an existing My setup, and keeps it when declined', () => {
      const mine: SetupView = { ...defaultView(), custom: { sections: [{ id: 'c1', name: 'Mine', tiles: ['weather', 'support'] }], hidden: [] } };
      renderSections(berlin, mine);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      customize();
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(useTileSetup.getState().view.custom!.sections[0].name).toBe('Mine');
      expect(screen.queryByRole('textbox', { name: 'Section name' })).toBeNull();
    });

    it('starts My setup afresh from Topics after a confirm', () => {
      renderSections();
      customize();
      fireEvent.click(screen.getByRole('button', { name: 'Delete section News' }));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start from Topics' }));
      expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((i) => (i as HTMLInputElement).value)[1]).toBe('Weather');
      expect(pressed('My setup')).toBe('true');
    });
  });

  describe('a shared setup', () => {
    const mine: SetupView = { ...defaultView(), choice: 'topics' };
    const shared: SetupView = { ...defaultView(), choice: 'custom', custom: { sections: [{ id: 'c1', name: 'Geteilt', tiles: ['weather', 'support'] }], hidden: [] } };

    it('says so, and goes back to the visitor’s own', () => {
      renderSections(berlin, mine, shared);
      const notice = screen.getByRole('region', { name: "You're viewing a shared setup." });
      expect(sectionHeadings()).toContain('Geteilt');
      fireEvent.click(within(notice).getByRole('button', { name: 'Back to mine' }));
      expect(screen.queryByRole('region', { name: "You're viewing a shared setup." })).toBeNull();
      expect(pressed('Topics')).toBe('true');
    });

    it('becomes the visitor’s own when kept', () => {
      renderSections(berlin, mine, shared);
      fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
      expect(screen.queryByRole('region', { name: "You're viewing a shared setup." })).toBeNull();
      expect(useTileSetup.getState().own.custom!.sections[0].name).toBe('Geteilt');
    });
  });

  describe('sharing', () => {
    it('copies a link to the city with the setup and the map state, and says so', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      useCommandCenter.getState().applyMapState('berlin', {});
      renderSections(berlin, { ...defaultView(), choice: 'topics' });
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      expect(await screen.findByText('Link copied')).toBeTruthy();
      const url = new URL(writeText.mock.calls[0][0] as string);
      expect(url.pathname).toBe('/berlin');
      expect(readSharedParams(url.search).setup).toEqual({ choice: 'topics', custom: null });
      expect(readSharedParams(url.search).map!.activeLayers).toEqual(useCommandCenter.getState().activeLayers);
    });

    it('opens the share sheet on a phone that has one', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      const writeText = vi.fn();
      vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } });
      renderSections();
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(writeText).not.toHaveBeenCalled();
    });

    it('shows the link to copy by hand when the clipboard is not there', async () => {
      vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
      renderSections();
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      const field = await screen.findByRole('textbox', { name: 'Copy this link' });
      expect((field as HTMLInputElement).value).toContain('/berlin?setup=functional');
    });
  });
});
