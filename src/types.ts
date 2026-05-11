/**
 * Type definitions for SheetBridge
 */

export interface ParseOptions {
  /**
   * Whether to treat the first row as headers
   * @default true
   */
  header?: boolean;

  /**
   * Skip blank rows
   * @default false
   */
  skipBlankRows?: boolean;

  /**
   * Sheet name or index (0-based) to read. Leave empty to read all sheets.
   * For CSV, this is ignored.
   */
  sheet?: string | number;

  /**
   * Maximum number of rows to read. Useful for large files.
   */
  maxRows?: number;

  /**
   * Map column names to different property names
   * @example { 'First Name': 'firstName', 'Last Name': 'lastName' }
   */
  columnMapping?: Record<string, string>;

  /**
   * Trim whitespace from string values
   * @default true
   */
  trim?: boolean;

  /**
   * Date format pattern (for XLSX)
   */
  dateFormat?: string;

  /**
   * Custom number parser function
   */
  parseNumber?: (value: string) => number | string;
}

export interface SheetData {
  /**
   * Sheet name
   */
  name: string;

  /**
   * Array of rows. Each row is an array of values or an object if header=true
   */
  data: Array<Record<string, unknown> | Array<string | number | boolean | Date | null>>;
}

export interface ParseResult {
  /**
   * Array of sheets
   */
  sheets: SheetData[];

  /**
   * Metadata about the parse
   */
  metadata: {
    format: 'csv' | 'xlsx' | 'xls';
    fileName: string;
    sheetCount: number;
    rowCount: number;
  };
}

export type FileInput = File | Blob | ArrayBuffer | Buffer | string;
