import { describe, it, expect } from 'vitest';
import type { CityFeature } from '@city-monitor/shared';
import { cityLayers, effectiveChoice, effectiveNoiseLayer, effectiveSubLayers } from './map-layers.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { koeln } from '../config/cities/koeln.js';
import { muenchen } from '../config/cities/muenchen.js';

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
      'accidents', 'air-quality', 'bike-sharing', 'emergencies', 'ev-charging', 'heat-relief', 'news', 'noise', 'political', 'population', 'social', 'traffic', 'warnings', 'water', 'weather',
    ]);
    expect(all.heatRelief).toEqual(['cool', 'fountains', 'toilets']);
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
    // The Sozialmonitoring has all four indicators, and Hamburg has a rent map
    expect(hh.social).toEqual(['unemployment', 'single-parent', 'welfare', 'child-poverty', 'rent']);
    expect(hh.layers.has('population')).toBe(true);
    // Geofox transit: a marker where an announcement's first stop has a coordinate; the
    // Verkehrslage congestion map and the car and bicycle counters
    expect(hh.traffic).toEqual(['public-transport', 'incidents', 'congestion', 'roadworks', 'car-counts', 'bike-counts']);
    expect(hh.water).toEqual(['levels', 'bathing']);
    expect(hh.noise).toEqual(['road', 'rail', 'air']);
    expect(hh.noiseLive).toBe(false);
    expect(hh.political).toEqual(['bundestag']);
  });

  it('leaves out the social-atlas indicators a city\'s source lacks', () => {
    // Köln's Datenkatalog has no child-poverty figure
    expect(cityLayers(koeln).social).toEqual(['unemployment', 'single-parent', 'welfare']);
    // München's Indikatorenatlas has all four, and population; no rent map
    expect(cityLayers(muenchen).social).toEqual(['unemployment', 'single-parent', 'welfare', 'child-poverty']);
    expect(cityLayers(muenchen).layers.has('population')).toBe(true);
  });

  it('gives the citizen-reports layer to the cities with an Open311 source, Köln and München', () => {
    expect(cityLayers(koeln).layers.has('reports')).toBe(true);
    expect(cityLayers(muenchen).layers.has('reports')).toBe(true);
    expect(cityLayers(berlin).layers.has('reports')).toBe(false);
    expect(cityLayers(hamburg).layers.has('reports')).toBe(false);
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

  it('gives the traffic layer a congestion map and counters only where the city has them', () => {
    expect(withFeatures('trafficFlowMap').traffic).toEqual(['incidents', 'congestion']);
    expect(withFeatures('bikeCounts').traffic).toEqual(['incidents', 'bike-counts']);
    expect(withFeatures('carCounts', 'bikeCounts').traffic).toEqual(['incidents', 'car-counts', 'bike-counts']);
    for (const city of [berlin, koeln, muenchen]) {
      expect(cityLayers(city).traffic.filter((s) => ['congestion', 'car-counts', 'bike-counts'].includes(s)), city.id).toEqual([]);
    }
  });

  it('shows the bike-sharing layer in every city that has a system, and not without one', () => {
    for (const city of [berlin, hamburg, koeln, muenchen]) expect(cityLayers(city).layers.has('bike-sharing'), city.id).toBe(true);
    expect(withFeatures('bikeSharing').layers.has('bike-sharing')).toBe(true);
    expect(withFeatures().layers.has('bike-sharing')).toBe(false);
  });

  it('shows the accident layer in every city with Unfallatlas data, and not without', () => {
    for (const city of [berlin, hamburg, koeln, muenchen]) expect(cityLayers(city).layers.has('accidents'), city.id).toBe(true);
    expect(withFeatures('trafficAccidents').layers.has('accidents')).toBe(true);
    expect(withFeatures().layers.has('accidents')).toBe(false);
  });

  it('shows the EV charging layer in every city with the register, and not without it', () => {
    for (const city of [berlin, hamburg, koeln, muenchen]) expect(cityLayers(city).layers.has('ev-charging'), city.id).toBe(true);
    expect(withFeatures('evCharging').layers.has('ev-charging')).toBe(true);
    expect(withFeatures().layers.has('ev-charging')).toBe(false);
  });

  it('gives each city the heat-relief lists it has, and no layer without one', () => {
    expect(cityLayers(koeln).heatRelief).toEqual(['cool', 'fountains', 'toilets']);
    expect(cityLayers(muenchen).heatRelief).toEqual(['fountains', 'toilets']);
    expect(cityLayers(hamburg).heatRelief).toEqual(['fountains']);
    expect(withFeatures('publicToilets').layers.has('heat-relief')).toBe(true);
    expect(withFeatures().layers.has('heat-relief')).toBe(false);
    expect(withFeatures().heatRelief).toEqual([]);
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
