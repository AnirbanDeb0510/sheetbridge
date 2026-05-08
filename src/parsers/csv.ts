/**
 * CSV Parser wrapper using PapaParse
 */

import Papa from 'papaparse';
import type { ParseOptions } from '../types';

export async function parseCSV(
  file: File | Blob,
  options: ParseOptions = {}
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: options.header ?? true,
      skipEmptyLines: options.skipBlankRows ?? false,
      dynamicTyping: false,
      complete(results) {
        let data = results.data as Array<Record<string, unknown>>;

        if (options.maxRows) {
          data = data.slice(0, options.maxRows);
        }

        if (options.columnMapping) {
          data = data.map((row) => {
            if (typeof row !== 'object') return row;
            const mapped: Record<string, unknown> = {};
            for (const [oldKey, newKey] of Object.entries(options.columnMapping!)) {
              if (oldKey in row) {
                mapped[newKey] = (row as Record<string, unknown>)[oldKey];
              }
            }
            return mapped;
          });
        }

        resolve(data);
      },
      error(error) {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      },
    });
  });
}
