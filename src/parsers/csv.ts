/**
 * CSV Parser wrapper using PapaParse
 */

import Papa from 'papaparse';
import type { ParseOptions } from '../types';

type CsvRow = Record<string, unknown> | Array<string | null>;

export async function parseCSV(file: File | Blob, options: ParseOptions = {}): Promise<CsvRow[]> {
  const csvText = await file.text();
  const hasHeader = options.header ?? true;

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: hasHeader,
      skipEmptyLines: options.skipBlankRows ?? false,
      dynamicTyping: false,
      complete(results) {
        let data = results.data as CsvRow[];

        if (options.maxRows) {
          data = data.slice(0, options.maxRows);
        }

        if (options.trim) {
          data = data.map((row) => {
            if (Array.isArray(row)) {
              return row.map((value) => (typeof value === 'string' ? value.trim() : value));
            }

            const trimmed: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(row)) {
              trimmed[key] = typeof value === 'string' ? value.trim() : value;
            }
            return trimmed;
          });
        }

        if (options.columnMapping && hasHeader) {
          data = data.map((row) => {
            if (Array.isArray(row)) return row;
            const mapped: Record<string, unknown> = {};
            for (const [oldKey, newKey] of Object.entries(options.columnMapping!)) {
              if (oldKey in row) {
                mapped[newKey] = row[oldKey];
              }
            }
            return mapped;
          });
        }

        resolve(data);
      },
      error(error: Error) {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      },
    });
  });
}
