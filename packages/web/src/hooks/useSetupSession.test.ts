import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCity, restoreOwnSetup, startPersisting } from './useSetupSession.js';
import { useTileSetup } from './useTileSetup.js';
import { defaultMapState, useCommandCenter, type DataLayer } from './useCommandCenter.js';
import { cookieString, readPrefs, writePrefs } from '../lib/setup-cookie.js';
import { shareUrl } from '../lib/setup-link.js';
import { pickMapState } from '../lib/map-state.js';
import { presetMap } from '../lib/setup-maps.js';
import { defaultView, shownCustom } from '../lib/setup-state.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';

const setupInitial = useTileSetup.getState();
const mapInitial = useCommandCenter.getState();
const setup = () => useTileSetup.getState();
const map = () => useCommandCenter.getState();
const layers = () => [...map().activeLayers].sort();
const layersOf = (preset: Parameters<typeof presetMap>[0]) => [...presetMap(preset, berlin).activeLayers].sort();
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
    setup().choose('commute');
    expect(hasCookie()).toBe(true);
    reload();
    openCity('berlin', berlin.features, '');
    expect(setup().view.choice).toBe('commute');
    openCity('hamburg', hamburg.features, '');
    expect(setup().view.choice).toBe('everyday');
  });

  it('shows the map of the setup chosen, and opens the city with it', () => {
    openCity('berlin', berlin.features, '');
    expect(layers()).toEqual(layersOf('everyday'));
    setup().choose('health');
    expect(layers()).toEqual(layersOf('health'));
    expect([...map().emergencySubLayers].sort()).toEqual(['aeds', 'hospitals', 'pharmacies']);
    reload();
    openCity('berlin', berlin.features, '');
    expect(layers()).toEqual(layersOf('health'));
  });

  it('keeps a change to a preset’s map as that preset’s, per city, across visits', () => {
    openCity('berlin', berlin.features, '');
    setup().choose('commute');
    map().toggleLayer('crime');
    setup().choose('everyday');
    expect(map().activeLayers.has('crime')).toBe(false);
    setup().choose('commute');
    expect(map().activeLayers.has('crime')).toBe(true);
    openCity('hamburg', hamburg.features, '');
    expect(map().activeLayers.has('crime')).toBe(false);
    reload();
    openCity('berlin', berlin.features, '');
    expect(setup().view.choice).toBe('commute');
    expect(map().activeLayers.has('crime')).toBe(true);
  });

  it('keeps no change in the cookie while a preset’s map is its own', () => {
    openCity('berlin', berlin.features, '');
    map().toggleLayer('parking');
    map().toggleLayer('parking');
    expect(readPrefs().berlin.view.presetMaps).toEqual({});
  });

  it('shows a preset’s own map again once its change is reset', () => {
    openCity('berlin', berlin.features, '');
    setup().choose('commute');
    map().toggleLayer('crime');
    setup().resetPresetMap('commute');
    expect(layers()).toEqual(layersOf('commute'));
    expect(readPrefs().berlin.view.presetMaps).toEqual({});
  });

  it('gives a new setup the map on screen, and shows it with the setup', () => {
    openCity('berlin', berlin.features, '');
    setup().choose('cycling');
    map().setAccidentFilter('pedestrian');
    setup().newSetup([{ id: 'c1', tiles: ['weather', 'crisis'] }], 'Mine', pickMapState(map()));
    setup().choose('everyday');
    setup().choose('m1');
    expect(layers()).toEqual(layersOf('cycling'));
    expect(map().accidentFilter).toBe('pedestrian');
    reload();
    openCity('berlin', berlin.features, '');
    expect(map().accidentFilter).toBe('pedestrian');
  });

  it('shows Everyday’s map once the setup shown is deleted', () => {
    openCity('berlin', berlin.features, '');
    setup().choose('health');
    setup().newSetup([{ id: 'c1', tiles: ['weather', 'crisis'] }], 'Mine', pickMapState(map()));
    setup().deleteSetup('m1');
    expect(layers()).toEqual(layersOf('everyday'));
  });

  it('fits each of the visitor’s setups to the city: a tile it neither places nor hides joins the last section', () => {
    const setups = [1, 2].map((n) => ({ id: `m${n}` as const, name: `S${n}`, sections: [{ id: 'c1', tiles: ['weather' as const, 'crisis' as const] }], hidden: ['budget' as const] }));
    writePrefs({ berlin: { view: { ...defaultView(), choice: 'm2', customSetups: setups }, touched: 1 } });
    openCity('berlin', berlin.features, '');
    for (const { name, sections } of setup().view.customSetups) {
      expect(name).toMatch(/^S\d$/);
      expect(sections[0].tiles.slice(0, 2)).toEqual(['weather', 'crisis']);
      expect(sections[0].tiles).toContain('news');
      expect(sections[0].tiles).not.toContain('budget');
    }
  });

  describe('a shared link', () => {
    const sharedSetup = { name: 'Geteilt', sections: [{ id: 'c1', tiles: ['weather' as const, 'crisis' as const] }], hidden: [] };
    const sharedMap = { ...defaultMapState('berlin'), activeLayers: new Set<DataLayer>(['crime']) };
    const search = linkSearch(shareUrl('https://citymonitor.app', 'berlin', sharedSetup, sharedMap));

    beforeEach(() => {
      openCity('berlin', berlin.features, '');
      setup().choose('storm');
      reload();
      openCity('berlin', berlin.features, search);
    });

    it('previews its setup and map for the visit, writing nothing', () => {
      expect(setup().shared).toBe(true);
      expect(shownCustom(setup().view)!.name).toBe('Geteilt');
      expect([...map().activeLayers]).toEqual(['crime']);
      expect(readPrefs().berlin.view.choice).toBe('storm');
    });

    it('writes nothing for a change to the previewed map either', () => {
      map().toggleLayer('parking');
      expect(setup().shared).toBe(true);
      expect(readPrefs().berlin.view).toEqual({ ...defaultView(), choice: 'storm' });
    });

    it('goes back to the visitor’s own setup and its map', () => {
      restoreOwnSetup('berlin');
      expect(setup().view.choice).toBe('storm');
      expect(layers()).toEqual(layersOf('storm'));
      expect(readPrefs().berlin.view.choice).toBe('storm');
    });

    it('is kept as a setup of the visitor’s, with the map as it shows', () => {
      map().toggleLayer('parking');
      setup().keepShared(pickMapState(map()));
      const saved = readPrefs().berlin;
      expect(saved.view.customSetups.map((s) => s.name)).toEqual(['Geteilt']);
      expect(saved.view.choice).toBe('m1');
      expect([...saved.view.customSetups[0].map!.activeLayers!].sort()).toEqual(['crime', 'parking']);
      expect(layers()).toEqual(['crime', 'parking']);
    });

    it('is not shown again once the address has lost its parameters (back from the Sources page)', () => {
      openCity('berlin', berlin.features, '');
      expect(setup().shared).toBe(true);
      expect([...map().activeLayers]).toEqual(['crime']);
    });
  });

  it('previews a preset from a link with the link’s map, the visitor’s change of the preset left as it was', () => {
    const search = linkSearch(shareUrl('https://citymonitor.app', 'berlin', 'dayOut', { ...presetMap('dayOut', berlin), crimeLayer: 'robbery' }));
    openCity('berlin', berlin.features, search);
    expect(setup().view.choice).toBe('dayOut');
    expect(layers()).toEqual(layersOf('dayOut'));
    expect(map().crimeLayer).toBe('robbery');
    restoreOwnSetup('berlin');
    expect(setup().view.choice).toBe('everyday');
    expect(map().crimeLayer).toBe('total');
    expect(hasCookie()).toBe(false);
  });

  it('keeps a link’s map state over the visitor’s own setup', () => {
    const search = linkSearch(shareUrl('https://citymonitor.app', 'berlin', 'everyday', { ...defaultMapState('berlin'), crimeLayer: 'robbery' }));
    openCity('berlin', berlin.features, `?map=${new URLSearchParams(search).get('map')}`);
    expect(setup().shared).toBe(true);
    setup().keepShared(pickMapState(map()));
    expect(readPrefs().berlin.view.presetMaps.everyday!.map.crimeLayer).toBe('robbery');
    expect(setup().shared).toBe(false);
  });

  it('ignores malformed link parameters', () => {
    openCity('berlin', berlin.features, '?setup=sideways&map=zzz');
    expect(setup().shared).toBe(false);
    expect(setup().view.choice).toBe('everyday');
    expect(map().activeLayers).toEqual(defaultMapState('berlin').activeLayers);
  });
});
