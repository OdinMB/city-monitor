import type { ReactNode } from 'react';

export interface SkylineProps {
  /** The silhouette's colour: the page background by default, so it reads as the ground under the map. */
  fill?: string;
}

/** How far plain filler blocks run on either side of a city's own 0–1200 drawing. */
export const SKYLINE_REACH = 2400;

/** 600 wide of filler blocks: each drawn up from the ground line, the next moved along from where it started. */
const FILLER_STRETCH =
  'v-30h26v30zm30 0v-22h34v22zm38 0v-36h22v36zm26 0v-26h30v26zm34 0v-32h18v32zm22 0v-20h40v20z' +
  'm44 0v-34h24v34zm28 0v-24h32v24zm36 0v-28h26v28zm30 0v-38h20v38zm24 0v-22h36v22zm40 0v-30h24v30z' +
  'm28 0v-26h30v26zm34 0v-34h22v34zm26 0v-20h38v20zm42 0v-32h26v32zm30 0v-24h30v24zm34 0v-36h24v36zm28 0v-26h18v26z';

/** The filler from -SKYLINE_REACH to 0 and from 1200 to 1200 + SKYLINE_REACH. */
const FILLER = [-SKYLINE_REACH, 1200]
  .flatMap((start) => Array.from({ length: SKYLINE_REACH / 600 }, (_, i) => `M${start + i * 600 + 4} 110${FILLER_STRETCH}`))
  .join('');

/**
 * One city's silhouette: its drawing in 0 0 1200 120, plain filler blocks on
 * either side and the ground line under all of it, in one colour.
 *
 * `CitySkyline` shows it at the same scale on both axes, so a drawing keeps its
 * proportions: draw landmarks as they are. The middle of the box (about x 260
 * to 940) is what a phone shows, so a drawing keeps its landmarks there; from
 * tablet width up the box is cut at y 30, so only needles and spire tips go
 * above that. Buildings stand on y 110. Separate shapes that only touch leave
 * a hairline of background between them, so they overlap by a unit instead:
 * the ground starts at 109 for that reason.
 */
export function Skyline({ fill = 'var(--surface-0)', children }: SkylineProps & { children: ReactNode }) {
  return (
    <g style={{ fill }}>
      <rect x={-SKYLINE_REACH} y="109" width={1200 + 2 * SKYLINE_REACH} height="11" />
      <path d={FILLER} />
      {children}
    </g>
  );
}
