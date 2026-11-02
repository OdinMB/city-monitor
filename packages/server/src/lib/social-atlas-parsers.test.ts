import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadWorkbook, sheetToAoa } from './xlsx.js';
import {
  mssLayerNames, parseHamburgSozialmonitoring, parseKoelnSocialAtlas, parseMss, socialAtlasEdition, statusIndexOf,
  SOCIAL_ATLAS_METRICS,
} from './social-atlas-parsers.js';

/**
 * Recorded on 2026-11-02 and trimmed: the Köln Datenkatalog's header with the
 * city, one Stadtteil and three Quartiere for 2024 and 2025; the Hamburg
 * Sozialmonitoring 2025 annex with its header rows and three Statistische Gebiete.
 */
const fixture = (name: string) => new URL(`./social-atlas-fixtures/${name}`, import.meta.url);

describe('mssLayerNames', () => {
  it('derives the edition year and both layer names from the WFS URL', () => {
    expect(mssLayerNames('https://gdi.berlin.de/services/wfs/mss_2025')).toEqual({
      year: '2025',
      indicators: 'mss_2025:mss2025_indexind_542',
      indices: 'mss_2025:mss2025_indizes_542',
    });
  });
});

describe('socialAtlasEdition', () => {
  it('names the MSS report year, Köln\'s data year and Hamburg\'s report year', () => {
    expect(socialAtlasEdition({ provider: 'mss-wfs', wfsUrl: 'https://gdi.berlin.de/services/wfs/mss_2027' })).toBe('2027');
    expect(socialAtlasEdition({ provider: 'koeln-datenkatalog', csvUrl: 'x', year: 2025, outlines: 'k.geojson' })).toBe('2025');
    expect(socialAtlasEdition({ provider: 'hh-sozialmonitoring', xlsxUrl: 'x', reportYear: 2025, outlines: 'h.geojson' })).toBe('2025');
  });
});

describe('statusIndexOf', () => {
  it('numbers the four status classes from hoch to sehr niedrig', () => {
    expect(['hoch', 'mittel', 'niedrig', 'sehr niedrig'].map(statusIndexOf)).toEqual([1, 2, 3, 4]);
    expect(statusIndexOf('unbekannt')).toBeNull();
    expect(statusIndexOf(undefined)).toBeNull();
  });
});

describe('parseMss', () => {
  it('keeps valid areas, joins the status index and leaves a missing indicator null', () => {
    const areas = parseMss(
      [
        { geometry: { type: 'Polygon', coordinates: [] }, properties: { plr_id: '1', plr_name: 'A', bez_id: '01', ew: 900, kom: 'gültig', s1: 3, s2: 20, s3: 8, s4: null } },
        { geometry: null, properties: { plr_id: '2', plr_name: 'B', bez_id: '01', ew: 100, kom: 'ungültig (EW unter 300)', s1: 1, s2: 1, s3: 1, s4: 1 } },
      ],
      [{ geometry: null, properties: { plr_id: '1', si_n: 3, si_v: 'niedrig' } }],
    );
    expect(areas).toHaveLength(1);
    expect(areas[0]!.geometry).toEqual({ type: 'Polygon', coordinates: [] });
    expect(areas[0]!.props).toEqual({
      plrId: '1', plrName: 'A', bezId: '01', population: 900, statusIndex: 3, statusLabel: 'niedrig',
      unemployment: 3, singleParent: 20, welfare: 8, childPoverty: null,
    });
  });
});

describe('parseKoelnSocialAtlas', () => {
  const csv = readFileSync(fixture('koeln-datenkatalog.csv'), 'utf8');

  it('reads the Quartiere of the configured year and nothing else', () => {
    const areas = parseKoelnSocialAtlas(csv, 2025);
    expect(areas.map((a) => a.props.plrId)).toEqual(['101010001', '101020001', '309050002']);
    expect(parseKoelnSocialAtlas(csv, 2024)).toHaveLength(3);
    expect(parseKoelnSocialAtlas(csv, 2019)).toEqual([]);
  });

  it('maps the unemployment rate, single-parent households and SGB II share, with no child poverty or status index', () => {
    const kapitol = parseKoelnSocialAtlas(csv, 2025)[0]!.props;
    expect(kapitol.plrName).toBe('Kapitol-Viertel');
    expect(kapitol.population).toBe(1755);
    expect(kapitol.unemployment).toBeCloseTo(6.337, 3);
    expect(kapitol.singleParent).toBeCloseTo(0.861, 3);
    expect(kapitol.welfare).toBeCloseTo(6.207, 3);
    expect(kapitol.childPoverty).toBeNull();
    expect(kapitol.statusIndex).toBeNull();
    expect(SOCIAL_ATLAS_METRICS['koeln-datenkatalog']).not.toContain('childPoverty');
  });

  it('leaves an empty cell null', () => {
    const widdersdorf = parseKoelnSocialAtlas(csv, 2025)[2]!.props;
    expect(widdersdorf.welfare).toBeNull();
    expect(widdersdorf.unemployment).toBeCloseTo(1.262, 3);
  });

  it('fails loudly when a column it needs is gone', () => {
    expect(() => parseKoelnSocialAtlas(csv.replace('D0001P', 'D9999P'), 2025)).toThrow(/D0001P/);
  });
});

describe('parseHamburgSozialmonitoring', () => {
  async function sheets() {
    const bytes = readFileSync(fixture('hh-sozialmonitoring.xlsx'));
    const wb = await loadWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return [sheetToAoa(wb.getWorksheet('I_Indizes')!), sheetToAoa(wb.getWorksheet('II_Indikatoren')!)] as const;
  }

  it('reads every area of the index sheet with its Bezirk, population and status class', async () => {
    const areas = parseHamburgSozialmonitoring(...(await sheets()));
    expect(areas.map((a) => a.props.plrId)).toEqual(['4001', '102001', '104001']);
    expect(areas[1]!.props).toMatchObject({ plrName: 'Francop 102001', bezId: 'Harburg', population: 749, statusIndex: 2, statusLabel: 'mittel' });
  });

  it('turns the z-scores back into shares with the sheet\'s mean and SD', async () => {
    const francop = parseHamburgSozialmonitoring(...(await sheets()))[1]!.props;
    // S5 0.168 + (-0.71 × 0.141) = 6.8 %, the Stadtteil statistics' figure for Francop
    expect(francop.childPoverty).toBe(6.8);
    expect(francop.welfare).toBe(5); // S3: 0.105 + (-0.52 × 0.105)
    expect(francop.unemployment).toBe(2.1); // S4: 0.041 + (-0.61 × 0.033)
    expect(francop.singleParent).toBe(18.4); // S2: 0.216 + (-0.36 × 0.09)
  });

  it('floors a share that rounding pushes below zero at 0', async () => {
    const stPauli = parseHamburgSozialmonitoring(...(await sheets()))[0]!.props;
    // z -1.25 for S4 gives -0.03 %: no unemployed at all
    expect(stPauli.unemployment).toBe(0);
  });

  it('fails loudly when the mean/SD rows are missing', async () => {
    const [index, indicators] = await sheets();
    const withoutStats = indicators.filter((r) => !(Array.isArray(r) && r.includes('Mittelwert')));
    expect(() => parseHamburgSozialmonitoring(index, withoutStats)).toThrow(/Mittelwert/);
  });
});
