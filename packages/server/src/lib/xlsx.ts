import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { listZipEntries, openZipEntry } from './zip.js';

/** The rows of the sheets `readSheets` kept, by sheet name, and every sheet's name in workbook order. */
export interface WorkbookSheets {
  names: string[];
  sheets: Map<string, unknown[][]>;
}

/**
 * Reads an XLSX file as a stream and keeps the rows of the sheets `want`
 * picks (by name and 0-based position), each as a 0-indexed array of rows
 * (same format as SheetJS sheet_to_json with header:1; a missing row is []).
 *
 * Loading the whole workbook (`new ExcelJS.Workbook().xlsx.load`) builds a
 * cell object for every cell of every sheet: Berlin's 2.5 MB election file
 * took 200 MB of heap that way and crashed the 256 MB heap of the production
 * instance (2026-11). The stream reader holds one sheet's wanted rows only.
 */
export async function readSheets(
  bytes: ArrayBuffer | Uint8Array,
  want: (name: string, index: number) => boolean,
): Promise<WorkbookSheets> {
  const buf = bytes instanceof Uint8Array ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : Buffer.from(bytes);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([buf]), {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    // Styles tell date cells from numbers, as a loaded workbook does
    styles: 'cache',
    worksheets: 'emit',
    entries: 'ignore',
  });
  await primeReader(reader as unknown as ReaderInternals, buf);
  const names: string[] = [];
  const sheets = new Map<string, unknown[][]>();
  let paths: Map<string, string> | undefined;
  for await (const ws of reader) {
    const name = (ws as unknown as { name?: string }).name ?? `Sheet${names.length + 1}`;
    const keep = want(name, names.length);
    names.push(name);
    const rows: unknown[][] = [];
    // Every sheet's rows have to be read to reach the next sheet; unwanted ones are dropped
    for await (const row of ws as unknown as AsyncIterable<ExcelJS.Row>) {
      if (!keep) continue;
      // ExcelJS row.values is 1-indexed (index 0 is undefined)
      rows[row.number - 1] = (row.values as unknown[]).slice(1);
    }
    if (keep) {
      paths ??= await sheetPaths(buf);
      const path = paths.get(name);
      if (path) fillMerges(rows, await mergeRanges(buf, path));
      for (let i = 0; i < rows.length; i++) rows[i] ??= [];
      sheets.set(name, rows);
    }
  }
  return { names, sheets };
}

/** The parts of ExcelJS 4.4's WorkbookReader that `primeReader` calls. */
interface ReaderInternals {
  sharedStrings?: unknown[];
  _parseRels(entry: Readable): Promise<void>;
  _parseWorkbook(entry: Readable): Promise<void>;
  _parseStyles(entry: Readable): Promise<void>;
  _parseSharedStrings(entry: Readable): AsyncGenerator<unknown>;
}

/**
 * Reads the workbook's sheet list, styles and shared strings into the reader
 * before it streams the archive. The reader expects them ahead of the sheets
 * in the ZIP; when a file stores them later (ExcelJS's own writer does), it
 * spills each sheet to a temporary file, or fails to name the sheets. The
 * archive is in memory anyway, so the parts are read out of order here; the
 * reader parses them again when it meets them, to the same result.
 */
async function primeReader(reader: ReaderInternals, buf: Buffer): Promise<void> {
  const entries = listZipEntries(buf);
  const open = (path: string) => {
    const entry = entries.find((e) => e.name === path);
    return entry ? openZipEntry(buf, entry) : null;
  };
  const rels = open('xl/_rels/workbook.xml.rels');
  if (rels) await reader._parseRels(rels);
  const workbook = open('xl/workbook.xml');
  if (workbook) await reader._parseWorkbook(workbook);
  const styles = open('xl/styles.xml');
  if (styles) await reader._parseStyles(styles);
  const strings = open('xl/sharedStrings.xml');
  if (strings) {
    for await (const _ of reader._parseSharedStrings(strings)) { /* 'cache' mode fills reader.sharedStrings */ }
  } else {
    reader.sharedStrings = [];
  }
}

async function entryText(buf: Buffer, path: string): Promise<string | null> {
  const entry = listZipEntries(buf).find((e) => e.name === path);
  if (!entry) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of openZipEntry(buf, entry)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Each sheet's XML file in the archive by sheet name, from xl/workbook.xml
 * and its relationships. The file number is not the sheet id: Berlin's
 * population file keeps sheet "T2" (id 61) in sheet6.xml.
 */
async function sheetPaths(buf: Buffer): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const [workbook, rels] = await Promise.all([entryText(buf, 'xl/workbook.xml'), entryText(buf, 'xl/_rels/workbook.xml.rels')]);
  if (!workbook || !rels) return out;
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    const path = rid ? targets.get(rid) : undefined;
    if (name !== undefined && path) out.set(unescapeXml(name), path);
  }
  return out;
}

/**
 * The merged ranges ("A1:F1") of one sheet, scanned from its XML in the
 * archive. The stream reader skips `<mergeCells>`, which follow the rows, but
 * the parsers expect a merged range's value in each of its cells, as a loaded
 * workbook gives it (a header spanning columns, for one).
 */
async function mergeRanges(buf: Buffer, path: string): Promise<string[]> {
  const entry = listZipEntries(buf).find((e) => e.name === path);
  if (!entry) return [];
  const refs: string[] = [];
  let tail = '';
  for await (const chunk of openZipEntry(buf, entry)) {
    // The refs are ASCII, so a multi-byte character cut at a chunk edge does no harm
    const text = tail + (chunk as Buffer).toString('latin1');
    let last = 0;
    for (const m of text.matchAll(/<(?:\w+:)?mergeCell\s+ref="([A-Z]+\d+:[A-Z]+\d+)"/g)) {
      refs.push(m[1]!);
      last = m.index + m[0].length;
    }
    tail = text.slice(Math.max(last, text.length - 80));
  }
  return refs;
}

/** "AB12" → [row index 11, column index 27]. */
function cellIndex(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  let col = 0;
  for (const ch of m[1]!) col = col * 26 + ch.charCodeAt(0) - 64;
  return [Number(m[2]) - 1, col - 1];
}

/** Copies each merged range's top-left value into its other cells. */
export function fillMerges(rows: unknown[][], ranges: readonly string[]): void {
  for (const range of ranges) {
    const [from, to] = range.split(':') as [string, string];
    const [r0, c0] = cellIndex(from);
    const [r1, c1] = cellIndex(to);
    const value = rows[r0]?.[c0];
    if (value === undefined || value === null) continue;
    for (let r = r0; r <= r1; r++) {
      const row = (rows[r] ??= []);
      for (let c = c0; c <= c1; c++) row[c] = value;
    }
  }
}

/** The rows of one sheet by name, or null when the workbook has none of that name. */
export async function readSheet(bytes: ArrayBuffer | Uint8Array, name: string): Promise<unknown[][] | null> {
  return (await readSheets(bytes, (n) => n === name)).sheets.get(name) ?? null;
}
