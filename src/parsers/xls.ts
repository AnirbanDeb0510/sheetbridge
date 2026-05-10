/**
 * XLS Parser for BIFF8 format
 * This is a placeholder for the actual implementation.
 * To be implemented with proper BIFF8 binary format parsing.
 */

import type { ParseOptions, SheetData } from '../types';

export async function parseXLS(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _file: File | Blob | ArrayBuffer | Buffer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: ParseOptions
): Promise<SheetData[]> {
  // TODO: Implement BIFF8 parser
  // This will parse the binary OLE2/CFB container and extract BIFF8 records
  throw new Error('XLS parsing not yet implemented. Coming in v1.0.0');
}
