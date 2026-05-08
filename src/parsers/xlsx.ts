/**
 * XLSX Parser wrapper using read-excel-file
 */

import readExcelFile from 'read-excel-file/browser';
import type { ParseOptions, SheetData } from '../types';

export async function parseXLSX(
  file: File | Blob | ArrayBuffer,
  options: ParseOptions = {}
): Promise<SheetData[]> {
  const sheets: SheetData[] = [];

  try {
    const result = await readExcelFile(file);

    for (const sheet of result) {
      let rows: Array<Record<string, unknown> | Array<string | number | boolean | null>> =
        sheet.data as Array<(string | number | boolean | null)[]>;

      if (options.maxRows) {
        rows = rows.slice(0, options.maxRows);
      }

      if (options.skipBlankRows) {
        rows = (rows as Array<(string | number | boolean | null)[]>).filter((row) =>
          row.some((cell) => cell != null && cell !== '')
        );
      }

      // Convert to objects if header is enabled
      if (options.header && rows.length > 0) {
        const headers = rows[0] as Array<string | number>;
        const dataRows = (rows as Array<(string | number | boolean | null)[]>)
          .slice(1)
          .map((row) => {
            const obj: Record<string, unknown> = {};
            headers.forEach((header, index: number) => {
              const key = options.columnMapping?.[header] ?? header;
              obj[key] = options.trim
                ? typeof row[index] === 'string'
                  ? (row[index] as string)?.trim()
                  : row[index]
                : row[index];
            });
            return obj;
          });
        rows = dataRows;
      }

      sheets.push({
        name: sheet.sheet || 'Sheet1',
        data: rows,
      });

      // If specific sheet requested, return only that one
      if (options.sheet !== undefined) {
        break;
      }
    }

    return sheets;
  } catch (error) {
    throw new Error(
      `XLSX parsing failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
