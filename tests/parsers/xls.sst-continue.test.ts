import { describe, it, expect } from 'vitest';
import { parseSstStringsFromRecords } from '../../src/parsers/xls/workbook-globals';

function createSstHeader(total: number, unique: number): Uint8Array {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, total, true);
  view.setUint32(4, unique, true);
  return header;
}

describe('XLS SST/CONTINUE shared string edge cases', () => {
  it('parses a shared string split across SST and CONTINUE (unicode)', () => {
    // String: "A\u20ACB"
    // BIFF8: charCount=3, flags=0x01 (unicode)
    // SST: header (8 bytes) + [03 00 01] + [41 00] ("A")
    // CONTINUE: [01] (unicode flag) + [AC 20] ("\u20AC") + [42 00] ("B")
    const sstHeader = createSstHeader(1, 1);
    const sstPayload = new Uint8Array([3, 0, 0x01, 0x41, 0x00]); // charCount=3, flags=unicode, "A"
    const continuePayload = new Uint8Array([0x01, 0xac, 0x20, 0x42, 0x00]);
    const sstRecord = { id: 0xfc, payload: new Uint8Array([...sstHeader, ...sstPayload]) };
    const continueRecord = { id: 0x3c, payload: continuePayload };
    const { strings } = parseSstStringsFromRecords([sstRecord, continueRecord], 0);
    expect(strings).toHaveLength(1);
    expect(strings[0]).toBe('A\u20ACB');
  });

  it('parses a shared string with encoding flag change in CONTINUE', () => {
    // String: "AB" (charCount=2)
    // SST: header + [02 00 00] + [41 42] (compressed, "AB")
    // CONTINUE: [01] (encoding flag: unicode) + [43 00] ("C")
    const sstHeader = createSstHeader(1, 1);
    const sstPayload = new Uint8Array([2, 0, 0x00, 0x41, 0x42]); // charCount=2, flags=compressed, "AB"
    const continuePayload = new Uint8Array([0x01, 0x43, 0x00]); // encoding flag: unicode, "C"
    const sstRecord = { id: 0xfc, payload: new Uint8Array([...sstHeader, ...sstPayload]) };
    const continueRecord = { id: 0x3c, payload: continuePayload };
    // Should parse "ABC"
    // But since charCount=2, only "AB" is parsed; this is a malformed test
    // Let's make charCount=3 in SST
    sstRecord.payload[8] = 3; // charCount=3
    const { strings } = parseSstStringsFromRecords([sstRecord, continueRecord], 0);
    expect(strings).toHaveLength(1);
    expect(strings[0]).toBe('ABC');
  });

  it('throws on malformed split string (not enough bytes)', () => {
    const sstHeader = createSstHeader(1, 1);
    const sstPayload = new Uint8Array([2, 0, 0x01, 0x41, 0x00]); // charCount=2, unicode, only "A"
    const continuePayload = new Uint8Array([]); // missing second char
    const sstRecord = { id: 0xfc, payload: new Uint8Array([...sstHeader, ...sstPayload]) };
    const continueRecord = { id: 0x3c, payload: continuePayload };
    expect(() => parseSstStringsFromRecords([sstRecord, continueRecord], 0)).toThrow(
      'CONTINUE record is missing string continuation flag byte'
    );
  });

  it('parses CONTINUE payload for rich-text runs without consuming a string flag byte', () => {
    // String: "A"
    // flags=0x08 (rich-text), richTextRunCount=1
    // The char data ends in SST payload and CONTINUE holds only rich-text run bytes.
    // In this case CONTINUE does not start with a string encoding flag.
    const sstHeader = createSstHeader(1, 1);
    const sstPayload = new Uint8Array([
      1,
      0,
      0x08,
      1,
      0, // richTextRunCount = 1
      0x41, // "A"
    ]);
    const continuePayload = new Uint8Array([
      0,
      0,
      0,
      0, // one rich-text run (4 bytes)
    ]);

    const sstRecord = { id: 0xfc, payload: new Uint8Array([...sstHeader, ...sstPayload]) };
    const continueRecord = { id: 0x3c, payload: continuePayload };

    const { strings } = parseSstStringsFromRecords([sstRecord, continueRecord], 0);
    expect(strings).toEqual(['A']);
  });

  it('parses chained CONTINUE records with encoding flips and trailing rich/phonetic blocks', () => {
    // String: "ABCDEF"
    // flags=0x0C => compressed start + rich-text + phonetic
    // richTextRunCount=1, phoneticSize=6
    // Split character data across multiple CONTINUE records with encoding transitions:
    //   SST: "AB" (compressed)
    //   CONTINUE#1: [01] + "CD" (unicode)
    //   CONTINUE#2: [00] + "EF" (compressed) + first 2 bytes of rich-text runs
    //   CONTINUE#3: remaining rich-text bytes + full phonetic block (no string flag byte)
    const sstHeader = createSstHeader(1, 1);
    const sstPayload = new Uint8Array([6, 0, 0x0c, 1, 0, 6, 0, 0, 0, 0x41, 0x42]);
    const continuePayload1 = new Uint8Array([0x01, 0x43, 0x00, 0x44, 0x00]);
    const continuePayload2 = new Uint8Array([0x00, 0x45, 0x46, 0xaa, 0xbb]);
    const continuePayload3 = new Uint8Array([0xcc, 0xdd, 1, 2, 3, 4, 5, 6]);

    const sstRecord = { id: 0xfc, payload: new Uint8Array([...sstHeader, ...sstPayload]) };
    const continueRecord1 = { id: 0x3c, payload: continuePayload1 };
    const continueRecord2 = { id: 0x3c, payload: continuePayload2 };
    const continueRecord3 = { id: 0x3c, payload: continuePayload3 };

    const { strings } = parseSstStringsFromRecords(
      [sstRecord, continueRecord1, continueRecord2, continueRecord3],
      0
    );
    expect(strings).toEqual(['ABCDEF']);
  });
});
