import { describe, expect, it } from 'vitest';
import { extractWorkbookStream, parseCfbHeader } from '../../src/parsers/xls/cfb';
import { iterateBiffRecords } from '../../src/parsers/xls/biff-records';

function createValidCfbHeader(): Uint8Array {
  const bytes = new Uint8Array(512);
  const view = new DataView(bytes.buffer);

  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  view.setUint16(26, 3, true); // major version
  view.setUint16(28, 0xfffe, true); // byte order
  view.setUint16(30, 9, true); // sector shift (512)
  view.setUint16(32, 6, true); // mini sector shift (64)
  view.setUint32(40, 0, true); // dir sector count
  view.setUint32(44, 1, true); // fat sector count
  view.setUint32(48, 0, true); // first dir sector
  view.setUint32(56, 4096, true); // mini stream cutoff
  view.setUint32(60, 0xfffffffe, true); // first mini fat sector
  view.setUint32(64, 0, true); // mini fat sector count
  view.setUint32(68, 0xfffffffe, true); // first difat sector
  view.setUint32(72, 0, true); // difat sector count

  return bytes;
}

function createBiffRecord(id: number, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(4 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, id, true);
  view.setUint16(2, payload.length, true);
  bytes.set(payload, 4);
  return bytes;
}

describe('XLS low-level parsing', () => {
  it('parses a valid CFB header', () => {
    const header = parseCfbHeader(createValidCfbHeader());

    expect(header.sectorShift).toBe(9);
    expect(header.miniSectorShift).toBe(6);
    expect(header.fatSectorCount).toBe(1);
    expect(header.miniStreamCutoffSize).toBe(4096);
  });

  it('rejects invalid CFB signatures', () => {
    const bytes = createValidCfbHeader();
    bytes[0] = 0x00;

    expect(() => parseCfbHeader(bytes)).toThrow('Invalid XLS/CFB signature');
  });

  it('rejects unexpected sector shift values', () => {
    const bytes = createValidCfbHeader();
    const view = new DataView(bytes.buffer);
    view.setUint16(30, 12, true);

    expect(() => parseCfbHeader(bytes)).toThrow('Unexpected sector shift');
  });

  it('iterates BIFF records with valid payloads', () => {
    const first = createBiffRecord(0x0809, new Uint8Array([0x01, 0x02]));
    const second = createBiffRecord(0x000a, new Uint8Array());
    const bytes = new Uint8Array(first.length + second.length);
    bytes.set(first, 0);
    bytes.set(second, first.length);

    const records = [...iterateBiffRecords(bytes)];

    expect(records).toHaveLength(2);
    expect(records[0].id).toBe(0x0809);
    expect(records[0].length).toBe(2);
    expect(records[1].id).toBe(0x000a);
    expect(records[1].length).toBe(0);
  });

  it('rejects truncated BIFF records', () => {
    const bytes = new Uint8Array([0x09, 0x08, 0x04, 0x00, 0xaa]);
    expect(() => [...iterateBiffRecords(bytes)]).toThrow('Truncated BIFF record');
  });

  it('rejects oversized BIFF records', () => {
    const bytes = new Uint8Array(4 + 9000);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x0809, true);
    view.setUint16(2, 9000, true);

    expect(() => [...iterateBiffRecords(bytes)]).toThrow('exceeds max');
  });

  it('rejects malformed CFB sector chains during workbook extraction', () => {
    const bytes = createValidCfbHeader();

    expect(() => extractWorkbookStream(bytes)).toThrow('out of bounds');
  });
});
