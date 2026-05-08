/**
 * Main entry point for SheetBridge
 */

import { detectFormat, validateFileFormat } from './detect';
import { parseCSV } from './parsers/csv';
import { parseXLSX } from './parsers/xlsx';
import { parseXLS } from './parsers/xls';
import type { FileInput, ParseOptions, ParseResult, SheetData } from './types';

/**
 * Parse a spreadsheet file (CSV, XLSX, or XLS) and return JSON data
 *
 * @param file - The file to parse (File, Blob, ArrayBuffer, Buffer, or file path string)
 * @param options - Parsing options
 * @returns Promise resolving to ParseResult with sheets and metadata
 *
 * @example
 * ```typescript
 * // Browser usage
 * const file = document.getElementById('fileInput').files[0];
 * const result = await parseFile(file);
 *
 * // Node.js usage
 * import fs from 'fs';
 * const result = await parseFile(fs.readFileSync('data.xlsx'));
 * ```
 */
export async function parseFile(file: FileInput, options: ParseOptions = {}): Promise<ParseResult> {
  let fileName = '';
  let mimeType = '';
  let fileBlob: File | Blob | ArrayBuffer | Buffer;

  // Normalize input
  if (typeof file === 'string') {
    fileName = file;
    throw new Error('String file paths are only supported in Node.js. Use file buffer instead.');
  } else if (file instanceof File) {
    fileName = file.name;
    mimeType = file.type;
    fileBlob = file;
  } else if (file instanceof Blob) {
    fileName = 'unknown';
    mimeType = file.type;
    fileBlob = file;
  } else if (file instanceof ArrayBuffer || Buffer.isBuffer(file)) {
    fileName = 'unknown';
    fileBlob = file;
  } else {
    throw new Error('Unsupported file input type');
  }

  // Detect format
  const format = detectFormat(fileName, mimeType);
  if (!validateFileFormat(format)) {
    throw new Error(`Unsupported file format: ${format}. Expected CSV, XLSX, or XLS.`);
  }

  // Parse based on format
  let sheets: SheetData[] = [];

  try {
    switch (format) {
      case 'csv': {
        const csvData = await parseCSV(fileBlob as File | Blob, options);
        sheets = [{ name: 'Sheet1', data: csvData }];
        break;
      }

      case 'xlsx': {
        sheets = await parseXLSX(fileBlob as File | Blob | ArrayBuffer, options);
        break;
      }

      case 'xls': {
        sheets = await parseXLS(fileBlob as File | Blob | ArrayBuffer | Buffer, options);
        break;
      }

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  } catch (error) {
    throw new Error(
      `Failed to parse ${format.toUpperCase()} file: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Calculate total rows
  const rowCount = sheets.reduce((sum, sheet) => sum + sheet.data.length, 0);

  return {
    sheets,
    metadata: {
      format: format as 'csv' | 'xlsx' | 'xls',
      fileName,
      sheetCount: sheets.length,
      rowCount,
    },
  };
}

/**
 * Parse and return data as a flat array (useful for single-sheet files)
 */
export async function parseFileFlat(
  file: FileInput,
  options: ParseOptions = {}
): Promise<Array<Record<string, unknown> | Array<string | number | boolean | null>>> {
  const result = await parseFile(file, options);
  // Combine all sheets into a single flat array
  return result.sheets.flatMap((sheet) => sheet.data);
}

// Export types and utilities
export type { FileInput, ParseOptions, ParseResult, SheetData };
export { detectFormat, validateFileFormat } from './detect';
