import { iterateBiffRecords } from './biff-records';
import { XlsParserError } from './errors';
import { XLS_LIMITS } from './limits';

const BIFF = {
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  FORMAT: 0x041e,
  XF: 0x00e0,
} as const;

export interface WorkbookSheetRef {
  name: string;
  offset: number;
}

export interface WorkbookGlobals {
  sheets: WorkbookSheetRef[];
  sharedStrings: string[];
  xfFormatIndexes: number[];
  customFormats: Map<number, string>;
}

function decodeAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function parseBoundSheetName(payload: Uint8Array): string {
  if (payload.length < 8) {
    throw new XlsParserError('MALFORMED_BINARY', 'BOUNDSHEET record is too short');
  }

  const nameLength = payload[6];
  const isUnicode = (payload[7] & 0x01) === 0x01;
  const nameBytesOffset = 8;

  if (!isUnicode) {
    const nameEnd = nameBytesOffset + nameLength;
    if (nameEnd > payload.length) {
      throw new XlsParserError('MALFORMED_BINARY', 'BOUNDSHEET name exceeds payload length');
    }
    return decodeAscii(payload.subarray(nameBytesOffset, nameEnd));
  }

  const unicodeBytesLength = nameLength * 2;
  const unicodeEnd = nameBytesOffset + unicodeBytesLength;
  if (unicodeEnd > payload.length) {
    throw new XlsParserError('MALFORMED_BINARY', 'BOUNDSHEET unicode name exceeds payload length');
  }

  let result = '';
  for (let index = nameBytesOffset; index < unicodeEnd; index += 2) {
    const codeUnit = payload[index] | (payload[index + 1] << 8);
    result += String.fromCharCode(codeUnit);
  }
  return result;
}

function parseBoundSheet(payload: Uint8Array): WorkbookSheetRef {
  if (payload.length < 8) {
    throw new XlsParserError('MALFORMED_BINARY', 'BOUNDSHEET record is too short');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const offset = view.getUint32(0, true);
  return {
    name: parseBoundSheetName(payload),
    offset,
  };
}

function decodeString(bytes: Uint8Array, isUnicode: boolean): string {
  if (!isUnicode) {
    return decodeAscii(bytes);
  }

  let result = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const codeUnit = bytes[index] | (bytes[index + 1] << 8);
    result += String.fromCharCode(codeUnit);
  }
  return result;
}

interface ParsedUnicodeString {
  value: string;
  bytesConsumed: number;
}

function parseUnicodeString(bytes: Uint8Array, offset: number): ParsedUnicodeString {
  if (offset + 3 > bytes.length) {
    throw new XlsParserError('MALFORMED_BINARY', 'Unicode string header exceeds payload bounds');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
  const charCount = view.getUint16(0, true);
  const flags = view.getUint8(2);
  const isUnicode = (flags & 0x01) === 0x01;
  const hasRichText = (flags & 0x08) === 0x08;
  const hasPhonetic = (flags & 0x04) === 0x04;

  let cursor = offset + 3;
  let richTextRunCount = 0;
  let phoneticSize = 0;

  if (hasRichText) {
    if (cursor + 2 > bytes.length) {
      throw new XlsParserError('MALFORMED_BINARY', 'Rich text count exceeds payload bounds');
    }
    richTextRunCount = new DataView(bytes.buffer, bytes.byteOffset + cursor, 2).getUint16(0, true);
    cursor += 2;
  }

  if (hasPhonetic) {
    if (cursor + 4 > bytes.length) {
      throw new XlsParserError('MALFORMED_BINARY', 'Phonetic size exceeds payload bounds');
    }
    phoneticSize = new DataView(bytes.buffer, bytes.byteOffset + cursor, 4).getUint32(0, true);
    cursor += 4;
  }

  const textByteLength = charCount * (isUnicode ? 2 : 1);
  const textEnd = cursor + textByteLength;
  if (textEnd > bytes.length) {
    throw new XlsParserError('MALFORMED_BINARY', 'Unicode string data exceeds payload bounds');
  }

  const value = decodeString(bytes.subarray(cursor, textEnd), isUnicode);
  cursor = textEnd;

  const richTextBytes = richTextRunCount * 4;
  if (cursor + richTextBytes + phoneticSize > bytes.length) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      'Unicode string extension data exceeds payload bounds'
    );
  }
  cursor += richTextBytes + phoneticSize;

  return {
    value,
    bytesConsumed: cursor - offset,
  };
}

function parseSstStringsFromRecords(
  records: Array<{ id: number; payload: Uint8Array }>,
  startIndex: number
): {
  strings: string[];
  endIndex: number;
} {
  const sstRecord = records[startIndex];
  if (sstRecord.payload.length < 8) {
    throw new XlsParserError('MALFORMED_BINARY', 'SST record is too short');
  }

  const sstView = new DataView(
    sstRecord.payload.buffer,
    sstRecord.payload.byteOffset,
    sstRecord.payload.byteLength
  );
  const uniqueStrings = sstView.getUint32(4, true);
  if (uniqueStrings > XLS_LIMITS.maxSharedStrings) {
    throw new XlsParserError(
      'BOUNDS_VIOLATION',
      `SST unique string count ${uniqueStrings} exceeds max ${XLS_LIMITS.maxSharedStrings}`
    );
  }

  const chunks: Uint8Array[] = [sstRecord.payload.subarray(8)];
  let endIndex = startIndex;
  while (endIndex + 1 < records.length && records[endIndex + 1].id === BIFF.CONTINUE) {
    endIndex += 1;
    chunks.push(records[endIndex].payload);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Uint8Array(totalLength);
  let joinedOffset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, joinedOffset);
    joinedOffset += chunk.length;
  }

  const strings: string[] = [];
  let cursor = 0;
  while (strings.length < uniqueStrings && cursor < joined.length) {
    const parsed = parseUnicodeString(joined, cursor);
    strings.push(parsed.value);
    cursor += parsed.bytesConsumed;
  }

  if (strings.length < uniqueStrings) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      `SST decoding ended early: expected ${uniqueStrings}, parsed ${strings.length}`
    );
  }

  return { strings, endIndex };
}

function parseFormatRecord(payload: Uint8Array): { formatIndex: number; format: string } {
  if (payload.length < 5) {
    throw new XlsParserError('MALFORMED_BINARY', 'FORMAT record is too short');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const formatIndex = view.getUint16(0, true);
  const stringBytes = payload.subarray(2);
  const parsed = parseUnicodeString(stringBytes, 0);

  return {
    formatIndex,
    format: parsed.value,
  };
}

export function parseWorkbookGlobals(workbookStream: Uint8Array): WorkbookGlobals {
  const sheets: WorkbookSheetRef[] = [];
  let sharedStrings: string[] = [];
  const xfFormatIndexes: number[] = [];
  const customFormats = new Map<number, string>();

  const records = [...iterateBiffRecords(workbookStream)];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.id === BIFF.BOUNDSHEET) {
      if (sheets.length >= XLS_LIMITS.maxSheetCount) {
        throw new XlsParserError(
          'BOUNDS_VIOLATION',
          `Workbook has more than ${XLS_LIMITS.maxSheetCount} sheets`
        );
      }
      sheets.push(parseBoundSheet(record.payload));
      continue;
    }

    if (record.id === BIFF.SST) {
      const parsed = parseSstStringsFromRecords(records, index);
      sharedStrings = parsed.strings;
      index = parsed.endIndex;
      continue;
    }

    if (record.id === BIFF.XF) {
      if (record.payload.length < 4) {
        throw new XlsParserError('MALFORMED_BINARY', 'XF record is too short');
      }
      const xfView = new DataView(
        record.payload.buffer,
        record.payload.byteOffset,
        record.payload.byteLength
      );
      xfFormatIndexes.push(xfView.getUint16(2, true));
      continue;
    }

    if (record.id === BIFF.FORMAT) {
      const parsed = parseFormatRecord(record.payload);
      customFormats.set(parsed.formatIndex, parsed.format);
    }
  }

  return {
    sheets,
    sharedStrings,
    xfFormatIndexes,
    customFormats,
  };
}
