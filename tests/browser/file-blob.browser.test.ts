import { describe, expect, it } from 'vitest';
import { parseFile } from '../../src';

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
});
