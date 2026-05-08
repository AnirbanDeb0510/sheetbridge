/**
 * File type detection utilities
 */

export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'unknown';

export function detectFormat(fileName: string, mimeType?: string): FileFormat {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    return 'csv';
  }
  if (lowerName.endsWith('.xlsx') || mimeType?.includes('spreadsheetml')) {
    return 'xlsx';
  }
  if (lowerName.endsWith('.xls') || mimeType?.includes('ms-excel')) {
    return 'xls';
  }

  return 'unknown';
}

export function validateFileFormat(format: FileFormat): boolean {
  return ['csv', 'xlsx', 'xls'].includes(format);
}
