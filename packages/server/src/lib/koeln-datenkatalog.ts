/**
 * Stadt Köln's "Statistischer Datenkatalog" (Kölner Stadtteilinformationen):
 * one CSV with a row per year and area and a column per indicator code
 * (UTF-8 with BOM, semicolons, decimal commas, no quoting). The codes are
 * explained in the dataset's `Beschreibung_Statistischer_Datenkatalog` CSV.
 * Licence dl-de/by-2.0, "Stadt Köln – Amt für Stadtentwicklung und Statistik".
 * Read by both the social atlas and the population parser.
 */

/** `S_RAUMEBENE` of the 570 Statistische Quartiere (0 Gesamtstadt, 1 Stadtbezirke, … 4 Quartiere). */
export const KOELN_QUARTIER_LEVEL = 'Statistische Quartiere';

export interface KoelnRow {
  year: number;
  /** `S_RAUM`: the 9-digit Quartier key, matching `nummer` in the Quartier outlines. */
  id: string;
  /** `RAUM` without its leading key ("101010001 / Kapitol-Viertel" → "Kapitol-Viertel"). */
  name: string;
  /** `RAUMEBENE`: "Gesamtstadt", "Stadtbezirke", "Stadtteile", "Statistische Quartiere", … */
  level: string;
  /** Indicator code → value; null where the cell is empty. */
  values: Record<string, number | null>;
}

function parseGermanNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const trimmed = cell.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Parse the CSV, keeping only `codes` (all codes when omitted) and rows of `level` (all when omitted). */
export function parseKoelnDatenkatalog(text: string, opts: { codes?: readonly string[]; level?: string } = {}): KoelnRow[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop the BOM
  const lines = body.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = lines[0]!.split(';').map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const iYear = col('S_JAHR');
  const iId = col('S_RAUM');
  const iName = col('RAUM');
  const iLevel = col('RAUMEBENE');
  if (iYear < 0 || iId < 0 || iName < 0 || iLevel < 0) {
    throw new Error('Köln Datenkatalog: header lacks S_JAHR, S_RAUM, RAUM or RAUMEBENE');
  }
  const codes = opts.codes ?? header.filter((h) => /^[A-Z]\d{4}[A-Z]$/.test(h));
  const missing = codes.filter((c) => col(c) < 0);
  if (missing.length > 0) throw new Error(`Köln Datenkatalog: no column ${missing.join(', ')}`);
  const codeCols = codes.map((c) => [c, col(c)] as const);

  const rows: KoelnRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(';');
    const level = (cells[iLevel] ?? '').trim();
    if (opts.level && level !== opts.level) continue;
    const year = Number(cells[iYear]);
    if (!Number.isInteger(year)) continue;
    const raum = (cells[iName] ?? '').trim();
    const values: Record<string, number | null> = {};
    for (const [code, i] of codeCols) values[code] = parseGermanNumber(cells[i]);
    rows.push({
      year,
      id: (cells[iId] ?? '').trim(),
      name: raum.replace(/^\S+\s*\/\s*/, ''),
      level,
      values,
    });
  }
  return rows;
}
