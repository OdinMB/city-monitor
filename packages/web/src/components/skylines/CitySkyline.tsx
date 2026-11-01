import type { ComponentType } from 'react';
import type { SkylineProps } from './Skyline.js';
import { BerlinSkyline } from './BerlinSkyline.js';
import { HamburgSkyline } from './HamburgSkyline.js';
import { KoelnSkyline } from './KoelnSkyline.js';
import { MuenchenSkyline } from './MuenchenSkyline.js';
import { GenericSkyline } from './GenericSkyline.js';

/** Each city's own skyline, by city ID. */
const SKYLINES: Readonly<Record<string, ComponentType<SkylineProps>>> = {
  berlin: BerlinSkyline,
  hamburg: HamburgSkyline,
  koeln: KoelnSkyline,
  muenchen: MuenchenSkyline,
};

/**
 * The city's skyline silhouette, or a generic one for a city without its own,
 * for an `<svg>` with a viewBox inside 0 0 1200 120.
 */
export function CitySkyline({ cityId, fill }: SkylineProps & { cityId: string }) {
  const Drawing = Object.hasOwn(SKYLINES, cityId) ? SKYLINES[cityId]! : GenericSkyline;
  return <Drawing fill={fill} />;
}
