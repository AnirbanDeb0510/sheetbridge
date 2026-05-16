/**
 * Integration tests using real fixture files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFile, parseFileFlat } from '../src';

const fixturesDir = path.resolve(process.cwd(), 'tests', 'fixtures');

function readFixtureAsFile(fileName: string, mimeType: string): File {
  const filePath = path.join(fixturesDir, fileName);
  const buffer = fs.readFileSync(filePath);
  return new File([buffer], fileName, { type: mimeType });
}

describe('Parser integration (fixtures)', () => {
  it('parses CSV fixture to JSON rows as strings', async () => {
    const file = readFixtureAsFile('sample.csv', 'text/csv');

    const result = await parseFile(file, {
      header: true,
      skipBlankRows: true,
    });

    expect(result.metadata.format).toBe('csv');
    expect(result.metadata.sheetCount).toBe(1);
    expect(result.sheets[0].name).toBe('Sheet1');
    expect(result.sheets[0].data).toHaveLength(2);

    const firstRow = result.sheets[0].data[0] as Record<string, unknown>;
    expect(firstRow.name).toBe('Alice');
    expect(firstRow.age).toBe('30');
    expect(firstRow.ratio).toBe('0.5');
    expect(firstRow.birthDate).toBe('1994-03-24');
    expect(firstRow.loginTime).toBe('2026-05-11 10:15:00');
    expect(firstRow.active).toBe('true');
  });

  it('parses quoted CSV fixture and skips blank rows', async () => {
    const file = readFixtureAsFile('quoted.csv', 'text/csv');

    const result = await parseFile(file, {
      header: true,
      skipBlankRows: true,
    });

    expect(result.metadata.format).toBe('csv');
    expect(result.sheets[0].data).toHaveLength(2);

    const firstRow = result.sheets[0].data[0] as Record<string, unknown>;
    const secondRow = result.sheets[0].data[1] as Record<string, unknown>;

    expect(firstRow.name).toBe('Smith, Alice');
    expect(firstRow.notes).toBe('She said "hello"');
    expect(firstRow.active).toBe('true');
    expect(secondRow.name).toBe('Bob');
    expect(secondRow.notes).toBe('  spaced  ');
    expect(secondRow.active).toBe('false');
  });

  it('supports CSV column mapping and maxRows', async () => {
    const file = readFixtureAsFile('sample.csv', 'text/csv');

    const result = await parseFile(file, {
      header: true,
      skipBlankRows: true,
      maxRows: 1,
      columnMapping: {
        name: 'fullName',
        age: 'yearsOld',
        ratio: 'share',
      },
    });

    const row = result.sheets[0].data[0] as Record<string, unknown>;

    expect(result.sheets[0].data).toHaveLength(1);
    expect(row.fullName).toBe('Alice');
    expect(row.yearsOld).toBe('30');
    expect(row.share).toBe('0.5');
    expect(row).not.toHaveProperty('name');
  });

  it('returns raw array rows for CSV when header=false', async () => {
    const file = readFixtureAsFile('sample.csv', 'text/csv');

    const result = await parseFile(file, {
      header: false,
      skipBlankRows: true,
    });

    expect(result.metadata.format).toBe('csv');
    expect(result.sheets[0].data).toHaveLength(3);

    const headerRow = result.sheets[0].data[0] as Array<string | null>;
    const firstDataRow = result.sheets[0].data[1] as Array<string | null>;

    expect(Array.isArray(headerRow)).toBe(true);
    expect(headerRow).toEqual(['name', 'age', 'ratio', 'birthDate', 'loginTime', 'active']);
    expect(firstDataRow).toEqual([
      'Alice',
      '30',
      '0.5',
      '1994-03-24',
      '2026-05-11 10:15:00',
      'true',
    ]);
  });

  it('applies CSV trim option to string values', async () => {
    const file = readFixtureAsFile('quoted.csv', 'text/csv');

    const result = await parseFile(file, {
      header: true,
      skipBlankRows: true,
      trim: true,
    });

    const secondRow = result.sheets[0].data[1] as Record<string, unknown>;
    expect(secondRow.notes).toBe('spaced');
  });

  it('parses XLSX fixture to JSON rows with multiple sheets', async () => {
    const file = readFixtureAsFile(
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const result = await parseFile(file, {
      header: true,
      trim: true,
    });

    expect(result.metadata.format).toBe('xlsx');
    expect(result.metadata.sheetCount).toBe(2);
    expect(result.sheets[0].name).toBe('People');
    expect(result.sheets[1].name).toBe('Metrics');
    expect(result.sheets[0].data).toHaveLength(2);
    expect(result.sheets[1].data).toHaveLength(2);

    const firstRow = result.sheets[0].data[0] as Record<string, unknown>;
    expect(firstRow.name).toBe('Alice');
    expect(firstRow.age).toBe(30);
    expect(firstRow.active).toBe(true);
    expect(firstRow.ratio).toBe(0.5);
    expect(firstRow.birthDate).toBeInstanceOf(Date);
    expect(firstRow.loginTime).toBeInstanceOf(Date);

    const metricsRow = result.sheets[1].data[0] as Record<string, unknown>;
    expect(metricsRow.label).toBe('half');
    expect(metricsRow.fraction).toBe(0.5);
    expect(metricsRow.percent).toBe(0.25);
    expect(metricsRow.count).toBe(10);
  });

  it('flattens parsed rows from CSV fixture', async () => {
    const file = readFixtureAsFile('sample.csv', 'text/csv');
    const rows = await parseFileFlat(file, { header: true, skipBlankRows: true });

    expect(rows).toHaveLength(2);
    const secondRow = rows[1] as Record<string, unknown>;
    expect(secondRow.name).toBe('Bob');
  });

  it('reads all sheets by default for XLSX', async () => {
    const file = readFixtureAsFile(
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const result = await parseFile(file, { header: true });

    expect(result.sheets).toHaveLength(2);
    expect(result.sheets.map((sheet) => sheet.name)).toEqual(['People', 'Metrics']);
  });

  it('reads a single XLSX sheet by name', async () => {
    const file = readFixtureAsFile(
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const result = await parseFile(file, {
      header: true,
      sheet: 'Metrics',
    });

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].name).toBe('Metrics');
    expect(result.sheets[0].data).toHaveLength(2);
  });

  it('reads a single XLSX sheet by zero-based index', async () => {
    const file = readFixtureAsFile(
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const result = await parseFile(file, {
      header: true,
      sheet: 0,
    });

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].name).toBe('People');
    expect(result.sheets[0].data).toHaveLength(2);
  });

  it('supports XLSX column mapping and maxRows', async () => {
    const file = readFixtureAsFile(
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const result = await parseFile(file, {
      header: true,
      sheet: 'People',
      maxRows: 2,
      columnMapping: {
        name: 'personName',
        age: 'yearsOld',
        active: 'isActive',
      },
    });

    const row = result.sheets[0].data[0] as Record<string, unknown>;

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].data).toHaveLength(1);
    expect(row.personName).toBe('Alice');
    expect(row.yearsOld).toBe(30);
    expect(row.isActive).toBe(true);
  });

  it('throws a clear error when a requested XLSX sheet is missing', async () => {
    const file = readFixtureAsFile(
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    await expect(
      parseFile(file, {
        header: true,
        sheet: 'MissingSheet',
      })
    ).rejects.toThrow('Sheet named "MissingSheet" was not found');
  });

  it('throws a clear error when a requested XLSX sheet index is missing', async () => {
    const file = readFixtureAsFile(
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    await expect(
      parseFile(file, {
        header: true,
        sheet: 99,
      })
    ).rejects.toThrow('Sheet index 99 was not found');
  });

  it('parses XLS fixture to JSON rows with multiple sheets', async () => {
    const file = readFixtureAsFile('sample.xls', 'application/vnd.ms-excel');

    const result = await parseFile(file, {
      header: true,
      trim: true,
    });

    expect(result.metadata.format).toBe('xls');
    expect(result.metadata.sheetCount).toBe(2);
    expect(result.sheets[0].name).toBe('People');
    expect(result.sheets[1].name).toBe('Metrics');
    expect(result.sheets[0].data).toHaveLength(9);

    const firstRow = result.sheets[0].data[0] as Record<string, unknown>;
    expect(firstRow.name).toBe('Alice');
    expect(firstRow.age).toBe(30);
    expect(firstRow.ratio).toBe(0.5);
    expect(firstRow.birthDate).toBeInstanceOf(Date);
    expect(firstRow.loginTime).toBeInstanceOf(Date);
    expect(firstRow.active).toBe(true);
    expect(firstRow.balance).toBe(1234.56);
    expect(firstRow.notes).toContain('trigger SST and CONTINUE records');
    expect(firstRow.code).toBe(101);

    const firstRowKeys = Object.keys(firstRow);
    expect(firstRowKeys).toHaveLength(10);
    expect(firstRowKeys).toEqual([
      'name',
      'age',
      'ratio',
      'birthDate',
      'loginTime',
      'active',
      'balance',
      'notes',
      'status',
      'code',
    ]);
  });

  it('reads a single XLS sheet by name and supports column mapping', async () => {
    const file = readFixtureAsFile('sample.xls', 'application/vnd.ms-excel');

    const result = await parseFile(file, {
      header: true,
      sheet: 'People',
      maxRows: 2,
      columnMapping: {
        name: 'personName',
        age: 'yearsOld',
      },
    });

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].name).toBe('People');
    expect(result.sheets[0].data).toHaveLength(1);

    const firstRow = result.sheets[0].data[0] as Record<string, unknown>;
    expect(firstRow.personName).toBe('Alice');
    expect(firstRow.yearsOld).toBe(30);
  });

  it('throws a clear error when a requested XLS sheet is missing', async () => {
    const file = readFixtureAsFile('sample.xls', 'application/vnd.ms-excel');

    await expect(
      parseFile(file, {
        header: true,
        sheet: 'MissingXlsSheet',
      })
    ).rejects.toThrow('Sheet named "MissingXlsSheet" was not found');
  });

  it('parses complex XLS fixture with sparse wide and instruction sheets', async () => {
    const file = readFixtureAsFile('sample.complex.xls', 'application/vnd.ms-excel');

    const result = await parseFile(file, {
      header: false,
      trim: true,
    });

    expect(result.metadata.format).toBe('xls');
    expect(result.metadata.sheetCount).toBe(4);
    expect(result.sheets.map((sheet) => sheet.name)).toEqual([
      'Sheet1_Data',
      'Sheet2_Wide',
      'Sheet3_Instructions',
      'Sheet4_Notes',
    ]);

    expect(result.sheets[0].data).toHaveLength(15);
    expect(result.sheets[1].data).toHaveLength(15);

    const wideHeader = result.sheets[1].data[0] as Array<string | number | boolean | Date | null>;
    expect(Array.isArray(wideHeader)).toBe(true);
    expect(wideHeader).toHaveLength(96);
    expect(wideHeader[0]).toBe('c1');
    expect(wideHeader[95]).toBe('c96');

    const wideFirstDataRow = result.sheets[1].data[1] as Array<
      string | number | boolean | Date | null
    >;
    const nullCount = wideFirstDataRow.filter((value) => value === null).length;
    expect(nullCount).toBeGreaterThan(40);
    expect(wideFirstDataRow.some((value) => typeof value === 'string')).toBe(true);
    expect(wideFirstDataRow.some((value) => typeof value === 'number')).toBe(true);

    const instructionRows = result.sheets[2].data as Array<
      Array<string | number | boolean | Date | null>
    >;
    const flattenedInstructionValues = instructionRows
      .flat()
      .filter((value) => typeof value === 'string') as string[];
    expect(flattenedInstructionValues.length).toBeGreaterThan(3);
    expect(flattenedInstructionValues.some((value) => value.length > 80)).toBe(true);
  });

  it('throws a clear error for malformed XLS files', async () => {
    const malformed = new File([new Uint8Array([1, 2, 3, 4, 5])], 'malformed.xls', {
      type: 'application/vnd.ms-excel',
    });

    await expect(parseFile(malformed, { header: true })).rejects.toThrow(
      'too small to contain a valid CFB header'
    );
  });
});
