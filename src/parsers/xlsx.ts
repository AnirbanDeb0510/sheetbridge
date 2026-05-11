/**
 * XLSX Parser wrapper using read-excel-file
 */

import readExcelFile from 'read-excel-file/universal';
import type { ParseOptions, SheetData } from '../types';

export async function parseXLSX(
  file: File | Blob | ArrayBuffer,
  options: ParseOptions = {}
): Promise<SheetData[]> {
  try {
    const hasHeader = options.header ?? true;
    const result = await readExcelFile(file);
    const selectedSheets =
      options.sheet === undefined
        ? result
        : typeof options.sheet === 'number'
          ? [result[options.sheet]].filter(Boolean)
          : result.filter((sheet) => sheet.sheet === options.sheet);

    if (options.sheet !== undefined && selectedSheets.length === 0) {
      throw new Error(
        typeof options.sheet === 'number'
          ? `Sheet index ${options.sheet} was not found`
          : `Sheet named "${options.sheet}" was not found`
      );
    }

    const sheets: SheetData[] = [];

    for (const sheet of selectedSheets) {
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
      if (hasHeader && rows.length > 0) {
        const headers = rows[0] as Array<string | number>;
        const dataRows = (rows as Array<(string | number | boolean | null)[]>)
          .slice(1)
          .map((row) => {
            const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
            headers.forEach((header, index: number) => {
              const rawKey = options.columnMapping?.[String(header)] ?? header;
              const key = String(rawKey);
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
    }

    return sheets;
  } catch (error) {
    throw new Error(
      `XLSX parsing failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
