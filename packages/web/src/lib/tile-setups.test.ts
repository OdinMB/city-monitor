import { describe, it, expect } from 'vitest';
import type { CityFeature } from '@city-monitor/shared';
import {
  PRESET_GROUPS, PRESET_IDS, PRESET_SECTIONS, STANDARD_SECTION_KEYS, SUPPORT_TILE, TILE_IDS, cityTiles, isPreset, isTileId, presetSections,
  type TileId,
} from './tile-setups.js';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { koeln } from '../config/cities/koeln.js';
import { muenchen } from '../config/cities/muenchen.js';

const CITIES = [berlin, hamburg, koeln, muenchen];

const placed = (sections: readonly { tiles: readonly TileId[] }[]) => sections.flatMap((s) => s.tiles);

describe('presets', () => {
  it('come in two groups, everyday ones first, Everyday leading', () => {
    expect(PRESET_GROUPS.map((g) => g.key)).toEqual(['daily', 'special']);
    expect(PRESET_GROUPS[0].presets).toEqual(['everyday', 'commute', 'dayOut', 'health', 'storm']);
    expect(PRESET_GROUPS[1].presets).toEqual(['cityHall', 'movingHere', 'visitors', 'newsroom', 'cycling', 'heatwave']);
    expect(PRESET_IDS).toEqual(PRESET_GROUPS.flatMap((g) => g.presets));
  });

  it('Everyday places every tile exactly once, so a new tile cannot go missing', () => {
    expect([...placed(PRESET_SECTIONS.everyday)].sort()).toEqual([...TILE_IDS].sort());
    for (const city of CITIES) {
      const available = cityTiles(city.features);
      expect([...placed(presetSections('everyday', city.id, available))].sort(), city.id).toEqual([...available].sort());
    }
  });

  it.each(PRESET_IDS.filter((p) => p !== 'everyday'))('%s places a tile at most once and ends with the support tile, in every city', (preset) => {
    const tiles = placed(PRESET_SECTIONS[preset]);
    expect(new Set(tiles).size).toBe(tiles.length);
    for (const city of CITIES) {
      const sections = presetSections(preset, city.id, cityTiles(city.features));
      expect(placed(sections).at(-1), city.id).toBe(SUPPORT_TILE);
      expect(sections.every((s) => s.tiles.length > 0), city.id).toBe(true);
    }
  });

  it('use only section keys that have a name, and every such key is used', () => {
    const used = new Set(PRESET_IDS.flatMap((p) => PRESET_SECTIONS[p].map((s) => s.key)));
    expect([...used].sort()).toEqual([...STANDARD_SECTION_KEYS].sort());
  });

  it('tells preset ids from anything else', () => {
    expect(isPreset('commute')).toBe(true);
    expect(isPreset('topics')).toBe(false);
    expect(isPreset('m1')).toBe(false);
    expect(isPreset('toString')).toBe(false);
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

describe('presetSections', () => {
  it('drops the tiles a city lacks and the sections left without any', () => {
    const sections = presetSections('everyday', 'nowhere', ['weather', 'crisis', 'support']);
    expect(sections.map((s) => s.id)).toEqual(['environment', 'crises']);
    expect(sections.map((s) => s.tiles)).toEqual([['weather'], ['crisis', 'support']]);
  });

  it('gives the support tile to the section before when it would stand alone in its own', () => {
    expect(presetSections('health', 'nowhere', ['airQuality', 'wastewater', 'support'])).toEqual([
      { id: 'airAllergies', tiles: ['airQuality'] },
      { id: 'infections', tiles: ['wastewater', 'support'] },
    ]);
  });

  it('keeps the support tile in a section of its own when no section comes before', () => {
    expect(presetSections('movingHere', 'nowhere', ['support'])).toEqual([{ id: 'cityFigures', tiles: ['support'] }]);
  });

  it('closes Everyday’s crises section with the support tile', () => {
    const crises = presetSections('everyday', 'berlin', cityTiles(berlin.features)).find((s) => s.id === 'crises')!;
    expect(crises.tiles.at(-1)).toBe('support');
  });

  it('moves Hamburg’s water levels (storm surge) into Everyday’s crises section, before the support tile', () => {
    const sections = presetSections('everyday', 'hamburg', cityTiles(hamburg.features));
    const crises = sections.find((s) => s.id === 'crises')!;
    expect(crises.tiles).toContain('waterLevels');
    expect(crises.tiles.at(-1)).toBe('support');
    expect(sections.find((s) => s.id === 'background')!.tiles).not.toContain('waterLevels');
  });

  it('keeps the water levels in the background elsewhere', () => {
    const sections = presetSections('everyday', 'koeln', cityTiles(koeln.features));
    expect(sections.find((s) => s.id === 'background')!.tiles).toContain('waterLevels');
    expect(sections.find((s) => s.id === 'crises')!.tiles).not.toContain('waterLevels');
  });

  it('shows Commute in Köln without the transit tile it lacks', () => {
    expect(presetSections('commute', 'koeln', cityTiles(koeln.features))).toEqual([
      { id: 'gettingAround', tiles: ['liftOutages'] },
      { id: 'conditions', tiles: ['weather', 'airQuality'] },
      { id: 'news', tiles: ['news', 'support'] },
    ]);
  });

  it('returns fresh arrays, so an edit of a copy leaves the preset alone', () => {
    const first = presetSections('commute', 'berlin', cityTiles(berlin.features));
    first[0].tiles.pop();
    const again = presetSections('commute', 'berlin', cityTiles(berlin.features));
    expect(again[0].tiles.length).toBe(first[0].tiles.length + 1);
  });
});
