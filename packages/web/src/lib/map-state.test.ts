import { describe, it, expect } from 'vitest';
import { MAP_VALUE_CODES, compactMapState, diffMapState, parseMapState, sameMapState } from './map-state.js';
import { GROUP_CATEGORIES, defaultMapState, type DataLayer, type MapState } from '../hooks/useCommandCenter.js';

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

  it('writes a value as one character and a set as a string of them', () => {
    expect(compactMapState({ activeLayers: new Set<DataLayer>(['crime', 'social']), politicalLayer: 'elections' })).toEqual({ a: 'cs', p: 'e' });
  });

  it('gives every value of a field a code of its own, one character long', () => {
    for (const [field, codes] of Object.entries(MAP_VALUE_CODES)) {
      const values = Object.values(codes);
      expect(values.every((code) => code.length === 1), field).toBe(true);
      expect(new Set(values).size, field).toBe(values.length);
    }
    expect(Object.keys(MAP_VALUE_CODES.openEmpty).sort()).toEqual([...GROUP_CATEGORIES].sort());
  });

  it('drops values it does not know (an old cookie, a hand-made link) and keeps the rest', () => {
    const parsed = parseMapState({ a: 'c?7', p: 'senate', ws: 'b!', af: 'b', cr: ['t'] });
    expect(parsed).toEqual({ activeLayers: new Set(['crime']), waterSubLayers: new Set(['bathing']), accidentFilter: 'bike' });
  });

  it('leaves a sub-layer choice to the city’s default when none of its values is known, as one always stays on', () => {
    expect(parseMapState({ es: '!', ns: '' })).toEqual({});
  });

  it('allows no layers at all (0 clears the map)', () => {
    expect(parseMapState({ a: '' })).toEqual({ activeLayers: new Set() });
  });

  it('tells equal map states apart from changed ones, whatever order a set was filled in', () => {
    const reordered = { ...defaultMapState('berlin'), activeLayers: new Set([...defaultMapState('berlin').activeLayers].reverse()) };
    expect(sameMapState(reordered, defaultMapState('berlin'))).toBe(true);
    expect(sameMapState(changed(), defaultMapState('berlin'))).toBe(false);
    expect(sameMapState({ ...defaultMapState('berlin'), noiseLayer: null }, defaultMapState('berlin'))).toBe(false);
  });

  it('compares partial states field by field, a missing field unlike a given one', () => {
    expect(sameMapState({ crimeLayer: 'kiez' }, { crimeLayer: 'kiez' })).toBe(true);
    expect(sameMapState({ crimeLayer: 'kiez' }, {})).toBe(false);
  });

  it('ignores what is not a saved map state', () => {
    for (const raw of [null, 'x', 3, [], undefined]) expect(parseMapState(raw)).toBeNull();
  });
});

describe('diffMapState', () => {
  it('keeps only the fields that differ from the base', () => {
    const base = defaultMapState('berlin');
    const map = { ...base, crimeLayer: 'kiez' as const, activeLayers: new Set<DataLayer>(['weather', 'traffic', 'warnings', 'parking']) };
    expect(diffMapState(map, base)).toEqual({ crimeLayer: 'kiez', activeLayers: map.activeLayers });
  });

  it('is empty for the base itself, a set filled in another order included', () => {
    const base = defaultMapState('berlin');
    expect(diffMapState({ ...base, activeLayers: new Set([...base.activeLayers].reverse()) }, base)).toEqual({});
  });

  it('lays over the base to give the map back', () => {
    const base = defaultMapState('hamburg');
    expect(sameMapState({ ...base, ...diffMapState(changed(), base) }, changed())).toBe(true);
  });
});
