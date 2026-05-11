import type { ParseOptions, SheetData } from '../types';
import { extractWorkbookStream } from './xls/cfb';
import { isXlsParserError, XlsParserError } from './xls/errors';
import { XLS_LIMITS } from './xls/limits';
import { parseWorkbookGlobals } from './xls/workbook-globals';
import { parseWorksheetRows } from './xls/worksheet';

function isBufferLike(value: unknown): value is Buffer {
  return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}

async function toUint8Array(input: File | Blob | ArrayBuffer | Buffer): Promise<Uint8Array> {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  if (isBufferLike(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  const arrayBuffer = await input.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function parseXLS(
  file: File | Blob | ArrayBuffer | Buffer,
  options: ParseOptions = {}
): Promise<SheetData[]> {
  try {
    const bytes = await toUint8Array(file);
    if (bytes.byteLength > XLS_LIMITS.maxWorkbookBytes) {
      throw new XlsParserError(
        'BOUNDS_VIOLATION',
        `XLS file size ${bytes.byteLength} exceeds max ${XLS_LIMITS.maxWorkbookBytes}`
      );
    }

    const workbookStream = extractWorkbookStream(bytes);
    const globals = parseWorkbookGlobals(workbookStream);

    if (globals.sheets.length === 0) {
      throw new XlsParserError('MALFORMED_BINARY', 'Workbook does not contain any sheets');
    }

    const selectedSheets =
      options.sheet === undefined
        ? globals.sheets
        : typeof options.sheet === 'number'
          ? [globals.sheets[options.sheet]].filter(Boolean)
          : globals.sheets.filter((sheet) => sheet.name === options.sheet);

    if (options.sheet !== undefined && selectedSheets.length === 0) {
      throw new XlsParserError(
        'INVALID_XLS',
        typeof options.sheet === 'number'
          ? `Sheet index ${options.sheet} was not found`
          : `Sheet named "${options.sheet}" was not found`
      );
    }

    const hasHeader = options.header ?? true;
    const sheets: SheetData[] = [];

    for (const selectedSheet of selectedSheets) {
      const sheetIndex = globals.sheets.findIndex(
        (candidate) =>
          candidate.name === selectedSheet.name && candidate.offset === selectedSheet.offset
      );
      const nextSheetOffset =
        sheetIndex >= 0 && sheetIndex + 1 < globals.sheets.length
          ? globals.sheets[sheetIndex + 1].offset
          : workbookStream.length;

      let rows = parseWorksheetRows(workbookStream, selectedSheet.offset, nextSheetOffset, globals);

      if (options.trim) {
        rows = rows.map((row) =>
          row.map((cell) => (typeof cell === 'string' ? cell.trim() : cell))
        );
      }

      if (options.skipBlankRows) {
        rows = rows.filter((row) => row.some((cell) => cell !== null && cell !== ''));
      }

      if (options.maxRows) {
        rows = rows.slice(0, options.maxRows);
      }

      let data: Array<Record<string, unknown> | Array<string | number | boolean | Date | null>> =
        rows;
      if (hasHeader && rows.length > 0) {
        const headerRow = rows[0].map((cell, index) => {
          const fallback = `column_${index + 1}`;
          return typeof cell === 'string' && cell.length > 0 ? cell : fallback;
        });

        const mappedHeaders = headerRow.map((header) => {
          const mapped = options.columnMapping?.[String(header)] ?? header;
          return String(mapped);
        });

        data = rows.slice(1).map((row) => {
          const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
          for (let index = 0; index < mappedHeaders.length; index += 1) {
            record[mappedHeaders[index]] = row[index] ?? null;
          }
          return record;
        });
      }

      sheets.push({
        name: selectedSheet.name,
        data,
      });
    }

    return sheets;
  } catch (error) {
    if (isXlsParserError(error)) {
      throw error;
    }

    throw new XlsParserError(
      'INVALID_XLS',
      `Unable to parse XLS file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
