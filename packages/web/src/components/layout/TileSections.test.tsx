import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { WebCityConfig } from '@city-monitor/shared';
import { CityContext } from '../../hooks/CityContext.js';
import { useTileSetup } from '../../hooks/useTileSetup.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { isolate } from '../../lib/bidi.js';
import { defaultView, previewView, shownCustom, type NamedSetup, type SetupView, type SharedSetup } from '../../lib/setup-state.js';
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

const menuButton = () => screen.getByRole('button', { name: /^Customize/ });
const menu = () => screen.getByRole('dialog', { name: 'Tiles and map' });
const openMenu = () => fireEvent.click(menuButton());
const inMenu = (name: string | RegExp) => within(menu()).getByRole('button', { name });
const isCurrent = (name: string | RegExp) => inMenu(name).getAttribute('aria-current') === 'true';
const setupName = () => screen.getByRole('textbox', { name: 'Setup name' }) as HTMLInputElement;

const kiez: NamedSetup = { id: 'm1', name: 'Mein Kiez', sections: [{ id: 'c1', name: 'Draußen', tiles: ['weather', 'support'] }], hidden: [] };
const commute: NamedSetup = { id: 'm2', name: 'Pendeln', sections: [{ id: 'c1', tiles: ['transit', 'support'] }], hidden: [] };
const withSetups = (choice: SetupView['choice'], ...customSetups: NamedSetup[]): SetupView => ({ ...defaultView(), choice, customSetups });

function renderSections(city: WebCityConfig = berlin, own: SetupView = defaultView(), shared?: SharedSetup) {
  useTileSetup.getState().load(city, own, shared ? previewView(own, shared) : null);
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

  describe('the setup menu', () => {
    const presetsIn = (group: string) =>
      within(within(menu()).getByRole('list', { name: group })).getAllByRole('listitem').map((item) => within(item).getAllByRole('button')[0].getAttribute('aria-labelledby'))
        .map((id) => document.getElementById(id!)!.textContent);

    it('opens with Everyday, named on the menu button, its sections in order', () => {
      renderSections();
      expect(menuButton().textContent).toMatch(/^Customize · Everyday/);
      expect(sectionHeadings()).toEqual(['News', 'Environment', 'Disruptions', 'Crises', 'Background']);
      expect(tilesIn('Crises').at(-1)).toBe('support');
    });

    it('offers the presets in two labelled groups, each with what it is for, a new setup, sharing, and where it is all kept', () => {
      renderSections();
      openMenu();
      expect(menuButton().getAttribute('aria-expanded')).toBe('true');
      expect(presetsIn('Day to day')).toEqual(['Everyday', 'Commute', 'Day out', 'Health', 'Storm & emergencies']);
      expect(presetsIn('Special interest')).toEqual(['City hall', 'Moving here', 'Visitors', 'Newsroom', 'Cycling', 'Heatwave']);
      expect(isCurrent('Everyday')).toBe(true);
      expect(isCurrent('Commute')).toBe(false);
      expect(inMenu('Commute').getAttribute('aria-describedby')).toBeTruthy();
      expect(within(menu()).getByText(/^Transit, lifts and the traffic map/)).toBeTruthy();
      expect(within(menu()).queryByText('Your setups')).toBeNull();
      expect(within(menu()).queryByRole('button', { name: /^Reset the map/ })).toBeNull();
      expect(inMenu('New setup').getAttribute('aria-describedby')).toBeTruthy();
      expect(inMenu('Share this view')).toBeTruthy();
      expect(within(menu()).getByText(/saved on this device \(cookie\)/)).toBeTruthy();
      expect(within(menu()).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    });

    it('leaves out the presets a city has neither tiles nor map layers for', () => {
      renderSections({ ...berlin, features: [] });
      openMenu();
      expect(presetsIn('Special interest')).toEqual(['Visitors', 'Cycling', 'Heatwave']);
    });

    it('moves focus into the menu, and shows a setup chosen there, closing it with focus back on its button', async () => {
      renderSections();
      openMenu();
      await waitFor(() => expect(menu().contains(document.activeElement)).toBe(true));
      fireEvent.click(inMenu('Commute'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(menuButton().textContent).toMatch(/^Customize · Commute/);
      expect(sectionHeadings()).toEqual(['Getting around', 'Conditions', 'News']);
      expect(tilesIn('News')).toEqual(['news', 'support']);
      await waitFor(() => expect(document.activeElement).toBe(menuButton()));
    });

    it('resets a preset’s map the visitor changed from its row, focus staying on the preset', () => {
      renderSections(berlin, { ...defaultView(), presetMaps: { commute: { map: { crimeLayer: 'kiez' }, touched: 1 } } });
      openMenu();
      expect(within(menu()).getAllByRole('button', { name: /^Reset the map/ })).toHaveLength(1);
      fireEvent.click(inMenu('Reset the map of Commute'));
      expect(useTileSetup.getState().own.presetMaps).toEqual({});
      expect(within(menu()).queryByRole('button', { name: /^Reset the map/ })).toBeNull();
      expect(document.activeElement).toBe(inMenu('Commute'));
    });

    it('closes on Escape, with focus back on its button', async () => {
      renderSections();
      openMenu();
      await waitFor(() => expect(menu().contains(document.activeElement)).toBe(true));
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(menuButton()));
    });

    it('lists the visitor’s setups, the one shown marked, and shows another', () => {
      renderSections(berlin, withSetups('m1', kiez, commute));
      expect(menuButton().textContent).toMatch(/^Customize · Mein Kiez/);
      openMenu();
      const yours = within(menu()).getByRole('list', { name: 'Your setups' });
      expect(within(yours).getAllByRole('listitem')).toHaveLength(2);
      expect(isCurrent('Mein Kiez')).toBe(true);
      expect(isCurrent('Everyday')).toBe(false);
      fireEvent.click(inMenu('Pendeln'));
      expect(sectionHeadings()).toEqual(['Untitled section']);
    });

    it('leaves out a section with nothing on screen (München’s getting around: DB lifts only, no data yet)', () => {
      renderSections(muenchen, { ...defaultView(), choice: 'commute' });
      expect(sectionHeadings()).toEqual(['Conditions', 'News']);
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
    const newSetup = () => {
      openMenu();
      fireEvent.click(inMenu(/^New setup/));
    };
    const done = () => fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    it('makes a new setup from the one shown, named, with the name field focused and every control in place', async () => {
      renderSections();
      newSetup();
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(setupName()));
      expect(setupName().value).toBe('My setup');
      expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((i) => (i as HTMLInputElement).value))
        .toEqual(['News', 'Environment', 'Disruptions', 'Crises', 'Background']);
      expect(screen.getByRole('button', { name: 'Move Weather up' })).toBeTruthy();
      // The support tile moves but never goes
      expect(screen.getByRole('button', { name: 'Move Support Us down' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Hide Support Us' })).toBeNull();
    });

    it('names the setup, and on Done hands focus back to the menu button, which names it too', async () => {
      renderSections();
      newSetup();
      fireEvent.change(setupName(), { target: { value: 'Morgens' } });
      done();
      expect(screen.queryByRole('textbox', { name: 'Section name' })).toBeNull();
      expect(menuButton().textContent).toMatch(/^Customize · Morgens/);
      await waitFor(() => expect(document.activeElement).toBe(menuButton()));
    });

    it('numbers a new setup’s default name, and stops at three setups', () => {
      renderSections(berlin, withSetups('m1', { ...kiez, name: 'My setup' }));
      newSetup();
      expect(setupName().value).toBe('My setup 2');
      done();
      newSetup();
      done();
      openMenu();
      const create = inMenu(/^New setup/) as HTMLButtonElement;
      expect(create.disabled).toBe(true);
      expect(within(create).getByText('You can keep up to 3 setups. Delete one to make another.')).toBeTruthy();
    });

    it('copies a preset that leaves tiles out with those tiles hidden', () => {
      renderSections(berlin, { ...defaultView(), choice: 'commute' });
      newSetup();
      expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((i) => (i as HTMLInputElement).value)).toEqual(['Getting around', 'Conditions', 'News']);
      expect(within(screen.getByRole('region', { name: 'Hidden tiles' })).getByText('Briefing')).toBeTruthy();
    });

    it('edits one of the visitor’s setups from the menu', () => {
      renderSections(berlin, withSetups('everyday', kiez));
      openMenu();
      fireEvent.click(inMenu('Edit Mein Kiez'));
      expect(setupName().value).toBe('Mein Kiez');
      expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((i) => (i as HTMLInputElement).value)).toEqual(['Draußen']);
    });

    it('deletes one of the visitor’s setups after a confirm, and keeps it when declined', () => {
      renderSections(berlin, withSetups('m1', kiez, commute));
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      openMenu();
      fireEvent.click(inMenu('Delete Mein Kiez'));
      expect(confirm).toHaveBeenCalledWith(`Delete “${isolate('Mein Kiez')}”? This cannot be undone.`);
      expect(useTileSetup.getState().own.customSetups).toHaveLength(2);
      confirm.mockReturnValue(true);
      fireEvent.click(inMenu('Delete Mein Kiez'));
      expect(useTileSetup.getState().own.customSetups.map((s) => s.name)).toEqual(['Pendeln']);
      expect(menuButton().textContent).toMatch(/^Customize · Everyday/);
      // Focus stays in the open menu
      expect(menu().contains(document.activeElement)).toBe(true);
    });

    it('renames a section', () => {
      renderSections();
      newSetup();
      fireEvent.change(screen.getAllByRole('textbox', { name: 'Section name' })[0], { target: { value: 'Mein Morgen' } });
      done();
      expect(sectionHeadings()[0]).toBe('Mein Morgen');
    });

    it('moves tiles within and between sections', () => {
      renderSections();
      newSetup();
      fireEvent.click(screen.getByRole('button', { name: 'Move News up' }));
      expect(tilesIn('News')).toEqual(['news', 'briefing', 'events']);
      fireEvent.change(screen.getByRole('combobox', { name: 'Move Events to section' }), { target: { value: 'crises' } });
      expect(tilesIn('Crises').at(-1)).toBe('events');
      // The first and last tile go no further
      expect((screen.getByRole('button', { name: 'Move News up' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('hides a tile to the tray and adds it back', () => {
      renderSections();
      newSetup();
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
      newSetup();
      fireEvent.click(screen.getByRole('button', { name: 'Move section Environment up' }));
      expect(sectionHeadings().slice(0, 2)).toEqual(['Environment', 'News']);
      fireEvent.click(screen.getByRole('button', { name: 'Delete section News' }));
      expect(sectionHeadings()).not.toContain('News');
      expect(within(screen.getByRole('region', { name: 'Hidden tiles' })).getByText('Briefing')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
      expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((i) => (i as HTMLInputElement).value).at(-1)).toBe('New section');
    });

    it('starts the setup’s tiles afresh from a preset after a confirm, keeping its name', () => {
      renderSections();
      newSetup();
      fireEvent.click(screen.getByRole('button', { name: 'Delete section News' }));
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      const presets = screen.getByRole('group', { name: 'Start afresh from' });
      expect(within(presets).getAllByRole('button')).toHaveLength(11);
      fireEvent.click(within(presets).getByRole('button', { name: 'Commute' }));
      expect(confirm).toHaveBeenCalledWith(`Arrange the tiles of “${isolate('My setup')}” as in Commute? Your changes to its tiles will be lost; its map stays as it is.`);
      expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((i) => (i as HTMLInputElement).value)).toEqual(['Getting around', 'Conditions', 'News']);
      expect(within(screen.getByRole('region', { name: 'Hidden tiles' })).getByText('Briefing')).toBeTruthy();
      expect(setupName().value).toBe('My setup');
    });
  });

  describe('a shared setup', () => {
    const own = withSetups('storm', kiez);
    const shared: SharedSetup = { name: 'Geteilt', sections: [{ id: 'c1', name: 'Draußen', tiles: ['weather', 'support'] }], hidden: [] };
    const notice = () => screen.getByRole('region', { name: "You're viewing a shared setup." });

    it('says so in place of the menu, and goes back to the visitor’s own, focus on the menu button', async () => {
      renderSections(berlin, own, shared);
      expect(screen.queryByRole('button', { name: /^Customize/ })).toBeNull();
      expect(sectionHeadings()).toEqual(['Draußen']);
      fireEvent.click(within(notice()).getByRole('button', { name: 'Back to mine' }));
      expect(screen.queryByRole('region', { name: "You're viewing a shared setup." })).toBeNull();
      expect(menuButton().textContent).toMatch(/^Customize · Storm & emergencies/);
      await waitFor(() => expect(document.activeElement).toBe(menuButton()));
    });

    it('becomes a new setup of the visitor’s when kept', () => {
      renderSections(berlin, own, shared);
      fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
      expect(screen.queryByRole('region', { name: "You're viewing a shared setup." })).toBeNull();
      expect(menuButton().textContent).toMatch(/^Customize · Geteilt/);
      expect(useTileSetup.getState().own.customSetups.map((s) => s.name)).toEqual(['Mein Kiez', 'Geteilt']);
    });

    it('asks which setup it replaces once the visitor has three, or lets them cancel', () => {
      const full = withSetups('storm', kiez, commute, { ...commute, id: 'm3', name: 'Drei' });
      renderSections(berlin, full, shared);
      fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
      const choices = within(notice()).getByRole('group', { name: 'You already have 3 setups. Which one should this one replace?' });
      expect(document.activeElement).toBe(within(choices).getByRole('button', { name: `Replace “${isolate('Mein Kiez')}”` }));
      fireEvent.click(within(choices).getByRole('button', { name: 'Cancel' }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep it' }));
      fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
      fireEvent.click(screen.getByRole('button', { name: `Replace “${isolate('Pendeln')}”` }));
      expect(useTileSetup.getState().own.customSetups.map((s) => s.name)).toEqual(['Mein Kiez', 'Geteilt', 'Drei']);
      expect(shownCustom(useTileSetup.getState().view)!.id).toBe('m2');
    });
  });

  describe('sharing', () => {
    const share = () => {
      openMenu();
      fireEvent.click(inMenu('Share this view'));
    };

    it('copies a link to the city with the setup shown and the map state, and says so', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      useCommandCenter.getState().applyMapState('berlin', {});
      renderSections(berlin, withSetups('m1', kiez));
      share();
      expect(await within(menu()).findByText('Link copied')).toBeTruthy();
      const url = new URL(writeText.mock.calls[0][0] as string);
      expect(url.pathname).toBe('/berlin');
      expect(readSharedParams(url.search).setup).toEqual({ name: 'Mein Kiez', sections: kiez.sections, hidden: [] });
      expect(readSharedParams(url.search).map!.activeLayers).toEqual(useCommandCenter.getState().activeLayers);
    });

    it('opens the share sheet on a phone that has one', async () => {
      const shareSheet = vi.fn().mockResolvedValue(undefined);
      const writeText = vi.fn();
      vi.stubGlobal('navigator', { ...navigator, share: shareSheet, clipboard: { writeText } });
      renderSections();
      share();
      await vi.waitFor(() => expect(shareSheet).toHaveBeenCalledTimes(1));
      expect(writeText).not.toHaveBeenCalled();
    });

    it('shows the link to copy by hand when the clipboard is not there', async () => {
      vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
      renderSections();
      share();
      const field = await screen.findByRole('textbox', { name: 'Copy this link' });
      expect((field as HTMLInputElement).value).toContain('/berlin?setup=everyday');
    });
  });
});
