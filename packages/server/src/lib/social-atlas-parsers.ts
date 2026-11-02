/**
 * One parser per social-atlas provider (`dataSources.socialAtlas.provider`).
 * Each turns the source's own format into `SocialAtlasFeatureProps` per area;
 * ingest-social-atlas.ts fetches the source and adds the polygons.
 *
 * The four indicator slots mean roughly the same in every city, but not
 * exactly: each city's source defines them its own way, and the web app labels
 * them per city (packages/web/src/lib/social-atlas.ts). A slot a source lacks
 * stays null and its sub-layer is hidden for that city.
 */
import type { SocialAtlasFeatureProps, SocialAtlasSource } from '@city-monitor/shared';
import { KOELN_QUARTIER_LEVEL, parseKoelnDatenkatalog } from './koeln-datenkatalog.js';
import { districtRows, parseIndikatorCsv } from './muenchen-indikatorenatlas.js';

export type SocialAtlasProvider = SocialAtlasSource['provider'];
export type SocialAtlasMetric = 'unemployment' | 'singleParent' | 'welfare' | 'childPoverty';

/**
 * The indicators each provider has, in the order the sidebar lists them. The
 * web app's per-city labels must name exactly these
 * (packages/web/src/config/index.test.ts checks).
 */
export const SOCIAL_ATLAS_METRICS: Record<SocialAtlasProvider, readonly SocialAtlasMetric[]> = {
  // MSS: s1 Arbeitslosigkeit, s2 Kinder und Jugendliche in Haushalten Alleinerziehender, s3 Transferbezug, s4 Kinderarmut
  'mss-wfs': ['unemployment', 'singleParent', 'welfare', 'childPoverty'],
  // No SGB II share of children in the Datenkatalog: no child-poverty slot.
  'koeln-datenkatalog': ['unemployment', 'singleParent', 'welfare'],
  // Sozialmonitoring: S4 Arbeitslose, S2 Kinder von Alleinerziehenden, S3 SGB-II- und AsylbLG-Empfänger, S5 Kinder in Mindestsicherung
  'hh-sozialmonitoring': ['unemployment', 'singleParent', 'welfare', 'childPoverty'],
  // Indikatorenatlas: Arbeitslose – Anteil, Haushalte Alleinerziehend, (Regel-)Leistungsberechtigte erwerbsfähig / nicht erwerbsfähig – Anteil
  'muenchen-indikatorenatlas': ['unemployment', 'singleParent', 'welfare', 'childPoverty'],
};

/** Whether the provider has a status index (four classes, "hoch" … "sehr niedrig"), shown in the popup. */
export const SOCIAL_ATLAS_HAS_STATUS_INDEX: Record<SocialAtlasProvider, boolean> = {
  'mss-wfs': true,
  'koeln-datenkatalog': false,
  'hh-sozialmonitoring': true,
  'muenchen-indikatorenatlas': false,
};

/** The edition the web app names next to each indicator: the MSS report year, Köln's and München's data year, Hamburg's report year. */
export function socialAtlasEdition(source: SocialAtlasSource): string {
  switch (source.provider) {
    case 'mss-wfs': return mssLayerNames(source.wfsUrl).year;
    case 'koeln-datenkatalog': return String(source.year);
    case 'hh-sozialmonitoring': return String(source.reportYear);
    case 'muenchen-indikatorenatlas': return String(source.year);
  }
}

export interface SocialAtlasArea {
  props: SocialAtlasFeatureProps;
  /** The polygon, for a source that ships one (the MSS WFS); the others take it from their outline file. */
  geometry?: unknown;
}

const STATUS_CLASSES = ['hoch', 'mittel', 'niedrig', 'sehr niedrig'];

/** 1–4 for a status class name ("hoch" … "sehr niedrig"), null for anything else. */
export function statusIndexOf(label: unknown): number | null {
  if (typeof label !== 'string') return null;
  const i = STATUS_CLASSES.indexOf(label.trim().toLowerCase());
  return i < 0 ? null : i + 1;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------------------------------------------------------------------------
// Berlin: MSS WFS
// ---------------------------------------------------------------------------

/**
 * The two MSS layers of the edition the WFS URL names. Each edition is its own
 * service (`…/wfs/mss_2025`) whose layers carry the year (`mss_2025:mss2025_indexind_542`),
 * so a new edition only needs a new `wfsUrl` in the city config.
 */
export function mssLayerNames(wfsUrl: string): { year: string; indicators: string; indices: string } {
  const workspace = wfsUrl.replace(/\/+$/, '').split('/').pop() ?? '';
  const match = /^mss_(\d{4})$/.exec(workspace);
  if (!match) throw new Error(`social atlas wfsUrl must end in mss_<year>: ${wfsUrl}`);
  const year = match[1]!;
  return {
    year,
    indicators: `${workspace}:mss${year}_indexind_542`,
    indices: `${workspace}:mss${year}_indizes_542`,
  };
}

interface WfsFeature {
  geometry: unknown;
  properties: Record<string, unknown>;
}

/**
 * Join the MSS indicator layer with the index layer on `plr_id`. Areas the MSS
 * marks invalid (`kom` other than "gültig": under 300 residents, outliers) are
 * left out.
 */
export function parseMss(indicatorFeatures: WfsFeature[], indexFeatures: WfsFeature[]): SocialAtlasArea[] {
  const indices = new Map<string, { si_n: number; si_v: string }>();
  for (const f of indexFeatures) {
    const plrId = f.properties.plr_id as string;
    if (plrId && f.properties.si_n != null) {
      indices.set(plrId, { si_n: f.properties.si_n as number, si_v: f.properties.si_v as string });
    }
  }

  const areas: SocialAtlasArea[] = [];
  for (const f of indicatorFeatures) {
    const p = f.properties;
    if (p.kom !== 'gültig') continue;
    const plrId = p.plr_id as string;
    const index = indices.get(plrId);
    areas.push({
      geometry: f.geometry,
      props: {
        plrId,
        plrName: p.plr_name as string,
        bezId: p.bez_id as string,
        population: num(p.ew) ?? 0,
        statusIndex: index?.si_n ?? null,
        statusLabel: index?.si_v ?? null,
        unemployment: num(p.s1),
        singleParent: num(p.s2),
        welfare: num(p.s3),
        childPoverty: num(p.s4),
      },
    });
  }
  return areas;
}

// ---------------------------------------------------------------------------
// Köln: Statistischer Datenkatalog
// ---------------------------------------------------------------------------

/**
 * The Datenkatalog columns read for the social atlas:
 * - D0001P Arbeitslosenquote (SGB II & III), unemployed per civilian labour force
 * - A0269P households with children and one parent, share of all households
 * - C0007P SGB II recipients aged 0 to pension age, share of residents that age
 * - A0025A residents
 */
export const KOELN_SOCIAL_CODES = ['A0025A', 'D0001P', 'A0269P', 'C0007P'] as const;

/** The Quartier rows of `year`, keyed by Quartier. The district and polygon come from the outline file. */
export function parseKoelnSocialAtlas(csv: string, year: number): SocialAtlasArea[] {
  return parseKoelnDatenkatalog(csv, { codes: KOELN_SOCIAL_CODES, level: KOELN_QUARTIER_LEVEL })
    .filter((r) => r.year === year)
    .map((r) => ({
      props: {
        plrId: r.id,
        plrName: r.name,
        bezId: '',
        population: r.values.A0025A ?? 0,
        statusIndex: null,
        statusLabel: null,
        unemployment: r.values.D0001P ?? null,
        singleParent: r.values.A0269P ?? null,
        welfare: r.values.C0007P ?? null,
        childPoverty: null,
      },
    }));
}

// ---------------------------------------------------------------------------
// Hamburg: Sozialmonitoring report annex (XLSX)
// ---------------------------------------------------------------------------

/** Sozialmonitoring indicator → slot. S1 (children with migration background), S6 and S7 have no Berlin counterpart. */
const HH_INDICATORS: ReadonlyArray<[string, SocialAtlasMetric]> = [
  ['S4', 'unemployment'],
  ['S2', 'singleParent'],
  ['S3', 'welfare'],
  ['S5', 'childPoverty'],
];

const cellText = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Sheets "I_Indizes" (Bezirk, Stadtteil, Stat. Gebiet, population, Statusindex)
 * and "II_Indikatoren" as array-of-arrays. Sheet II gives each indicator as a
 * z-score per area, with the city mean ("Mittelwert") and standard deviation
 * ("SD") of the shares in rows of their own; the share is mean + z × SD, as a
 * percentage. Checked on 2026-11-02 against areas whose Stadtteil is a single
 * Statistisches Gebiet: Francop's S5 comes out at 6.8 %, as the Stadtteil
 * statistics publish it, and S3 at 5.0 % against 5.1 % (the Stadtteil figure
 * leaves out AsylbLG).
 */
export function parseHamburgSozialmonitoring(indexRows: unknown[][], indicatorRows: unknown[][]): SocialAtlasArea[] {
  // Sheet II: the header row names the indicator columns S1…S7.
  const headerIdx = indicatorRows.findIndex((r) => Array.isArray(r) && r.some((c) => cellText(c) === 'S4') && r.some((c) => cellText(c) === 'S2'));
  if (headerIdx < 0) throw new Error('Hamburg Sozialmonitoring: no S1…S7 header in II_Indikatoren');
  const header = indicatorRows[headerIdx]!;
  const colOf = (code: string) => header.findIndex((c) => cellText(c) === code);
  const statRow = (label: string) => indicatorRows.find((r) => Array.isArray(r) && r.some((c) => cellText(c) === label));
  const meanRow = statRow('Mittelwert');
  const sdRow = statRow('SD');
  if (!meanRow || !sdRow) throw new Error('Hamburg Sozialmonitoring: no Mittelwert/SD rows in II_Indikatoren');

  const scales = HH_INDICATORS.map(([code, metric]) => {
    const col = colOf(code);
    const mean = num(meanRow[col]);
    const sd = num(sdRow[col]);
    if (col < 0 || mean === null || sd === null) throw new Error(`Hamburg Sozialmonitoring: no mean or SD for ${code}`);
    return { metric, col, mean, sd };
  });

  // Data rows of sheet II: column B holds the Statistisches Gebiet as a number.
  const values = new Map<string, Partial<Record<SocialAtlasMetric, number | null>>>();
  for (const row of indicatorRows.slice(headerIdx + 1)) {
    if (!Array.isArray(row) || typeof row[1] !== 'number') continue;
    const entry: Partial<Record<SocialAtlasMetric, number | null>> = {};
    for (const { metric, col, mean, sd } of scales) {
      const z = num(row[col]);
      entry[metric] = z === null ? null : Math.max(0, Math.round((mean + z * sd) * 1000) / 10);
    }
    values.set(String(row[1]), entry);
  }

  // Sheet I: one row per area with its status class.
  const areas: SocialAtlasArea[] = [];
  for (const row of indexRows) {
    if (!Array.isArray(row) || typeof row[2] !== 'number') continue;
    const id = String(row[2]);
    const v = values.get(id) ?? {};
    const statusLabel = cellText(row[4]) || null;
    areas.push({
      props: {
        plrId: id,
        plrName: `${cellText(row[1])} ${id}`,
        bezId: cellText(row[0]),
        population: num(row[3]) ?? 0,
        statusIndex: statusIndexOf(statusLabel),
        statusLabel,
        unemployment: v.unemployment ?? null,
        singleParent: v.singleParent ?? null,
        welfare: v.welfare ?? null,
        childPoverty: v.childPoverty ?? null,
      },
    });
  }
  return areas;
}

// ---------------------------------------------------------------------------
// München: Indikatorenatlas (one CSV per indicator)
// ---------------------------------------------------------------------------

/**
 * The CSV of each slot's dataset (`datasets` in the city config), as read:
 * - unemployment: "Arbeitslose – Anteil", unemployed per resident aged 15–64
 * - singleParent: "Haushalte Alleinerziehend", single-parent households with a
 *   child under 18, share of all private households
 * - welfare: "(Regel-)Leistungsberechtigte – erwerbsfähig – Anteil", employable
 *   SGB II recipients per resident aged 15–64
 * - childPoverty: "(Regel-)Leistungsberechtigte – nicht erwerbsfähig – Anteil",
 *   non-employable SGB II recipients (Sozialgeld) per resident aged 0–14
 * Each at the breakdown "insgesamt", for the 25 Stadtbezirke.
 */
export type MuenchenSocialCsvs = Record<SocialAtlasMetric, string>;

/**
 * The 25 Stadtbezirke of `year`. `population` is the unemployment figure's
 * base, residents aged 15–64, since none of these files counts all residents;
 * the popup does not show it. A slot whose file has no row for a district or
 * year stays null; no row in any file gives no areas.
 */
export function parseMuenchenSocialAtlas(csvs: MuenchenSocialCsvs, year: number): SocialAtlasArea[] {
  const metrics = SOCIAL_ATLAS_METRICS['muenchen-indikatorenatlas'];
  const byDistrict = new Map<string, { name: string; population: number; values: Partial<Record<SocialAtlasMetric, number | null>> }>();
  for (const metric of metrics) {
    for (const row of districtRows(parseIndikatorCsv(csvs[metric]), 'insgesamt', year)) {
      const id = row.districtId!;
      const entry = byDistrict.get(id) ?? { name: row.name, population: 0, values: {} };
      entry.values[metric] = row.value;
      if (metric === 'unemployment' && row.base2 !== null) entry.population = Math.round(row.base2);
      byDistrict.set(id, entry);
    }
  }
  return [...byDistrict.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, e]) => ({
      props: {
        plrId: id,
        plrName: e.name,
        bezId: id,
        population: e.population,
        statusIndex: null,
        statusLabel: null,
        unemployment: e.values.unemployment ?? null,
        singleParent: e.values.singleParent ?? null,
        welfare: e.values.welfare ?? null,
        childPoverty: e.values.childPoverty ?? null,
      },
    }));
}
