import type { ComponentType } from 'react';
import { SKYLINE_REACH, type SkylineProps } from './Skyline.js';
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

interface CitySkylineProps extends SkylineProps {
  cityId: string;
  /** Where the box starts: 0 shows every spire tip, 30 cuts the needles for a lower strip. */
  top?: number;
  /** Sizes the svg. Its height sets the scale; its width only shows more or less of the skyline. */
  className?: string;
}

/**
 * The city's skyline silhouette, or a generic one for a city without its own,
 * as an `<svg>` that never distorts it. The box runs far wider than any screen,
 * and `xMidYMax slice` scales it by the svg's height alone: a wider svg shows
 * more of the filler on either side of the drawing, a narrower one crops it,
 * and the drawing keeps its proportions at every width.
 */
export function CitySkyline({ cityId, fill, top = 0, className }: CitySkylineProps) {
  const Drawing = Object.hasOwn(SKYLINES, cityId) ? SKYLINES[cityId]! : GenericSkyline;
  return (
    <svg
      aria-hidden="true"
      viewBox={`${-SKYLINE_REACH} ${top} ${1200 + 2 * SKYLINE_REACH} ${120 - top}`}
      preserveAspectRatio="xMidYMax slice"
      className={className}
    >
      <Drawing fill={fill} />
    </svg>
  );
}
