import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type * as maplibregl from 'maplibre-gl';
import type { PoliticalDistrict } from '../../../lib/api.js';
import { getPartyColor } from '../../../lib/party-colors.js';
import { DISTRICT_URLS } from '../constants.js';
import {
  applyPoliticalStyling,
  buildPoliticalPopupHtml,
  findPoliticalDistrict,
  updatePoliticalMarkers,
} from './political';

vi.mock('../../../lib/map-icons.js', () => ({
  registerPoliticalIcons: vi.fn(),
  createVerticalBadgeIcon: vi.fn(() => ({})),
}));

const readGeo = (rel: string): GeoJSON.FeatureCollection =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

const BOUNDARIES = {
  berlin: { geo: readGeo('../../../data/districts/berlin-bezirke.geojson'), nameField: DISTRICT_URLS.berlin.nameField },
  hamburg: { geo: readGeo('../../../data/districts/hamburg-bezirke.geojson'), nameField: DISTRICT_URLS.hamburg.nameField },
};

/** Names the server stores for Berlin's `bezirke` and `state-bezirke` levels
 *  (BEZIRKSBUERGERMEISTER and BERLIN_BEZIRKE in ingest-political.ts). */
const BERLIN_BEZIRK_NAMES = [
  'Mitte', 'Friedrichshain-Kreuzberg', 'Pankow', 'Charlottenburg-Wilmersdorf',
  'Spandau', 'Steglitz-Zehlendorf', 'Tempelhof-Schöneberg', 'Neukölln',
  'Treptow-Köpenick', 'Marzahn-Hellersdorf', 'Lichtenberg', 'Reinickendorf',
];

/** Bundestag constituency names as normalizeConstituencyName() leaves them,
 *  keyed by the Bezirk boundary each one covers. */
const BERLIN_BUNDESTAG: Record<string, string> = {
  'Mitte': 'Berlin-Mitte',
  'Friedrichshain-Kreuzberg': 'Berlin-Friedrichshain-Kreuzberg – Prenzlauer Berg Ost',
  'Pankow': 'Berlin-Pankow',
  'Charlottenburg-Wilmersdorf': 'Berlin-Charlottenburg-Wilmersdorf',
  'Spandau': 'Berlin-Spandau – Charlottenburg Nord',
  'Steglitz-Zehlendorf': 'Berlin-Steglitz-Zehlendorf',
  'Tempelhof-Schöneberg': 'Berlin-Tempelhof-Schöneberg',
  'Neukölln': 'Berlin-Neukölln',
  'Treptow-Köpenick': 'Berlin-Treptow-Köpenick',
  'Marzahn-Hellersdorf': 'Berlin-Marzahn-Hellersdorf',
  'Lichtenberg': 'Berlin-Lichtenberg',
  'Reinickendorf': 'Berlin-Reinickendorf',
};

const HAMBURG_BUNDESTAG: Record<string, string> = {
  'Hamburg-Mitte': 'Hamburg-Mitte',
  'Altona': 'Hamburg-Altona',
  'Eimsbüttel': 'Hamburg-Eimsbüttel',
  'Hamburg-Nord': 'Hamburg-Nord',
  'Wandsbek': 'Hamburg-Wandsbek',
  'Bergedorf': 'Hamburg-Bergedorf – Harburg',
  'Harburg': 'Hamburg-Bergedorf – Harburg',
};

const PARTIES = ['SPD', 'CDU', 'Grüne', 'Die Linke', 'AfD', 'FDP', 'BSW', 'CSU'];

/** One district per name, each with a distinct representative. */
function makeDistricts(names: string[], level: PoliticalDistrict['level']): PoliticalDistrict[] {
  return [...new Set(names)].map((name, i) => ({
    id: `${level}-${i}`,
    name,
    level,
    representatives: [{ name: `Rep of ${name}`, party: PARTIES[i % PARTIES.length], role: 'x' }],
  }));
}

interface Case {
  label: string;
  boundary: keyof typeof BOUNDARIES;
  subLayer: 'bezirke' | 'bundestag' | 'landesparlament';
  districts: PoliticalDistrict[];
  /** Bezirk boundary name → name of the district whose data it should show. */
  expected: Record<string, string>;
}

const CASES: Case[] = [
  {
    label: 'Berlin bezirke',
    boundary: 'berlin',
    subLayer: 'bezirke',
    districts: makeDistricts(BERLIN_BEZIRK_NAMES, 'bezirk'),
    expected: Object.fromEntries(BERLIN_BEZIRK_NAMES.map((n) => [n, n])),
  },
  {
    label: 'Berlin state-bezirke',
    boundary: 'berlin',
    subLayer: 'landesparlament',
    districts: makeDistricts(BERLIN_BEZIRK_NAMES, 'landesparlament'),
    expected: Object.fromEntries(BERLIN_BEZIRK_NAMES.map((n) => [n, n])),
  },
  {
    label: 'Berlin bundestag',
    boundary: 'berlin',
    subLayer: 'bundestag',
    districts: makeDistricts([...Object.values(BERLIN_BUNDESTAG), 'Landesliste'], 'bundestag'),
    expected: BERLIN_BUNDESTAG,
  },
  {
    label: 'Hamburg bundestag',
    boundary: 'hamburg',
    subLayer: 'bundestag',
    districts: makeDistricts([...Object.values(HAMBURG_BUNDESTAG), 'Landesliste'], 'bundestag'),
    expected: HAMBURG_BUNDESTAG,
  },
];

/** Evaluates the subset of MapLibre expressions the political fill uses. */
function evaluate(expr: unknown, props: Record<string, unknown>): unknown {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr as [string, ...unknown[]];
  switch (op) {
    case 'get':
      return props[args[0] as string];
    case 'downcase':
      return String(evaluate(args[0], props)).toLowerCase();
    case 'match': {
      const input = evaluate(args[0], props);
      for (let i = 1; i < args.length - 1; i += 2) {
        if (args[i] === input) return args[i + 1];
      }
      return args[args.length - 1];
    }
    default:
      throw new Error(`unsupported expression ${op}`);
  }
}

function colourOf(c: Case, boundaryName: string): string {
  const d = c.districts.find((x) => x.name === c.expected[boundaryName])!;
  return getPartyColor(d.representatives[0].party);
}

function fillExpression(c: Case): unknown[] {
  const { geo, nameField } = BOUNDARIES[c.boundary];
  let fill: unknown;
  const map = {
    getLayer: (id: string) => (id === 'district-fill' ? {} : undefined),
    getSource: (id: string) => (id === 'districts' ? {} : undefined),
    setPaintProperty: (layer: string, prop: string, value: unknown) => {
      if (layer === 'district-fill' && prop === 'fill-color') fill = value;
    },
  } as unknown as maplibregl.Map;
  applyPoliticalStyling(map, c.districts, geo.features, false, nameField);
  return fill as unknown[];
}

function fillColours(c: Case): Map<string, unknown> {
  const { geo, nameField } = BOUNDARIES[c.boundary];
  const fill = fillExpression(c);
  return new Map(geo.features.map((f) => {
    const props = f.properties ?? {};
    return [props[nameField] as string, evaluate(fill, props)];
  }));
}

function markerColours(c: Case): Map<string, unknown> {
  const { geo, nameField } = BOUNDARIES[c.boundary];
  let data: GeoJSON.FeatureCollection | undefined;
  const map = {
    getLayer: () => undefined,
    getSource: () => undefined,
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    hasImage: () => false,
    addImage: vi.fn(),
    addSource: (_id: string, src: { data: GeoJSON.FeatureCollection }) => { data = src.data; },
    addLayer: vi.fn(),
  } as unknown as maplibregl.Map;
  updatePoliticalMarkers(map, c.districts, geo.features, c.subLayer, nameField, false);
  return new Map((data?.features ?? []).map((f) => [f.properties!.name as string, f.properties!.color]));
}

describe.each(CASES)('political layer, $label', (c) => {
  const { geo, nameField } = BOUNDARIES[c.boundary];
  const boundaryNames = geo.features.map((f) => f.properties![nameField] as string);

  it('covers every Bezirk boundary in the fixture', () => {
    expect([...boundaryNames].sort()).toEqual(Object.keys(c.expected).sort());
  });

  it.each(boundaryNames)('resolves %s to its own district', (name) => {
    expect(findPoliticalDistrict(name, c.districts)?.name).toBe(c.expected[name]);
  });

  it('builds a fill expression with one branch per boundary', () => {
    const fill = fillExpression(c);
    const labels = fill.slice(2, -1).filter((_, i) => i % 2 === 0);
    expect(new Set(labels).size).toBe(labels.length);
    expect([...labels].sort()).toEqual([...boundaryNames].sort());
  });

  it.each(boundaryNames)('fills %s with its party colour', (name) => {
    expect(fillColours(c).get(name)).toBe(colourOf(c, name));
  });

  it.each(boundaryNames)('colours the %s marker', (name) => {
    expect(markerColours(c).get(name)).toBe(colourOf(c, name));
  });

  it.each(boundaryNames)('shows the representatives of %s in its popup', (name) => {
    expect(buildPoliticalPopupHtml(name, c.districts)).toContain(`Rep of ${c.expected[name]}`);
  });
});

describe('findPoliticalDistrict', () => {
  const d = (name: string) => ({ name });

  it('never shortens a double-barrelled boundary name', () => {
    expect(findPoliticalDistrict('Steglitz-Zehlendorf', [d('Zehlendorf')])).toBeUndefined();
    expect(findPoliticalDistrict('Hamburg-Nord', [d('Nord')])).toBeUndefined();
  });

  it('drops at most one leading segment from a data name', () => {
    expect(findPoliticalDistrict('Kreuzberg', [d('Berlin-Friedrichshain-Kreuzberg')])).toBeUndefined();
  });

  it('prefers an exact name over one with a city prefix', () => {
    const exact = d('Mitte');
    expect(findPoliticalDistrict('Mitte', [d('Berlin-Mitte'), exact])).toBe(exact);
  });

  it("prefers a constituency's first area over one named after the dash", () => {
    const own = d('Hamburg-Harburg');
    expect(findPoliticalDistrict('Harburg', [d('Hamburg-Bergedorf – Harburg'), own])).toBe(own);
  });

  it('accepts a spaced hyphen or em dash between areas', () => {
    expect(findPoliticalDistrict('Spandau', [d('Berlin-Spandau - Charlottenburg Nord')])?.name)
      .toBe('Berlin-Spandau - Charlottenburg Nord');
    expect(findPoliticalDistrict('Harburg', [d('Hamburg-Bergedorf — Harburg')])?.name)
      .toBe('Hamburg-Bergedorf — Harburg');
  });

  it('matches regardless of case and surrounding space', () => {
    expect(findPoliticalDistrict(' tempelhof-schöneberg ', [d('Berlin-Tempelhof-Schöneberg')])?.name)
      .toBe('Berlin-Tempelhof-Schöneberg');
  });

  it('finds nothing for an empty name or the Landesliste group', () => {
    expect(findPoliticalDistrict('', [d('Mitte')])).toBeUndefined();
    expect(findPoliticalDistrict('Mitte', [d('Landesliste')])).toBeUndefined();
  });
});
