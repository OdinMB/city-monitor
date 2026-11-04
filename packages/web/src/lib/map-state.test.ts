import { describe, it, expect } from 'vitest';
import { compactMapState, parseMapState, sameMapState } from './map-state.js';
import { defaultMapState, type DataLayer, type MapState } from '../hooks/useCommandCenter.js';

const changed = (): MapState => ({
  ...defaultMapState('berlin'),
  singleView: true,
  activeLayers: new Set<DataLayer>(['social', 'crime']),
  openEmpty: new Set(['traffic']),
  politicalLayer: 'elections',
  socialLayer: 'rent',
  populationLayer: 'pop-elderly',
  noiseLayer: null,
  noiseLiveData: false,
  newsSubLayers: new Set(['news', 'police']),
  emergencySubLayers: new Set(['aeds', 'hospitals']),
  waterSubLayers: new Set(['bathing']),
  trafficSubLayers: new Set(['telraam', 'congestion']),
  accidentFilter: 'bike',
  crimeLayer: 'bikeTheft',
  heatReliefSubLayers: new Set(['toilets']),
  reportStatuses: new Set(['closed']),
});

/** Through JSON, as the cookie and the link carry it. */
const roundTrip = (state: Partial<MapState>) => parseMapState(JSON.parse(JSON.stringify(compactMapState(state))));

describe('map state', () => {
  it('round-trips every saved field', () => {
    expect(roundTrip(changed())).toEqual(changed());
    expect(roundTrip(defaultMapState('hamburg'))).toEqual(defaultMapState('hamburg'));
  });

  it('writes only the fields it is given', () => {
    expect(roundTrip({ politicalLayer: 'bundestag' })).toEqual({ politicalLayer: 'bundestag' });
  });

  it('drops values it does not know (an old cookie, a hand-made link) and keeps the rest', () => {
    const parsed = parseMapState({ a: ['crime', 'teleport', 7], p: 'senate', ws: ['bathing', 'lava'], af: 'bike' });
    expect(parsed).toEqual({ activeLayers: new Set(['crime']), waterSubLayers: new Set(['bathing']), accidentFilter: 'bike' });
  });

  it('leaves a sub-layer choice to the city’s default when none of its values is known, as one always stays on', () => {
    expect(parseMapState({ es: ['lava'], ns: [] })).toEqual({});
  });

  it('allows no layers at all (0 clears the map)', () => {
    expect(parseMapState({ a: [] })).toEqual({ activeLayers: new Set() });
  });

  it('tells equal map states apart from changed ones, whatever order a set was filled in', () => {
    const reordered = { ...defaultMapState('berlin'), activeLayers: new Set([...defaultMapState('berlin').activeLayers].reverse()) };
    expect(sameMapState(reordered, defaultMapState('berlin'))).toBe(true);
    expect(sameMapState(changed(), defaultMapState('berlin'))).toBe(false);
    expect(sameMapState({ ...defaultMapState('berlin'), noiseLayer: null }, defaultMapState('berlin'))).toBe(false);
  });

  it('ignores what is not a saved map state', () => {
    for (const raw of [null, 'x', 3, [], undefined]) expect(parseMapState(raw)).toBeNull();
  });
});
