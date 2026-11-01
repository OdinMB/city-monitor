import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CitySkyline } from './CitySkyline';
import { GenericSkyline } from './GenericSkyline';

const svgOf = (container: HTMLElement) => container.querySelector('svg')!;
const drawing = (cityId: string) => svgOf(render(<CitySkyline cityId={cityId} />).container).innerHTML;

describe('CitySkyline', () => {
  it('draws each city with a skyline of its own differently', () => {
    const cities = ['berlin', 'hamburg', 'koeln', 'muenchen'];
    const generic = drawing('atlantis');

    const drawings = cities.map(drawing);
    expect(new Set([...drawings, generic]).size).toBe(cities.length + 1);
  });

  it('falls back to the generic skyline, also for an ID that names an Object property', () => {
    const { container } = render(
      <svg>
        <GenericSkyline />
      </svg>,
    );
    const generic = svgOf(container).innerHTML;

    expect(drawing('atlantis')).toBe(generic);
    expect(drawing('constructor')).toBe(generic);
  });

  it.each([0, 30])('scales by height alone, centred on the drawing, from y %i', (top) => {
    const svg = svgOf(render(<CitySkyline cityId="berlin" top={top} />).container);
    const [x, y, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);

    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMax slice');
    expect(x + width / 2).toBe(600);
    expect(width).toBeGreaterThan(1200);
    expect([y, height]).toEqual([top, 120 - top]);
  });

  it('paints in the colour it is given, and in the page background without one', () => {
    const fillOf = (props: { fill?: string }) =>
      svgOf(render(<CitySkyline cityId="hamburg" {...props} />).container).querySelector('g')!.getAttribute('style');

    expect(fillOf({ fill: 'var(--accent)' })).toContain('var(--accent)');
    expect(fillOf({})).toContain('var(--surface-0)');
  });
});
