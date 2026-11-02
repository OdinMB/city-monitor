import { describe, it, expect } from 'vitest';
import type { CityFeature } from '@city-monitor/shared';
import { cityLayers, effectiveChoice, effectiveNoiseLayer, effectiveSubLayers } from './map-layers.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';

const withFeatures = (...features: CityFeature[]) => cityLayers({ features });

describe('cityLayers', () => {
  it('gives a city without features only the layers every city has, each with what every city has', () => {
    const none = withFeatures();
    expect([...none.layers].sort()).toEqual(['air-quality', 'traffic', 'weather']);
    expect(none.traffic).toEqual(['incidents']);
    expect(none.emergencies).toEqual([]);
    expect(none.news).toEqual([]);
    expect(none.water).toEqual([]);
    expect(none.noise).toEqual([]);
    expect(none.noiseLive).toBe(false);
    expect(none.social).toEqual([]);
    expect(none.political).toEqual([]);
  });

  it('gives Berlin, which has every feature, every layer and sub-layer', () => {
    const all = cityLayers(berlin);
    expect([...all.layers].sort()).toEqual([
      'air-quality', 'emergencies', 'news', 'noise', 'political', 'population', 'social', 'traffic', 'warnings', 'water', 'weather',
    ]);
    expect(all.news).toEqual(['news', 'police']);
    expect(all.emergencies).toEqual(['pharmacies', 'aeds']);
    expect(all.traffic).toEqual(['public-transport', 'incidents', 'roadworks']);
    expect(all.water).toEqual(['levels', 'bathing']);
    expect(all.noise).toEqual(['total', 'road', 'rail', 'air']);
    expect(all.noiseLive).toBe(true);
    expect(all.social).toEqual(['unemployment', 'single-parent', 'welfare', 'child-poverty', 'rent']);
    expect(all.political).toEqual(['bezirke', 'bundestag', 'landesparlament']);
  });

  it('leaves out what Hamburg has no source for', () => {
    const hh = cityLayers(hamburg);
    expect(hh.social).toEqual(['rent']);
    expect(hh.layers.has('population')).toBe(false);
    expect(hh.traffic).toEqual(['incidents', 'roadworks']);
    expect(hh.water).toEqual(['levels', 'bathing']);
    expect(hh.noise).toEqual(['road', 'rail', 'air']);
    expect(hh.noiseLive).toBe(false);
    expect(hh.political).toEqual(['bundestag']);
  });

  it('shows a parent layer when any one of its sub-layers is there', () => {
    expect(withFeatures('police').layers.has('news')).toBe(true);
    expect(withFeatures('police').news).toEqual(['police']);
    expect(withFeatures('bathing').layers.has('water')).toBe(true);
    expect(withFeatures('noiseSensors').layers.has('noise')).toBe(true);
    expect(withFeatures('rentMap').social).toEqual(['rent']);
    expect(withFeatures('aeds').layers.has('emergencies')).toBe(true);
    expect(withFeatures('aeds').emergencies).toEqual(['aeds']);
    expect(withFeatures('pharmacies').emergencies).toEqual(['pharmacies']);
  });

  it('shows the political layer only with political data, and the district-mayor and state views only with theirs', () => {
    expect(withFeatures('districtMayors', 'politicalMap').layers.has('political')).toBe(false);
    expect(withFeatures('political', 'bundestagByDistrict', 'politicalMap').political).toEqual(['bundestag']);
    expect(withFeatures('political', 'bundestagByDistrict', 'stateByDistrict', 'politicalMap').political).toEqual(['bundestag', 'landesparlament']);
  });

  // Köln: outlines and district mayors, but constituencies ("Köln I") that are not Stadtbezirke.
  it('leaves out the Bundestag view where constituencies are not named after Bezirke', () => {
    expect(withFeatures('political', 'districtMayors', 'mayor', 'politicalMap').political).toEqual(['bezirke']);
    expect(withFeatures('political', 'politicalMap').layers.has('political')).toBe(false);
  });

  it('shows no political layer without district outlines', () => {
    const layers = withFeatures('political', 'districtMayors', 'mayor');
    expect(layers.layers.has('political')).toBe(false);
    expect(layers.political).toEqual([]);
  });
});

describe('effectiveSubLayers', () => {
  it('keeps the selected sub-layers the city has', () => {
    expect([...effectiveSubLayers(new Set(['levels', 'bathing']), ['levels', 'bathing'])]).toEqual(['levels', 'bathing']);
    expect([...effectiveSubLayers(new Set(['public-transport', 'incidents', 'roadworks']), ['incidents'])]).toEqual(['incidents']);
  });

  it('falls back to every sub-layer the city has when none of the selected ones is there', () => {
    expect([...effectiveSubLayers(new Set(['bathing']), ['levels'])]).toEqual(['levels']);
  });
});

describe('effectiveChoice', () => {
  it('keeps the selection when the city has it, otherwise takes the first the city has', () => {
    expect(effectiveChoice('landesparlament', ['bezirke', 'bundestag', 'landesparlament'])).toBe('landesparlament');
    expect(effectiveChoice('bezirke', ['bundestag'])).toBe('bundestag');
  });

  it('has nothing to choose from a city without options', () => {
    expect(effectiveChoice('bezirke', [])).toBeUndefined();
  });
});

describe('effectiveNoiseLayer', () => {
  it('keeps a noise map the city has, and no map when live sensors are there to show', () => {
    expect(effectiveNoiseLayer('total', cityLayers(berlin))).toBe('total');
    expect(effectiveNoiseLayer(null, cityLayers(berlin))).toBeNull();
  });

  it('falls back to the first noise map the city has', () => {
    expect(effectiveNoiseLayer('total', cityLayers(hamburg))).toBe('road');
    expect(effectiveNoiseLayer('air', cityLayers(hamburg))).toBe('air');
  });

  it('shows a map when nothing else would be visible', () => {
    expect(effectiveNoiseLayer(null, cityLayers(hamburg))).toBe('road');
  });

  it('shows no map for a city without one', () => {
    expect(effectiveNoiseLayer('road', withFeatures('noiseSensors'))).toBeNull();
  });
});
