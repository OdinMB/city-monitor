import type { ReactNode } from 'react';

export interface SkylineProps {
  /** The silhouette's colour: the page background by default, so it reads as the ground under the map. */
  fill?: string;
}

/**
 * One city's silhouette in a 0 0 1200 120 box: the ground line under the
 * given shapes, all in one colour.
 *
 * Phones and the city picker's tiles show it at its true proportions and crop
 * the sides, keeping the middle of the box (about x 260 to 940 on a phone), so
 * a drawing keeps its landmarks there. From tablet width up the dashboard
 * separator stretches the box from y 30 to the screen's width, about twice as
 * wide as tall on a laptop: draw landmarks so they read both ways, and keep all
 * but needles and spire tips below y 30. Buildings stand on y 110. Separate
 * shapes that only touch leave a hairline of background between them, so they
 * overlap by a unit instead: the ground starts at 109 for that reason.
 */
export function Skyline({ fill = 'var(--surface-0)', children }: SkylineProps & { children: ReactNode }) {
  return (
    <g style={{ fill }}>
      <rect x="0" y="109" width="1200" height="11" />
      {children}
    </g>
  );
}
