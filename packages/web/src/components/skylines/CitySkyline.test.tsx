import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CitySkyline } from './CitySkyline';
import { GenericSkyline } from './GenericSkyline';

const markup = (drawing: ReactNode) => render(<svg>{drawing}</svg>).container.querySelector('svg')!.innerHTML;
const drawing = (cityId: string, fill?: string) => markup(<CitySkyline cityId={cityId} fill={fill} />);

describe('CitySkyline', () => {
  it('draws each city with a skyline of its own differently', () => {
    const cities = ['berlin', 'hamburg', 'koeln', 'muenchen'];
    const generic = drawing('atlantis');

    expect(new Set([...cities.map((id) => drawing(id)), generic]).size).toBe(cities.length + 1);
  });

  it('falls back to the generic skyline, also for an ID that names an Object property', () => {
    const generic = markup(<GenericSkyline />);

    expect(drawing('atlantis')).toBe(generic);
    expect(drawing('constructor')).toBe(generic);
  });

  it('paints in the colour it is given, and in the page background without one', () => {
    expect(drawing('hamburg', 'var(--accent)')).toContain('fill: var(--accent)');
    expect(drawing('hamburg')).toContain('fill: var(--surface-0)');
  });
});
