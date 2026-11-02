import ExcelJS from 'exceljs';

/** Load an XLSX file from its bytes. */
export async function loadWorkbook(bytes: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // @ts-expect-error ExcelJS typings use old Buffer definition incompatible with Node 22+
  await wb.xlsx.load(Buffer.from(new Uint8Array(bytes)));
  return wb;
}

/** Convert an ExcelJS worksheet to a 0-indexed array-of-arrays (same format as SheetJS sheet_to_json with header:1). */
export function sheetToAoa(ws: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    // ExcelJS row.values is 1-indexed (index 0 is undefined)
    const values = row.values as unknown[];
    rows[rowNumber - 1] = values.slice(1);
  });
  return rows;
}
