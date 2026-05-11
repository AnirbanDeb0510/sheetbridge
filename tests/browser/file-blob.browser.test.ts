import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src';
import sampleXlsUrl from '../fixtures/sample.xls?url';

describe('Browser runner: File/Blob parsing', () => {
  it('parses CSV from File in a real browser runtime', async () => {
    const csv = 'name,age\nAlice,30\nBob,25\n';
    const file = new File([csv], 'browser-sample.csv', { type: 'text/csv' });

    const result = await parseFile(file, {
      header: true,
      skipBlankRows: true,
    });

    expect(result.metadata.format).toBe('csv');
    expect(result.sheets[0].data).toHaveLength(2);

    const firstRow = result.sheets[0].data[0] as Record<string, unknown>;
    expect(firstRow.name).toBe('Alice');
    expect(firstRow.age).toBe('30');
  });

  it('parses XLS from File in a real browser runtime', async () => {
    const response = await fetch(sampleXlsUrl);
    const blob = await response.blob();
    const file = new File([blob], 'sample.xls', { type: 'application/vnd.ms-excel' });

    const result = await parseFile(file, {
      header: true,
      sheet: 'People',
    });

    expect(result.metadata.format).toBe('xls');
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].name).toBe('People');
    expect(result.sheets[0].data.length).toBeGreaterThan(0);

    const firstRow = result.sheets[0].data[0] as Record<string, unknown>;
    expect(firstRow.name).toBe('Alice');
    expect(firstRow.age).toBe(30);
  });
});
