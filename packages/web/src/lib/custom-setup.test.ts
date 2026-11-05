import { describe, it, expect } from 'vitest';
import {
  MAX_SECTIONS, MAX_SECTION_NAME, addSection, canDeleteSection, customFrom, deleteSection, fitToCity,
  moveSection, moveTile, placeTile, removeTile, renameSection, type CustomSetup,
} from './custom-setup.js';
import type { TileId } from './tile-setups.js';

const setup = (): CustomSetup => ({
  sections: [
    { id: 'news', tiles: ['briefing', 'news'] },
    { id: 'environment', tiles: ['weather', 'airQuality', 'pollen'] },
    { id: 'c1', name: 'Mine', tiles: ['crisis'] },
  ],
  hidden: ['budget'],
});

const tilesOf = (s: CustomSetup) => s.sections.map((x) => x.tiles);

describe('customFrom', () => {
  it('copies the sections, so editing the copy leaves the original alone', () => {
    const original = [{ id: 'news', tiles: ['briefing', 'news', 'crisis'] as TileId[] }];
    const copy = customFrom(original, ['briefing', 'news', 'crisis']);
    copy.sections[0].tiles.push('weather');
    expect(original[0].tiles).toEqual(['briefing', 'news', 'crisis']);
    expect(copy.hidden).toEqual([]);
  });

  it('hides the city’s tiles the sections do not show, so they stay out when the setup is next fitted to the city', () => {
    const copy = customFrom([{ id: 'news', tiles: ['news', 'crisis'] }], ['briefing', 'news', 'weather', 'crisis']);
    expect(copy.hidden).toEqual(['briefing', 'weather']);
    expect(tilesOf(fitToCity(copy, ['briefing', 'news', 'weather', 'crisis']))).toEqual([['news', 'crisis']]);
  });
});

describe('fitToCity', () => {
  it('drops tiles the city does not have', () => {
    const fitted = fitToCity(setup(), ['briefing', 'news', 'weather', 'crisis', 'budget']);
    expect(tilesOf(fitted)).toEqual([['briefing', 'news'], ['weather'], ['crisis']]);
  });

  it('puts a tile neither placed nor hidden (a new source) at the end of the last section', () => {
    const fitted = fitToCity(setup(), ['briefing', 'news', 'weather', 'airQuality', 'pollen', 'crisis', 'budget', 'electricity']);
    expect(fitted.sections.at(-1)!.tiles).toEqual(['crisis', 'electricity']);
    expect(fitted.hidden).toEqual(['budget']);
  });

  it('keeps hidden only what the city has and what is not placed', () => {
    const fitted = fitToCity({ sections: [{ id: 'news', tiles: ['news'] }], hidden: ['news', 'budget', 'feuerwehr'] }, ['news', 'budget']);
    expect(fitted.hidden).toEqual(['budget']);
    expect(fitted.sections[0].tiles).toEqual(['news']);
  });

  it('places a tile once even when two sections list it', () => {
    const fitted = fitToCity({ sections: [{ id: 'a', tiles: ['news', 'weather'] }, { id: 'b', tiles: ['weather', 'crisis'] }], hidden: [] }, ['news', 'weather', 'crisis']);
    expect(tilesOf(fitted)).toEqual([['news', 'weather'], ['crisis']]);
  });

  it('keeps empty sections, which setup mode shows so tiles can be added', () => {
    const fitted = fitToCity({ sections: [{ id: 'a', tiles: ['crisis'] }, { id: 'c1', name: 'Later', tiles: [] }], hidden: [] }, ['crisis']);
    expect(fitted.sections.map((s) => s.id)).toEqual(['a', 'c1']);
  });
});

describe('section operations', () => {
  it('renames a section, capped in length', () => {
    expect(renameSection(setup(), 'news', 'Morning').sections[0].name).toBe('Morning');
    expect(renameSection(setup(), 'news', 'x'.repeat(200)).sections[0].name).toHaveLength(MAX_SECTION_NAME);
  });

  it('moves a section up and down, and not past either end', () => {
    expect(moveSection(setup(), 'environment', -1).sections.map((s) => s.id)).toEqual(['environment', 'news', 'c1']);
    expect(moveSection(setup(), 'environment', 1).sections.map((s) => s.id)).toEqual(['news', 'c1', 'environment']);
    expect(moveSection(setup(), 'news', -1).sections.map((s) => s.id)).toEqual(['news', 'environment', 'c1']);
    expect(moveSection(setup(), 'c1', 1).sections.map((s) => s.id)).toEqual(['news', 'environment', 'c1']);
  });

  it('sends a deleted section’s tiles to the hidden tray', () => {
    const next = deleteSection(setup(), 'environment');
    expect(next.sections.map((s) => s.id)).toEqual(['news', 'c1']);
    expect(next.hidden).toEqual(['budget', 'weather', 'airQuality', 'pollen']);
    expect(tilesOf(deleteSection(setup(), 'c1'))).toEqual([['briefing', 'news'], ['weather', 'airQuality', 'pollen']]);
    expect(deleteSection(setup(), 'nowhere')).toEqual(setup());
  });

  it('keeps the last section', () => {
    const one: CustomSetup = { sections: [{ id: 'a', tiles: ['crisis'] }], hidden: [] };
    expect(canDeleteSection(one)).toBe(false);
    expect(deleteSection(one, 'a')).toEqual(one);
    expect(canDeleteSection(setup())).toBe(true);
  });

  it('adds an empty section at the end with an id of its own', () => {
    const once = addSection(setup(), 'New');
    expect(once.sections.at(-1)).toEqual({ id: 'c2', name: 'New', tiles: [] });
    const twice = addSection(once, 'New');
    expect(new Set(twice.sections.map((s) => s.id)).size).toBe(twice.sections.length);
  });

  it('adds no section beyond the cap', () => {
    let s = setup();
    for (let i = 0; i < MAX_SECTIONS + 5; i++) s = addSection(s, 'More');
    expect(s.sections).toHaveLength(MAX_SECTIONS);
  });
});

describe('tile operations', () => {
  it('moves a tile up and down within its section, and not past either end', () => {
    expect(moveTile(setup(), 'airQuality', -1).sections[1].tiles).toEqual(['airQuality', 'weather', 'pollen']);
    expect(moveTile(setup(), 'airQuality', 1).sections[1].tiles).toEqual(['weather', 'pollen', 'airQuality']);
    expect(moveTile(setup(), 'weather', -1).sections[1].tiles).toEqual(['weather', 'airQuality', 'pollen']);
    expect(moveTile(setup(), 'pollen', 1).sections[1].tiles).toEqual(['weather', 'airQuality', 'pollen']);
  });

  it('moves past a tile that is not on screen (the lift tile without data), so each press shows', () => {
    const visible = (t: TileId) => t !== 'airQuality';
    expect(moveTile(setup(), 'pollen', -1, visible).sections[1].tiles).toEqual(['pollen', 'weather', 'airQuality']);
    expect(moveTile(setup(), 'weather', 1, visible).sections[1].tiles).toEqual(['airQuality', 'pollen', 'weather']);
  });

  it('moves a tile to the end of another section', () => {
    const next = placeTile(setup(), 'news', 'environment');
    expect(tilesOf(next)).toEqual([['briefing'], ['weather', 'airQuality', 'pollen', 'news'], ['crisis']]);
    expect(placeTile(setup(), 'news', 'nowhere')).toEqual(setup());
  });

  it('removes a tile to the hidden tray, any tile', () => {
    const next = removeTile(setup(), 'pollen');
    expect(next.sections[1].tiles).toEqual(['weather', 'airQuality']);
    expect(next.hidden).toEqual(['budget', 'pollen']);
    expect(tilesOf(removeTile(setup(), 'crisis')).at(-1)).toEqual([]);
    expect(removeTile(setup(), 'budget')).toEqual(setup());
  });

  it('adds a hidden tile to the end of a section', () => {
    const next = placeTile(setup(), 'budget', 'news');
    expect(next.sections[0].tiles).toEqual(['briefing', 'news', 'budget']);
    expect(next.hidden).toEqual([]);
  });
});
