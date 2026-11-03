/**
 * hvv's own line colours, for the transit tile's line badges in Hamburg. The
 * Geofox GTI terms (hvv.de, "Datenabruf", Ziff. IV) ask for hvv's
 * representations of lines and symbols. GTI's line data carries no colours, so
 * these were sampled on 2026-11-02 from hvv's line icons
 * (https://cloud.geofox.de/icon/linename?name=<line>&height=40, described in
 * the GTI Anwenderhandbuch §4.3.2). Re-sample when hvv adds a line
 * (.context/transit.md#hamburg).
 *
 * Several of these backgrounds give white 12px text less than 4.5:1 (U4, S1,
 * S5, S7, AKN, ferries); hvv's own icons pair them with white, and the terms
 * ask for hvv's look, so they are kept as hvv draws them.
 */

export interface LineStyle {
  background: string;
  color: string;
  /** An outlined badge (S11): white face, coloured text and rim. */
  border?: string;
}

const WHITE = '#FFFFFF';

const RAIL: Readonly<Record<string, LineStyle>> = {
  U1: { background: '#006AB3', color: WHITE },
  U2: { background: '#E2001A', color: WHITE },
  U3: { background: '#FFDD00', color: '#000000' },
  U4: { background: '#0098A1', color: WHITE },
  S1: { background: '#1A962B', color: WHITE },
  S11: { background: WHITE, color: '#1A962B', border: '#1A962B' },
  S2: { background: '#B51143', color: WHITE },
  S21: { background: '#B51143', color: WHITE },
  S3: { background: '#622181', color: WHITE },
  S31: { background: '#622181', color: WHITE },
  S5: { background: '#0089BB', color: WHITE },
  S7: { background: '#CC7720', color: WHITE },
};

const AKN: LineStyle = { background: '#F29400', color: WHITE };
const FERRY: LineStyle = { background: '#009DD1', color: WHITE };
const BUS: LineStyle = { background: '#E2001A', color: WHITE };
const XPRESS_BUS: LineStyle = { background: '#1A9628', color: WHITE };
const NIGHT_BUS: LineStyle = { background: '#000000', color: WHITE };

/**
 * HADAG harbour ferries, whose numbers would otherwise read as buses. The
 * server keeps the same set (HVV_FERRIES in packages/server/src/lib/geofox.ts,
 * for the map scope); change both together.
 */
const FERRIES = new Set(['61', '62', '64', '65', '68', '72', '73', '75']);

/** Whether a Hamburg line name is a HADAG ferry rather than a bus. */
export function isHvvFerry(line: string): boolean {
  return FERRIES.has(line.trim().toUpperCase());
}

/**
 * The badge style hvv uses for a line name, or null where hvv draws no coloured
 * badge (regional and long-distance trains) or the line is unknown.
 */
export function hvvLineStyle(line: string): LineStyle | null {
  const name = line.trim().toUpperCase();
  if (RAIL[name]) return RAIL[name];
  if (/^A\d+$/.test(name)) return AKN;
  if (FERRIES.has(name)) return FERRY;
  if (/^6\d\d$/.test(name)) return NIGHT_BUS;
  // hvv's icon for X11 is red, the other Xpressbus lines are green
  if (/^X\d+$/.test(name)) return name === 'X11' ? BUS : XPRESS_BUS;
  if (/^\d+$/.test(name)) return BUS;
  return null;
}
