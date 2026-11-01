import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { cityTopics } from '../lib/city-topics.js';
import { CityPickerPage } from './CityPickerPage.js';

afterEach(cleanup);

function renderPicker() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <CityPickerPage cities={[berlin, hamburg]} />
    </MemoryRouter>,
  );
}

describe('CityPickerPage', () => {
  it('has one tile per city, each a link to its dashboard headed by its name', () => {
    renderPicker();
    const tiles = screen.getAllByRole('listitem');
    expect(tiles).toHaveLength(2);
    expect(tiles.map((tile) => within(tile).getByRole('link').getAttribute('href'))).toEqual(['/berlin', '/hamburg']);
    expect(tiles.map((tile) => within(tile).getByRole('heading', { level: 2 }).textContent)).toEqual(['Berlin', 'Hamburg']);
  });

  it('draws each skyline at its true proportions, scaled by height and never stretched to the tile', () => {
    renderPicker();
    for (const tile of screen.getAllByRole('listitem')) {
      const svg = tile.querySelector('svg')!;
      expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMax slice');
      expect(svg.getAttribute('viewBox')).toBe('0 0 1200 120');
    }
  });

  it('sums up what each city covers from its own features', () => {
    renderPicker();
    for (const city of [berlin, hamburg]) {
      const link = screen.getByRole('link', { name: new RegExp(`^${city.name}`) });
      expect(link.textContent).toMatch(new RegExp(`(?<!\\d)${cityTopics(city.features).count}(?!\\d)`));
    }
  });
});
