/**
 * Basic tests for SheetBridge
 */

import { describe, it, expect } from 'vitest';
import { detectFormat, validateFileFormat } from '../src/detect';

describe('File Detection', () => {
  it('should detect CSV format', () => {
    expect(detectFormat('data.csv')).toBe('csv');
    expect(detectFormat('Data.CSV')).toBe('csv');
  });

  it('should detect XLSX format', () => {
    expect(detectFormat('data.xlsx')).toBe('xlsx');
    expect(detectFormat('Data.XLSX')).toBe('xlsx');
  });

  it('should detect XLS format', () => {
    expect(detectFormat('data.xls')).toBe('xls');
    expect(detectFormat('Data.XLS')).toBe('xls');
  });

  it('should return unknown for unsupported formats', () => {
    expect(detectFormat('data.txt')).toBe('unknown');
    expect(detectFormat('data.pdf')).toBe('unknown');
  });

  it('should validate correct formats', () => {
    expect(validateFileFormat('csv')).toBe(true);
    expect(validateFileFormat('xlsx')).toBe(true);
    expect(validateFileFormat('xls')).toBe(true);
    expect(validateFileFormat('unknown')).toBe(false);
  });
});
