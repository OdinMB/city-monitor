import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { fillMerges, readSheet, readSheets } from './xlsx.js';

async function workbookBytes(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const first = wb.addWorksheet('Intro');
  first.getCell('A1').value = 'not wanted';
  const data = wb.addWorksheet('Data');
  data.getCell('A1').value = 'Header';
  data.mergeCells('A1:C1');
  data.getCell('A3').value = 'Mitte';
  data.getCell('B3').value = 42;
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

describe('readSheets', () => {
  it('keeps only the wanted sheets, lists every name, and fills merged ranges and missing rows', async () => {
    const { names, sheets } = await readSheets(await workbookBytes(), (name) => name === 'Data');
    expect(names).toEqual(['Intro', 'Data']);
    expect([...sheets.keys()]).toEqual(['Data']);
    expect(sheets.get('Data')).toEqual([['Header', 'Header', 'Header'], [], ['Mitte', 42]]);
  });

  it('picks a sheet by position', async () => {
    const { sheets } = await readSheets(await workbookBytes(), (_name, index) => index === 0);
    expect(sheets.get('Intro')).toEqual([['not wanted']]);
  });

  it('readSheet gives null for a missing sheet', async () => {
    expect(await readSheet(await workbookBytes(), 'Nope')).toBeNull();
  });
});

describe('fillMerges', () => {
  it('copies the top-left value across a block, creating rows as needed', () => {
    const rows: unknown[][] = [['x', null], [null]];
    fillMerges(rows, ['A1:B3']);
    expect(rows).toEqual([['x', 'x'], ['x', 'x'], ['x', 'x']]);
  });

  it('leaves a range with an empty top-left cell alone', () => {
    const rows: unknown[][] = [[null, 'y']];
    fillMerges(rows, ['A1:B1']);
    expect(rows).toEqual([[null, 'y']]);
  });

  it('reads multi-letter columns', () => {
    const rows: unknown[][] = [];
    rows[0] = [];
    rows[0][26] = 'AA';
    fillMerges(rows, ['AA1:AB1']);
    expect(rows[0].slice(26)).toEqual(['AA', 'AA']);
  });
});
