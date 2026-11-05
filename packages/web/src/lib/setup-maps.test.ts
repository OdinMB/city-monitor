import { describe, it, expect } from 'vitest';
import { offeredPresets, presetMap, setupMap } from './setup-maps.js';
import { cityLayers } from './map-layers.js';
import { PRESET_IDS } from './tile-setups.js';
import { defaultView, withSetupMap, type NamedSetup } from './setup-state.js';
import { defaultMapState, type DataLayer } from '../hooks/useCommandCenter.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { koeln } from '../config/cities/koeln.js';
import { muenchen } from '../config/cities/muenchen.js';

const CITIES = [berlin, hamburg, koeln, muenchen];
const layersOf = (preset: Parameters<typeof presetMap>[0], city: typeof berlin) => [...presetMap(preset, city).activeLayers];

describe('presetMap', () => {
  it('is the city’s default map for Everyday', () => {
    expect(presetMap('everyday', hamburg)).toEqual(defaultMapState('hamburg'));
    expect(presetMap('everyday', berlin)).toEqual(defaultMapState('berlin'));
  });

  it('shows Commute’s layers, the congestion map among the traffic sub-layers for a city that has it', () => {
    expect(layersOf('commute', hamburg)).toEqual(['traffic', 'bike-sharing', 'parking', 'lifts', 'weather']);
    expect([...presetMap('commute', hamburg).trafficSubLayers].sort()).toEqual(['congestion', 'incidents', 'public-transport', 'roadworks']);
  });

  it('leaves out the layers a city lacks', () => {
    expect(layersOf('commute', berlin)).toEqual(['traffic', 'bike-sharing', 'lifts', 'weather']);
    expect(layersOf('movingHere', berlin)).toEqual(['social', 'population', 'crime', 'noise']);
    expect(layersOf('movingHere', hamburg)).toEqual(['social', 'population', 'noise']);
  });

  it('sets the sub-layers and choices each preset is for', () => {
    expect(presetMap('cycling', berlin).accidentFilter).toBe('bike');
    expect([...presetMap('cycling', berlin).trafficSubLayers].sort()).toEqual(['bike-counts', 'incidents', 'roadworks', 'telraam']);
    expect(presetMap('cityHall', berlin).politicalLayer).toBe('elections');
    expect([...presetMap('storm', hamburg).waterSubLayers]).toEqual(['levels']);
    expect([...presetMap('visitors', berlin).trafficSubLayers]).toEqual(['public-transport']);
    expect([...presetMap('newsroom', berlin).newsSubLayers].sort()).toEqual(['news', 'police']);
  });

  it('shows every preset’s layers together, outside single view, and only layers the city has', () => {
    for (const city of CITIES) {
      const { layers } = cityLayers(city);
      for (const preset of PRESET_IDS) {
        const map = presetMap(preset, city);
        expect(map.singleView).toBe(false);
        expect([...map.activeLayers].every((l) => layers.has(l)), `${preset} in ${city.id}`).toBe(true);
      }
    }
  });

  it('gives fresh sets each time, so a change to one map leaves the preset alone', () => {
    presetMap('commute', berlin).activeLayers.add('crime');
    expect(presetMap('commute', berlin).activeLayers.has('crime')).toBe(false);
  });
});

describe('offeredPresets', () => {
  it('offers every preset in every city today', () => {
    for (const city of CITIES) expect(offeredPresets(city), city.id).toEqual(PRESET_IDS);
  });

  it('leaves out a preset with neither a tile beyond the support tile nor a map layer in the city', () => {
    const offered = offeredPresets({ id: 'nowhere', features: [] });
    expect(offered).toContain('everyday');
    expect(offered).not.toContain('cityHall');
    expect(offered).not.toContain('newsroom');
    expect(offered).not.toContain('movingHere');
  });

  it('offers a preset for its map layers alone', () => {
    expect(offeredPresets({ id: 'nowhere', features: ['citizenReports'] })).toContain('cityHall');
  });
});

describe('setupMap', () => {
  const parking = { activeLayers: new Set<DataLayer>(['traffic', 'parking']) };

  it('is a preset’s map with the visitor’s change of it', () => {
    const view = withSetupMap(defaultView(), 'commute', parking, 1);
    expect(setupMap(view, 'commute', hamburg).activeLayers).toEqual(parking.activeLayers);
    expect(setupMap(view, 'commute', hamburg).trafficSubLayers).toEqual(presetMap('commute', hamburg).trafficSubLayers);
    expect(setupMap(view, 'health', hamburg)).toEqual(presetMap('health', hamburg));
  });

  it('is Everyday’s map with the visitor’s change for a setup of theirs', () => {
    const mine: NamedSetup = { id: 'm1', name: 'Mine', sections: [{ id: 'c1', tiles: ['support'] }], hidden: [], map: { crimeLayer: 'kiez' } };
    const view = { ...defaultView(), customSetups: [mine] };
    expect(setupMap(view, 'm1', berlin)).toEqual({ ...defaultMapState('berlin'), crimeLayer: 'kiez' });
  });
});
