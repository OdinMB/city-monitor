/**
 * München's Indikatorenatlas on opendata.muenchen.de (Statistisches Amt der
 * Landeshauptstadt München, dl-de/by-2.0): one CKAN dataset per indicator,
 * each with one CSV whose file name carries the release date
 * (`indikat_2605arbeitsmarkt_arbeitslose_-_anteil_18_05_26.csv`), so the job
 * looks the current file up through `package_show` on every run.
 *
 * Every CSV has the same columns: `Indikator, Ausprägung, Jahr, Raumbezug,
 * Indikatorwert, Basiswert 1, Basiswert 2, …`, comma-separated and quoted,
 * with decimal points and an unquoted `NA` for an empty cell. `Raumbezug` is
 * "Stadt München" or one of the 25 Stadtbezirke with its two-digit number
 * ("01 Altstadt - Lehel"). Read by both the social atlas and the population parser.
 */

export interface IndikatorRow {
  /** `Ausprägung`: the breakdown, "insgesamt", "deutsch", "bis 17 Jahre", … */
  breakdown: string;
  year: number;
  /** The Stadtbezirk's two-digit number ("01"), matching `id` in the outline file; null for the whole city. */
  districtId: string | null;
  /** `Raumbezug` without its number, hyphens closed up as the city writes them ("Altstadt-Lehel"). */
  name: string;
  value: number | null;
  base1: number | null;
  base2: number | null;
}

/** The `package_show` request for a dataset. */
export function ckanPackageUrl(ckanApi: string, dataset: string): string {
  return `${ckanApi.replace(/\/+$/, '')}/package_show?id=${encodeURIComponent(dataset)}`;
}

/** The URL of the dataset's CSV in a `package_show` response, null if it lists none. */
export function csvResourceUrl(packageJson: unknown): string | null {
  const resources = (packageJson as { result?: { resources?: Array<{ format?: unknown; url?: unknown }> } })?.result?.resources ?? [];
  const csv = resources.find((r) => typeof r.format === 'string' && r.format.toUpperCase() === 'CSV' && typeof r.url === 'string');
  return csv ? (csv.url as string) : null;
}

/**
 * The current CSV of a dataset: `package_show`, then its CSV resource. `get`
 * is the job's fetch, which logs and returns null for a failed response; null
 * here too. Throws when the dataset lists no CSV.
 */
export async function fetchIndikatorCsv(
  ckanApi: string,
  dataset: string,
  get: (url: string) => Promise<Response | null>,
): Promise<string | null> {
  const pkg = await get(ckanPackageUrl(ckanApi, dataset));
  if (!pkg) return null;
  const url = csvResourceUrl(await pkg.json());
  if (!url) throw new Error(`München Indikatorenatlas: dataset ${dataset} lists no CSV`);
  const csv = await get(url);
  return csv ? csv.text() : null;
}

/** Split one CSV line on commas outside double quotes; `""` inside quotes is a quote. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { cells.push(cell); cell = ''; }
    else cell += c;
  }
  cells.push(cell);
  return cells;
}

function parseNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const trimmed = cell.trim();
  if (trimmed === '' || trimmed === 'NA') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

const HEADER = ['Ausprägung', 'Jahr', 'Raumbezug', 'Indikatorwert', 'Basiswert 1', 'Basiswert 2'] as const;

/** Parse an Indikatorenatlas CSV into rows. Throws if a column it reads is missing. */
export function parseIndikatorCsv(text: string): IndikatorRow[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.trim());
  const col = Object.fromEntries(HEADER.map((h) => [h, header.indexOf(h)])) as Record<(typeof HEADER)[number], number>;
  const missing = HEADER.filter((h) => col[h] < 0);
  if (missing.length > 0) throw new Error(`München Indikatorenatlas: no column ${missing.join(', ')}`);

  const rows: IndikatorRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const year = Number(cells[col.Jahr]);
    if (!Number.isInteger(year)) continue;
    const raum = (cells[col.Raumbezug] ?? '').trim();
    const match = /^(\d{2})\s+(.+)$/.exec(raum);
    rows.push({
      breakdown: (cells[col['Ausprägung']] ?? '').trim(),
      year,
      districtId: match ? match[1]! : null,
      name: (match ? match[2]! : raum).replace(/\s+-\s+/g, '-'),
      value: parseNumber(cells[col.Indikatorwert]),
      base1: parseNumber(cells[col['Basiswert 1']]),
      base2: parseNumber(cells[col['Basiswert 2']]),
    });
  }
  return rows;
}

/** The Stadtbezirk rows of one breakdown, optionally of one year. */
export function districtRows(rows: IndikatorRow[], breakdown: string, year?: number): IndikatorRow[] {
  return rows.filter((r) => r.districtId !== null && r.breakdown === breakdown && (year === undefined || r.year === year));
}
