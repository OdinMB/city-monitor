import { describe, it, expect } from 'vitest';
import type { CityFeature } from '@city-monitor/shared';
import { STANDARD_SETUPS, TILE_IDS, cityTiles, isTileId, standardSections, type StandardSetup, type TileId } from './tile-setups.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { koeln } from '../config/cities/koeln.js';
import { muenchen } from '../config/cities/muenchen.js';

const SETUPS = Object.keys(STANDARD_SETUPS) as StandardSetup[];
const CITIES = [berlin, hamburg, koeln, muenchen];

const placed = (sections: { tiles: readonly TileId[] }[]) => sections.flatMap((s) => s.tiles);

describe('standard setups', () => {
  it.each(SETUPS)('%s places every tile exactly once, so a new tile cannot go missing', (setup) => {
    const tiles = placed(STANDARD_SETUPS[setup].map((s) => ({ tiles: s.tiles })));
    expect([...tiles].sort()).toEqual([...TILE_IDS].sort());
  });

  it.each(SETUPS)('%s places every tile of every city exactly once, city placements included', (setup) => {
    for (const city of CITIES) {
      const available = cityTiles(city.features);
      const tiles = placed(standardSections(setup, city.id, available));
      expect([...tiles].sort(), city.id).toEqual([...available].sort());
    }
  });
});

describe('cityTiles', () => {
  it('lists only the tiles whose features the city has, plus those every city has', () => {
    expect(cityTiles([])).toEqual(['weather', 'airQuality', 'support']);
  });

  it('shows the lift tile for KVB lists or DB stations', () => {
    const lifts = (features: CityFeature[]) => cityTiles(features).includes('liftOutages');
    expect(lifts(['liftOutages'])).toBe(true);
    expect(lifts(['stationLifts'])).toBe(true);
    expect(lifts(['transit'])).toBe(false);
  });

  it('gives the news feature both the briefing and the news tile', () => {
    expect(cityTiles(['news'])).toEqual(expect.arrayContaining(['briefing', 'news']));
  });
});

describe('isTileId', () => {
  it('accepts tile ids only', () => {
    expect(isTileId('weather')).toBe(true);
    expect(isTileId('noise')).toBe(false);
    expect(isTileId(3)).toBe(false);
    expect(isTileId('toString')).toBe(false);
  });
});

describe('standardSections', () => {
  it('drops the tiles a city lacks and the sections left without any', () => {
    const sections = standardSections('functional', 'nowhere', ['weather', 'support']);
    expect(sections.map((s) => s.id)).toEqual(['environment', 'crises']);
    expect(sections.map((s) => s.tiles)).toEqual([['weather'], ['support']]);
  });

  it('closes the crises section with the support tile in Functional and health & safety in Topics', () => {
    const last = (setup: StandardSetup, id: string) => standardSections(setup, 'berlin', cityTiles(berlin.features)).find((s) => s.id === id)!.tiles.at(-1);
    expect(last('functional', 'crises')).toBe('support');
    expect(last('topics', 'health')).toBe('support');
  });

  it('moves Hamburg’s water levels (storm surge) into the crises section, before the support tile', () => {
    const sections = standardSections('functional', 'hamburg', cityTiles(hamburg.features));
    const crises = sections.find((s) => s.id === 'crises')!;
    expect(crises.tiles).toContain('waterLevels');
    expect(crises.tiles.at(-1)).toBe('support');
    expect(sections.find((s) => s.id === 'background')!.tiles).not.toContain('waterLevels');
  });

  it('keeps the water levels in the background elsewhere', () => {
    const sections = standardSections('functional', 'koeln', cityTiles(koeln.features));
    expect(sections.find((s) => s.id === 'background')!.tiles).toContain('waterLevels');
    expect(sections.find((s) => s.id === 'crises')!.tiles).not.toContain('waterLevels');
  });

  it('returns fresh arrays, so an edit of a copy leaves the standard setup alone', () => {
    const first = standardSections('topics', 'berlin', cityTiles(berlin.features));
    first[0].tiles.pop();
    const again = standardSections('topics', 'berlin', cityTiles(berlin.features));
    expect(again[0].tiles.length).toBe(first[0].tiles.length + 1);
  });
});
