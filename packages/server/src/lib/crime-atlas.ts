/**
 * Parser for the Kriminalitätsatlas Berlin (Polizei Berlin, CC BY-SA): one
 * XLSX with a `Fallzahlen_<year>` sheet (cases) and an `HZ_<year>` sheet
 * (Häufigkeitszahl, cases per 100,000 residents) for each year, one row per
 * Bezirk and Bezirksregion and one column per offence group. See
 * .context/crime-atlas.md.
 */
import type { CrimeAreaProps, CrimeAtlasData, CrimeCounts, CrimeIndicator, CrimeRates } from '@city-monitor/shared';
import type { AreaOutline } from './area-outlines.js';

/**
 * The column each indicator is read from, by its header with whitespace and
 * hyphens removed (the headers break words over lines: "Fahrrad-\ndiebstahl").
 * Order is the map's order.
 */
export const CRIME_COLUMNS: ReadonlyArray<[CrimeIndicator, string]> = [
  ['total', 'Straftateninsgesamt'],
  ['assault', 'Körperverletzungeninsgesamt'],
  ['robbery', 'Raub'],
  ['burglary', 'Wohnraumeinbruch'],
  ['bikeTheft', 'Fahrraddiebstahl'],
  ['kiez', 'Kieztaten'],
];

/** The LOR key of the atlas's row for Berlin as a whole ("Berlin (PKS gesamt)"). */
const CITY_KEY = '999999';

export interface CrimeSheetRow {
  key: string;
  name: string;
  values: Record<CrimeIndicator, number | null>;
}

/** The newest year with both a cases and a rates sheet, or null. */
export function newestCrimeYear(sheetNames: readonly string[]): number | null {
  const years = (prefix: string) => new Set(sheetNames.flatMap((n) => {
    const m = new RegExp(`^${prefix}_(\\d{4})$`).exec(n.trim());
    return m ? [Number(m[1])] : [];
  }));
  const rates = years('HZ');
  const both = [...years('Fallzahlen')].filter((y) => rates.has(y));
  return both.length > 0 ? Math.max(...both) : null;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const v = value as { richText?: Array<{ text: string }>; result?: unknown; text?: string };
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.result != null) return String(v.result);
    if (v.text != null) return v.text;
  }
  return String(value);
}

function cellNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = cellText(value).trim();
  // "-" where the atlas has no figure (the "nicht zuzuordnen" rows)
  if (text === '' || text === '-') return null;
  const n = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const headerKey = (value: unknown) => cellText(value).replace(/[\s-]/g, '');

/**
 * The rows of one sheet (as an array of arrays) by LOR key: Bezirke
 * ("010000"), Bezirksregionen ("011001") and Berlin ("999999"). Throws when
 * the header row or a column the map needs is missing, so a changed layout
 * keeps the previous data instead of storing an empty map.
 */
export function parseCrimeSheet(rows: unknown[][]): Map<string, CrimeSheetRow> {
  const headerIndex = rows.findIndex((r) => cellText(r?.[0]).startsWith('LOR-Schlüssel'));
  if (headerIndex < 0) throw new Error('crime atlas: no "LOR-Schlüssel" header row');
  const header = rows[headerIndex]!.map(headerKey);
  const columns = CRIME_COLUMNS.map(([indicator, name]) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`crime atlas: no column "${name}"`);
    return [indicator, index] as const;
  });

  const out = new Map<string, CrimeSheetRow>();
  for (const row of rows.slice(headerIndex + 1)) {
    const key = cellText(row?.[0]).trim();
    if (!/^\d{6}$/.test(key)) continue;
    const values = Object.fromEntries(columns.map(([indicator, i]) => [indicator, cellNumber(row[i])])) as Record<CrimeIndicator, number | null>;
    out.set(key, { key, name: cellText(row[1]).replace(/\s+/g, ' ').trim(), values });
  }
  return out;
}

/** A Bezirk's row: the last four digits are zero. */
const isDistrict = (key: string) => key !== CITY_KEY && key.endsWith('0000');
/** A Bezirksregion's row; "xx99xx" rows collect cases the police could not place. */
const isArea = (key: string) => key !== CITY_KEY && !key.endsWith('0000') && key.slice(2, 4) !== '99';

const rate = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

function figures(rates: CrimeSheetRow | undefined, counts: CrimeSheetRow | undefined): CrimeRates & CrimeCounts {
  const out: Record<string, number | null> = {};
  for (const [indicator] of CRIME_COLUMNS) {
    out[indicator] = rate(rates?.values[indicator] ?? null);
    out[`${indicator}Count`] = counts?.values[indicator] ?? null;
  }
  return out as CrimeRates & CrimeCounts;
}

/**
 * The map's data: each Bezirksregion with an outline, its rates and counts,
 * and Berlin's as the average. Areas without an outline are left out (the
 * caller logs how many); null when the sheets have no Berlin row.
 */
export function buildCrimeAtlas(
  year: number,
  counts: Map<string, CrimeSheetRow>,
  rates: Map<string, CrimeSheetRow>,
  outlines: Map<string, AreaOutline>,
): { data: CrimeAtlasData; unmatched: string[] } | null {
  if (!rates.has(CITY_KEY)) return null;
  const districts = new Map([...rates.values()].filter((r) => isDistrict(r.key)).map((r) => [r.key.slice(0, 2), r.name]));
  const features: CrimeAtlasData['geojson']['features'] = [];
  const unmatched: string[] = [];
  for (const row of rates.values()) {
    if (!isArea(row.key)) continue;
    const outline = outlines.get(row.key);
    if (!outline) {
      unmatched.push(row.key);
      continue;
    }
    const properties: CrimeAreaProps = {
      areaId: row.key,
      name: row.name || outline.name || row.key,
      district: districts.get(row.key.slice(0, 2)) ?? outline.district ?? '',
      ...figures(row, counts.get(row.key)),
    };
    features.push({ type: 'Feature', geometry: outline.geometry, properties });
  }
  return {
    data: { year, city: figures(rates.get(CITY_KEY), counts.get(CITY_KEY)), geojson: { type: 'FeatureCollection', features } },
    unmatched,
  };
}
