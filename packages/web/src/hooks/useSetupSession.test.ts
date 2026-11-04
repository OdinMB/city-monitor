import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCity, restoreOwnSetup, startPersisting } from './useSetupSession.js';
import { useTileSetup } from './useTileSetup.js';
import { defaultMapState, useCommandCenter, type DataLayer } from './useCommandCenter.js';
import { cookieString, readPrefs, writePrefs } from '../lib/setup-cookie.js';
import { shareUrl } from '../lib/setup-link.js';
import { defaultView, shownCustom } from '../lib/setup-state.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';

const setupInitial = useTileSetup.getState();
const mapInitial = useCommandCenter.getState();
const setup = () => useTileSetup.getState();
const map = () => useCommandCenter.getState();
const hasCookie = () => document.cookie.split('; ').some((c) => c.startsWith('cm_setup='));

/** A fresh page: stores as on load. */
function reload() {
  useTileSetup.setState(setupInitial, true);
  useCommandCenter.setState(mapInitial, true);
}

const linkSearch = (url: string) => new URL(url).search;

describe('setup session', () => {
  let stop: () => void;

  beforeEach(() => {
    reload();
    document.cookie = cookieString(null, false);
    stop = startPersisting();
  });

  afterEach(() => {
    stop();
    document.cookie = cookieString(null, false);
  });

  it('sets no cookie on a visit without a change', () => {
    openCity('berlin', berlin.features, '');
    openCity('hamburg', hamburg.features, '');
    openCity('berlin', berlin.features, '');
    expect(hasCookie()).toBe(false);
  });

  it('remembers a setup choice for the city, and only for it', () => {
    openCity('berlin', berlin.features, '');
    setup().choose('topics');
    expect(hasCookie()).toBe(true);
    reload();
    openCity('berlin', berlin.features, '');
    expect(setup().view.choice).toBe('topics');
    openCity('hamburg', hamburg.features, '');
    expect(setup().view.choice).toBe('functional');
  });

  it('remembers the map state per city and opens the city with it', () => {
    openCity('berlin', berlin.features, '');
    map().toggleLayer('parking');
    map().setPoliticalLayer('elections');
    openCity('hamburg', hamburg.features, '');
    expect(map().activeLayers.has('parking')).toBe(false);
    reload();
    openCity('berlin', berlin.features, '');
    expect(map().activeLayers.has('parking')).toBe(true);
    expect(map().politicalLayer).toBe('elections');
  });

  it('keeps no map state in the cookie while the map shows its defaults', () => {
    openCity('berlin', berlin.features, '');
    map().toggleLayer('parking');
    map().toggleLayer('parking');
    expect(readPrefs().berlin.map).toBeUndefined();
  });

  it('fits each of the visitor’s setups to the city: a tile it neither places nor hides joins the last section', () => {
    const setups = [1, 2].map((n) => ({ id: `m${n}` as const, name: `S${n}`, sections: [{ id: 'c1', tiles: ['weather' as const, 'support' as const] }], hidden: ['budget' as const] }));
    writePrefs({ berlin: { view: { ...defaultView(), choice: 'm2', customSetups: setups }, touched: 1 } });
    openCity('berlin', berlin.features, '');
    for (const { name, sections } of setup().view.customSetups) {
      expect(name).toMatch(/^S\d$/);
      expect(sections[0].tiles.slice(0, 2)).toEqual(['weather', 'support']);
      expect(sections[0].tiles).toContain('news');
      expect(sections[0].tiles).not.toContain('budget');
    }
  });

  describe('a shared link', () => {
    const sharedSetup = { name: 'Geteilt', sections: [{ id: 'c1', tiles: ['weather' as const, 'support' as const] }], hidden: [] };
    const sharedMap = { ...defaultMapState('berlin'), activeLayers: new Set<DataLayer>(['crime']) };
    const search = linkSearch(shareUrl('https://citymonitor.app', 'berlin', sharedSetup, sharedMap));

    beforeEach(() => {
      openCity('berlin', berlin.features, '');
      setup().choose('topics');
      reload();
      openCity('berlin', berlin.features, search);
    });

    it('previews its setup and map for the visit, writing nothing', () => {
      expect(setup().shared).toBe(true);
      expect(shownCustom(setup().view)!.name).toBe('Geteilt');
      expect([...map().activeLayers]).toEqual(['crime']);
      expect(readPrefs().berlin.view.choice).toBe('topics');
    });

    it('writes nothing for a change to the previewed map either', () => {
      map().toggleLayer('parking');
      expect(setup().shared).toBe(true);
      expect(readPrefs().berlin.map).toBeUndefined();
    });

    it('goes back to the visitor’s own setup and map', () => {
      restoreOwnSetup('berlin');
      expect(setup().view.choice).toBe('topics');
      expect(map().activeLayers).toEqual(defaultMapState('berlin').activeLayers);
      expect(readPrefs().berlin.view.choice).toBe('topics');
    });

    it('is kept as a setup of the visitor’s, with the map as it shows', () => {
      map().toggleLayer('parking');
      setup().keepShared();
      const saved = readPrefs().berlin;
      expect(saved.view.customSetups.map((s) => s.name)).toEqual(['Geteilt']);
      expect(saved.view.choice).toBe('m1');
      expect([...saved.map!.activeLayers!].sort()).toEqual(['crime', 'parking']);
    });

    it('is not shown again once the address has lost its parameters (back from the Sources page)', () => {
      openCity('berlin', berlin.features, '');
      expect(setup().shared).toBe(true);
      expect([...map().activeLayers]).toEqual(['crime']);
    });
  });

  it('keeps a link’s map state over the visitor’s own setup', () => {
    const search = linkSearch(shareUrl('https://citymonitor.app', 'berlin', 'functional', { ...defaultMapState('berlin'), crimeLayer: 'robbery' }));
    openCity('berlin', berlin.features, `?map=${new URLSearchParams(search).get('map')}`);
    expect(setup().shared).toBe(true);
    setup().keepShared();
    expect(readPrefs().berlin.map!.crimeLayer).toBe('robbery');
    expect(setup().shared).toBe(false);
  });

  it('sets no cookie for a shared link viewed and left without a change', () => {
    const search = linkSearch(shareUrl('https://citymonitor.app', 'berlin', 'topics', { ...defaultMapState('berlin'), crimeLayer: 'robbery' }));
    openCity('berlin', berlin.features, search);
    restoreOwnSetup('berlin');
    expect(setup().view.choice).toBe('functional');
    expect(map().crimeLayer).toBe('total');
    expect(hasCookie()).toBe(false);
  });

  it('ignores malformed link parameters', () => {
    openCity('berlin', berlin.features, '?setup=sideways&map=zzz');
    expect(setup().shared).toBe(false);
    expect(setup().view.choice).toBe('functional');
    expect(map().activeLayers).toEqual(defaultMapState('berlin').activeLayers);
  });
});
