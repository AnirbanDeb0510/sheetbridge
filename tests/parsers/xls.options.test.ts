import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/parsers/xls/cfb', () => ({
  extractWorkbookStream: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

vi.mock('../../src/parsers/xls/workbook-globals', () => ({
  parseWorkbookGlobals: vi.fn(() => ({
    sheets: [
      { name: 'People', offset: 0 },
      { name: 'Metrics', offset: 100 },
    ],
    sharedStrings: [],
    xfFormatIndexes: [],
    customFormats: new Map<number, string>(),
  })),
}));

vi.mock('../../src/parsers/xls/worksheet', () => ({
  parseWorksheetRows: vi.fn().mockImplementation((_workbook: Uint8Array, sheetOffset: number) => {
    if (sheetOffset === 0) {
      return [
        ['name', 'age'],
        ['Alice', 30],
        ['Bob', 31],
      ];
    }
    return [
      ['label', 'value'],
      ['half', 0.5],
    ];
  }),
}));

import { parseXLS } from '../../src/parsers/xls';

describe('parseXLS option parity (B4)', () => {
  it('defaults to header=true and maps rows to objects', async () => {
    const result = await parseXLS(new Uint8Array([0, 1, 2]).buffer, {});

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('People');
    expect(result[0].data).toHaveLength(2);

    const firstRow = result[0].data[0] as Record<string, unknown>;
    expect(firstRow.name).toBe('Alice');
    expect(firstRow.age).toBe(30);
  });

  it('returns array rows when header=false', async () => {
    const result = await parseXLS(new Uint8Array([0, 1, 2]).buffer, {
      header: false,
    });

    const row = result[0].data[0] as Array<string | number | boolean | Date | null>;
    expect(Array.isArray(row)).toBe(true);
    expect(row).toEqual(['name', 'age']);
  });

  it('supports sheet selection by name and by index', async () => {
    const byName = await parseXLS(new Uint8Array([0, 1, 2]).buffer, {
      sheet: 'Metrics',
    });
    expect(byName).toHaveLength(1);
    expect(byName[0].name).toBe('Metrics');

    const byIndex = await parseXLS(new Uint8Array([0, 1, 2]).buffer, {
      sheet: 0,
    });
    expect(byIndex).toHaveLength(1);
    expect(byIndex[0].name).toBe('People');
  });

  it('throws clear errors for missing sheets', async () => {
    await expect(
      parseXLS(new Uint8Array([0, 1, 2]).buffer, {
        sheet: 'Missing',
      })
    ).rejects.toThrow('Sheet named "Missing" was not found');

    await expect(
      parseXLS(new Uint8Array([0, 1, 2]).buffer, {
        sheet: 99,
      })
    ).rejects.toThrow('Sheet index 99 was not found');
  });

  it('applies trim, maxRows, and columnMapping in header mode', async () => {
    const result = await parseXLS(new Uint8Array([0, 1, 2]).buffer, {
      trim: true,
      maxRows: 2,
      columnMapping: {
        name: 'fullName',
        age: 'years',
      },
    });

    expect(result[0].data).toHaveLength(1);
    const row = result[0].data[0] as Record<string, unknown>;
    expect(row.fullName).toBe('Alice');
    expect(row.years).toBe(30);
  });

  it('uses null-prototype objects for hostile header mappings', async () => {
    const result = await parseXLS(new Uint8Array([0, 1, 2]).buffer, {
      columnMapping: {
        name: '__proto__',
        age: 'constructor',
      },
      maxRows: 2,
    });

    const row = result[0].data[0] as Record<string, unknown>;
    expect(Object.getPrototypeOf(row)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true);
    expect(row.__proto__).toBe('Alice');
    expect(row.constructor).toBe(30);
  });
});
