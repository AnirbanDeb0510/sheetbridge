import { describe, expect, it } from 'vitest';
import { parseWorksheetRows } from '../../src/parsers/xls/worksheet';
import type { WorkbookGlobals } from '../../src/parsers/xls/workbook-globals';

function createRecord(id: number, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(4 + payload.length);
  const view = new DataView(output.buffer);
  view.setUint16(0, id, true);
  view.setUint16(2, payload.length, true);
  output.set(payload, 4);
  return output;
}

function createLabel(row: number, col: number, text: string): Uint8Array {
  const textBytes = Uint8Array.from(text.split('').map((ch) => ch.charCodeAt(0)));
  const payload = new Uint8Array(8 + textBytes.length);
  const view = new DataView(payload.buffer);
  view.setUint16(0, row, true);
  view.setUint16(2, col, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, textBytes.length, true);
  payload.set(textBytes, 8);
  return payload;
}

function createLabelSst(row: number, col: number, sstIndex: number): Uint8Array {
  const payload = new Uint8Array(10);
  const view = new DataView(payload.buffer);
  view.setUint16(0, row, true);
  view.setUint16(2, col, true);
  view.setUint16(4, 0, true);
  view.setUint32(6, sstIndex, true);
  return payload;
}

function createNumber(row: number, col: number, xfIndex: number, value: number): Uint8Array {
  const payload = new Uint8Array(14);
  const view = new DataView(payload.buffer);
  view.setUint16(0, row, true);
  view.setUint16(2, col, true);
  view.setUint16(4, xfIndex, true);
  view.setFloat64(6, value, true);
  return payload;
}

function createBoolErr(row: number, col: number, boolValue: boolean): Uint8Array {
  const payload = new Uint8Array(8);
  const view = new DataView(payload.buffer);
  view.setUint16(0, row, true);
  view.setUint16(2, col, true);
  view.setUint16(4, 0, true);
  view.setUint8(6, boolValue ? 1 : 0);
  view.setUint8(7, 0);
  return payload;
}

function createRk(row: number, col: number, xfIndex: number, integerValue: number): Uint8Array {
  const payload = new Uint8Array(10);
  const view = new DataView(payload.buffer);
  view.setUint16(0, row, true);
  view.setUint16(2, col, true);
  view.setUint16(4, xfIndex, true);
  const rk = (integerValue << 2) | 0x02;
  view.setUint32(6, rk >>> 0, true);
  return payload;
}

function createMulRk(row: number, firstCol: number, values: number[]): Uint8Array {
  const payload = new Uint8Array(6 + values.length * 6);
  const view = new DataView(payload.buffer);
  view.setUint16(0, row, true);
  view.setUint16(2, firstCol, true);

  for (let index = 0; index < values.length; index += 1) {
    const entryOffset = 4 + index * 6;
    view.setUint16(entryOffset, 0, true);
    const rk = (values[index] << 2) | 0x02;
    view.setUint32(entryOffset + 2, rk >>> 0, true);
  }

  view.setUint16(payload.length - 2, firstCol + values.length - 1, true);
  return payload;
}

function joinRecords(records: Uint8Array[]): Uint8Array {
  const total = records.reduce((sum, record) => sum + record.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const record of records) {
    output.set(record, offset);
    offset += record.length;
  }
  return output;
}

describe('XLS worksheet parser (B3)', () => {
  it('parses string, boolean, and date-like number cells', () => {
    const records = joinRecords([
      createRecord(0x0204, createLabel(0, 0, 'name')),
      createRecord(0x0204, createLabel(0, 1, 'createdAt')),
      createRecord(0x00fd, createLabelSst(1, 0, 0)),
      createRecord(0x0203, createNumber(1, 1, 1, 45352.5)),
      createRecord(0x0205, createBoolErr(1, 2, true)),
      createRecord(0x000a, new Uint8Array(0)),
    ]);

    const globals: WorkbookGlobals = {
      sheets: [{ name: 'Sheet1', offset: 0 }],
      sharedStrings: ['Alice'],
      xfFormatIndexes: [0, 14],
      customFormats: new Map<number, string>(),
    };

    const rows = parseWorksheetRows(records, 0, records.length, globals);

    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('name');
    expect(rows[0][1]).toBe('createdAt');
    expect(rows[1][0]).toBe('Alice');
    expect(rows[1][1]).toBeInstanceOf(Date);
    expect(rows[1][2]).toBe(true);
  });

  it('parses RK and MULRK numeric cells', () => {
    const records = joinRecords([
      createRecord(0x027e, createRk(0, 0, 0, 42)),
      createRecord(0x00bd, createMulRk(1, 0, [7, 9])),
      createRecord(0x000a, new Uint8Array(0)),
    ]);

    const globals: WorkbookGlobals = {
      sheets: [{ name: 'Sheet1', offset: 0 }],
      sharedStrings: [],
      xfFormatIndexes: [0],
      customFormats: new Map<number, string>(),
    };

    const rows = parseWorksheetRows(records, 0, records.length, globals);

    expect(rows[0][0]).toBe(42);
    expect(rows[1][0]).toBe(7);
    expect(rows[1][1]).toBe(9);
  });
});
