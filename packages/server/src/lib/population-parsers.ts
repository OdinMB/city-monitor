/**
 * One parser per population provider (`dataSources.population.provider`).
 * Each yields residents per area (total, under 18, 65 and older, non-German
 * nationality) and the snapshot date; ingest-population.ts adds polygons,
 * density and the city summary.
 */
import type { PopulationSource } from '@city-monitor/shared';
import { KOELN_QUARTIER_LEVEL, parseKoelnDatenkatalog } from './koeln-datenkatalog.js';
import { districtRows, parseIndikatorCsv, type IndikatorRow } from './muenchen-indikatorenatlas.js';

export type PopulationProvider = PopulationSource['provider'];

export interface PopulationArea {
  id: string;
  /** The area's name, where the source has one (otherwise the outline file's, or the ID). */
  name?: string;
  total: number;
  youth: number;   // under 18
  elderly: number; // 65 and older
  foreign: number; // non-German nationality
  /** Area in km², where the source states it (otherwise computed from the polygon). */
  areaKm2?: number;
}

export interface PopulationData {
  areas: PopulationArea[];
  /** ISO date of the count ("2025-12-31"). */
  snapshotDate: string;
  /**
   * The city's total at the previous count, for a source that carries it
   * (Köln, Hamburg and München: the year before). Berlin's XLSX holds one count, so its
   * change comes from the previous database snapshot instead.
   */
  previousTotal?: number;
}

// ---------------------------------------------------------------------------
// Berlin: EWR XLSX (Amt für Statistik Berlin-Brandenburg)
// ---------------------------------------------------------------------------

/** Parse a cell value that may have space thousands separators (e.g. " 3 469") */
export function parseSpaceNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return 0;
  const cleaned = val.replace(/\s/g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Sheet T2: residents by age group per Planungsraum, keyed by the 8-digit PLR ID. */
export function parseEwrT2Sheet(rows: unknown[][]): PopulationArea[] {
  const results: PopulationArea[] = [];

  // Find the header row containing 'Insgesamt' (may be hyphenated as 'Ins-\ngesamt')
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Array.isArray(row) && row.some((c) => typeof c === 'string' && c.replace(/[\s-]/g, '').includes('Insgesamt'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return results;

  // Column indices (0-based): BEZ=0, PGR=1, BZR=2, PLR=3, Insgesamt=4,
  // unter6=5, 6-15=6, 15-18=7, 18-27=8, 27-45=9, 45-55=10, 55-65=11, 65+=12,
  // weiblich=13, Ausländer=14
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 15) continue;

    const [bez, pgr, bzr, plr] = row;
    // Only PLR-level rows: all 4 geo columns must be filled non-empty values
    if (!bez || !pgr || !bzr || !plr) continue;
    const plrStr = String(plr).trim();
    if (plrStr.length === 0) continue;

    const total = parseSpaceNumber(row[4]);
    if (total === 0) continue; // Skip empty rows

    // Build 8-digit composite PLR ID: BEZ(2) + PGR(2) + BZR(2) + PLR(2)
    const id = `${String(bez).trim().padStart(2, '0')}${String(pgr).trim().padStart(2, '0')}${String(bzr).trim().padStart(2, '0')}${plrStr.padStart(2, '0')}`;

    results.push({
      id,
      total,
      youth: parseSpaceNumber(row[5]) + parseSpaceNumber(row[6]) + parseSpaceNumber(row[7]),
      elderly: parseSpaceNumber(row[12]),
      foreign: parseSpaceNumber(row[14]),
    });
  }

  return results;
}

/** Sheet Schlüssel: PLR ID → Planungsraum name. */
export function parseEwrSchluessel(rows: unknown[][]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length < 5) continue;
    const bez = String(row[0] ?? '').trim();
    const pgr = String(row[1] ?? '').trim();
    const bzr = String(row[2] ?? '').trim();
    const plr = String(row[3] ?? '').trim();
    const name = String(row[4] ?? '').trim();
    // Only PLR-level rows: all 4 geo columns and name must be filled
    if (!bez || !pgr || !bzr || !plr || !name) continue;
    // Skip header rows (non-numeric values)
    if (!/^\d+$/.test(bez)) continue;
    lookup.set(`${bez.padStart(2, '0')}${pgr.padStart(2, '0')}${bzr.padStart(2, '0')}${plr.padStart(2, '0')}`, name);
  }

  return lookup;
}

const GERMAN_MONTHS: Record<string, string> = {
  'Januar': '01', 'Februar': '02', 'März': '03', 'April': '04',
  'Mai': '05', 'Juni': '06', 'Juli': '07', 'August': '08',
  'September': '09', 'Oktober': '10', 'November': '11', 'Dezember': '12',
};

/** The count date from the T2 sheet's title rows ("… am 31. Dezember 2025"), else today. */
export function extractEwrSnapshotDate(rows: unknown[][]): string {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      const numMatch = cell.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
      if (numMatch) return `${numMatch[3]}-${numMatch[2]}-${numMatch[1]!.padStart(2, '0')}`;
      const deMatch = cell.match(/(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/);
      if (deMatch) return `${deMatch[3]}-${GERMAN_MONTHS[deMatch[2]!]}-${deMatch[1]!.padStart(2, '0')}`;
    }
  }
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Köln: Statistischer Datenkatalog
// ---------------------------------------------------------------------------

/**
 * A0025A residents; A0002A non-Germans; under 18: A0029A (0–3), A0035A (3–6),
 * A0291A (6–15), A0043A (15–18); 65 and older: A0295A (65–75), A0065A
 * (75–80), A0027A (80+). Counts as of 31 December of the row's year.
 */
const KOELN_POPULATION_CODES = ['A0025A', 'A0002A', 'A0029A', 'A0035A', 'A0291A', 'A0043A', 'A0295A', 'A0065A', 'A0027A'] as const;

/** The newest year's Quartier rows, and the year before's city total. */
export function parseKoelnPopulation(csv: string): PopulationData {
  const rows = parseKoelnDatenkatalog(csv, { codes: KOELN_POPULATION_CODES, level: KOELN_QUARTIER_LEVEL });
  if (rows.length === 0) return { areas: [], snapshotDate: '' };
  const year = Math.max(...rows.map((r) => r.year));
  const v = (r: (typeof rows)[number], code: (typeof KOELN_POPULATION_CODES)[number]) => r.values[code] ?? 0;

  const areas = rows.filter((r) => r.year === year && v(r, 'A0025A') > 0).map((r) => ({
    id: r.id,
    name: r.name,
    total: v(r, 'A0025A'),
    youth: v(r, 'A0029A') + v(r, 'A0035A') + v(r, 'A0291A') + v(r, 'A0043A'),
    elderly: v(r, 'A0295A') + v(r, 'A0065A') + v(r, 'A0027A'),
    foreign: v(r, 'A0002A'),
  }));
  const previous = rows.filter((r) => r.year === year - 1);
  return {
    areas,
    snapshotDate: `${year}-12-31`,
    previousTotal: previous.length > 0 ? previous.reduce((s, r) => s + v(r, 'A0025A'), 0) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Hamburg: Regionalstatistische Daten der Stadtteile (OGC API Features)
// ---------------------------------------------------------------------------

/** The properties requested from the OGC API (`properties=`, with `skipGeometry=true`). */
export const HH_STADTTEIL_PROPERTIES = [
  'jahr', 'jahr_date', 'stadtteil_nr', 'stadtteil', 'bev_insgesamt', 'bev_u18', 'bev_ab65', 'bev_auslaender_anz', 'flaeche_brutto_ha',
] as const;

/** The items query: every year (about 1,300 rows, 340 KB), so the newest and the one before come in one request. */
export function hamburgStadtteileUrl(itemsUrl: string): string {
  return `${itemsUrl}?f=json&skipGeometry=true&limit=5000&properties=${HH_STADTTEIL_PROPERTIES.join(',')}`;
}

/**
 * The newest year's 99 Stadtteile and the year before's total. The four
 * smallest Stadtteile come merged into a neighbour, as the source publishes
 * them. Counts as of 31 December (`jahr_date`).
 */
export function parseHamburgStadtteile(json: unknown): PopulationData {
  const features = (json as { features?: Array<{ properties?: Record<string, unknown> }> })?.features ?? [];
  const props = features.map((f) => f.properties ?? {}).filter((p) => p.stadtteil_nr != null && p.jahr != null);
  if (props.length === 0) return { areas: [], snapshotDate: '' };
  const yearOf = (p: Record<string, unknown>) => Number(p.jahr);
  const year = Math.max(...props.map(yearOf));
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const latest = props.filter((p) => yearOf(p) === year && n(p.bev_insgesamt) > 0);
  const previous = props.filter((p) => yearOf(p) === year - 1);
  return {
    areas: latest.map((p) => ({
      id: String(p.stadtteil_nr),
      name: typeof p.stadtteil === 'string' ? p.stadtteil : undefined,
      total: n(p.bev_insgesamt),
      youth: n(p.bev_u18),
      elderly: n(p.bev_ab65),
      foreign: n(p.bev_auslaender_anz),
      areaKm2: n(p.flaeche_brutto_ha) > 0 ? n(p.flaeche_brutto_ha) / 100 : undefined,
    })),
    snapshotDate: typeof latest[0]?.jahr_date === 'string' ? latest[0].jahr_date : `${year}-12-31`,
    previousTotal: previous.length > 0 ? previous.reduce((s, p) => s + n(p.bev_insgesamt), 0) : undefined,
  };
}

// ---------------------------------------------------------------------------
// München: Indikatorenatlas ("Bevölkerung – Altersgruppen" and "– Nichtdeutsche")
// ---------------------------------------------------------------------------

/**
 * The newest year's 25 Stadtbezirke and the year before's total. Counts are
 * the residents with their main home in München (Hauptwohnsitzbevölkerung),
 * from Basiswert 1 of the rows "insgesamt", "bis 17 Jahre" and "65 Jahre und
 * älter" (age groups) and "insgesamt" (non-Germans), as of 31 December. The
 * area comes from the outline file, which carries the GeodatenService's.
 */
export function parseMuenchenPopulation(ageGroupsCsv: string, foreignCsv: string): PopulationData {
  const ages = parseIndikatorCsv(ageGroupsCsv);
  const totals = districtRows(ages, 'insgesamt');
  if (totals.length === 0) return { areas: [], snapshotDate: '' };
  const year = Math.max(...totals.map((r) => r.year));
  const byId = (rows: IndikatorRow[]) => new Map(rows.map((r) => [r.districtId!, r.base1 ?? 0]));
  const youth = byId(districtRows(ages, 'bis 17 Jahre', year));
  const elderly = byId(districtRows(ages, '65 Jahre und älter', year));
  const foreign = byId(districtRows(parseIndikatorCsv(foreignCsv), 'insgesamt', year));

  const areas = totals.filter((r) => r.year === year && (r.base1 ?? 0) > 0).map((r) => ({
    id: r.districtId!,
    name: r.name,
    total: r.base1!,
    youth: youth.get(r.districtId!) ?? 0,
    elderly: elderly.get(r.districtId!) ?? 0,
    foreign: foreign.get(r.districtId!) ?? 0,
  }));
  const previous = totals.filter((r) => r.year === year - 1);
  return {
    areas,
    snapshotDate: `${year}-12-31`,
    previousTotal: previous.length > 0 ? previous.reduce((s, r) => s + (r.base1 ?? 0), 0) : undefined,
  };
}
