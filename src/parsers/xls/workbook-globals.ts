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

// Helper to read bytes across SST/CONTINUE records, handling CONTINUE encoding flag transitions
class RecordStream {
  public records: Uint8Array[];
  public recordIndex: number;
  public offset: number;
  public encodingFlag: number | null;

  constructor(records: Uint8Array[], initialEncodingFlag: number | null = null) {
    this.records = records;
    this.recordIndex = 0;
    this.offset = 0;
    this.encodingFlag = initialEncodingFlag;
  }

  // Read n bytes, crossing records as needed
  read(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let outOffset = 0;
    while (outOffset < n) {
      if (this.recordIndex >= this.records.length) {
        throw new XlsParserError('MALFORMED_BINARY', 'Unexpected end of SST/CONTINUE records');
      }
      const rec = this.records[this.recordIndex];
      const remain = rec.length - this.offset;
      if (remain === 0) {
        this.nextRecord();
        continue;
      }
      const toCopy = Math.min(n - outOffset, remain);
      out.set(rec.subarray(this.offset, this.offset + toCopy), outOffset);
      this.offset += toCopy;
      outOffset += toCopy;
    }
    return out;
  }

  // Read a single byte
  readByte(): number {
    return this.read(1)[0];
  }

  // Peek at the next byte
  peekByte(): number {
    if (this.recordIndex >= this.records.length) {
      throw new XlsParserError('MALFORMED_BINARY', 'Unexpected end of SST/CONTINUE records');
    }
    const rec = this.records[this.recordIndex];
    if (this.offset >= rec.length) {
      this.nextRecord();
      return this.peekByte();
    }
    return rec[this.offset];
  }

  // Move to next record, handling CONTINUE encoding flag
  public nextRecord() {
    this.recordIndex++;
    this.offset = 0;
    // If the new record starts with an encoding flag, update it and advance offset
    if (this.recordIndex < this.records.length) {
      const rec = this.records[this.recordIndex];
      if (rec.length > 0) {
        this.encodingFlag = rec[0];
        this.offset = 1;
      }
    }
  }

  // Read a Unicode/compressed string of given charCount, using current encodingFlag
  readString(charCount: number, isUnicode: boolean): string {
    let bytesNeeded = charCount * (isUnicode ? 2 : 1);
    const chars: number[] = [];
    while (bytesNeeded > 0) {
      if (this.recordIndex >= this.records.length) {
        throw new XlsParserError('MALFORMED_BINARY', 'Unexpected end of SST/CONTINUE records');
      }
      const rec = this.records[this.recordIndex];
      const remain = rec.length - this.offset;
      if (remain === 0) {
        this.nextRecord();
        // After CONTINUE, encodingFlag may change
        isUnicode = this.encodingFlag ? (this.encodingFlag & 0x01) === 0x01 : isUnicode;
        continue;
      }
      const toRead = Math.min(bytesNeeded, remain);
      if (isUnicode) {
        for (let i = 0; i < toRead; i += 2) {
          if (this.offset + i + 1 >= rec.length) break;
          const codeUnit = rec[this.offset + i] | (rec[this.offset + i + 1] << 8);
          chars.push(codeUnit);
        }
      } else {
        for (let i = 0; i < toRead; ++i) {
          chars.push(rec[this.offset + i]);
        }
      }
      this.offset += toRead;
      bytesNeeded -= toRead;
    }
    return isUnicode ? String.fromCharCode(...chars) : String.fromCharCode(...chars);
  }

  // Read n bytes as a Uint8Array (for rich text/phonetic blocks)
  readRaw(n: number): Uint8Array {
    return this.read(n);
  }

  atEnd(): boolean {
    return this.recordIndex >= this.records.length;
  }
}

interface ParsedUnicodeString {
  value: string;
}

// Parse a Unicode string from a RecordStream, handling CONTINUE and encoding flag transitions
function parseUnicodeStringFromStream(stream: RecordStream): ParsedUnicodeString {
  // Header: 2 bytes charCount, 1 byte flags
  const charCount = stream.read(2);
  const charCountVal = charCount[0] | (charCount[1] << 8);
  const flags = stream.readByte();
  let isUnicode = (flags & 0x01) === 0x01;
  const hasRichText = (flags & 0x08) === 0x08;
  const hasPhonetic = (flags & 0x04) === 0x04;

  let richTextRunCount = 0;
  let phoneticSize = 0;
  if (hasRichText) {
    const richTextBytes = stream.read(2);
    richTextRunCount = richTextBytes[0] | (richTextBytes[1] << 8);
  }
  if (hasPhonetic) {
    const phoneticBytes = stream.read(4);
    phoneticSize =
      phoneticBytes[0] |
      (phoneticBytes[1] << 8) |
      (phoneticBytes[2] << 16) |
      (phoneticBytes[3] << 24);
  }

  // Read the string, handling CONTINUE/encoding flag
  let value = '';
  let charsRemaining = charCountVal;
  while (charsRemaining > 0) {
    // Determine how many bytes are left in this record
    if (stream.atEnd()) {
      throw new XlsParserError(
        'MALFORMED_BINARY',
        'Unexpected end of SST/CONTINUE records while reading string'
      );
    }
    // Read as many chars as possible in this record
    const rec = stream.records[stream.recordIndex];
    const off = stream.offset;
    const remain = rec.length - off;
    if (remain === 0) {
      stream.nextRecord();
      // After CONTINUE, encodingFlag may change
      isUnicode = stream.encodingFlag ? (stream.encodingFlag & 0x01) === 0x01 : isUnicode;
      continue;
    }
    let charsInThisRecord = isUnicode ? Math.floor(remain / 2) : remain;
    charsInThisRecord = Math.min(charsInThisRecord, charsRemaining);
    if (charsInThisRecord === 0) {
      stream.nextRecord();
      isUnicode = stream.encodingFlag ? (stream.encodingFlag & 0x01) === 0x01 : isUnicode;
      continue;
    }
    if (isUnicode) {
      for (let i = 0; i < charsInThisRecord; ++i) {
        if (stream.offset + 1 >= rec.length) break;
        const codeUnit = rec[stream.offset] | (rec[stream.offset + 1] << 8);
        value += String.fromCharCode(codeUnit);
        stream.offset += 2;
      }
    } else {
      for (let i = 0; i < charsInThisRecord; ++i) {
        value += String.fromCharCode(rec[stream.offset]);
        stream.offset += 1;
      }
    }
    charsRemaining -= charsInThisRecord;
  }

  // Rich text runs (4 bytes each)
  if (richTextRunCount > 0) {
    stream.readRaw(richTextRunCount * 4);
  }
  // Phonetic block
  if (phoneticSize > 0) {
    stream.readRaw(phoneticSize);
  }

  return { value };
}

export function parseSstStringsFromRecords(
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

  // Gather all SST and CONTINUE payloads (excluding SST header)
  const chunks: Uint8Array[] = [sstRecord.payload.subarray(8)];
  let endIndex = startIndex;
  while (endIndex + 1 < records.length && records[endIndex + 1].id === BIFF.CONTINUE) {
    endIndex += 1;
    chunks.push(records[endIndex].payload);
  }

  // Use RecordStream to parse strings
  const stream = new RecordStream(chunks);
  const strings: string[] = [];
  for (let i = 0; i < uniqueStrings; ++i) {
    const parsed = parseUnicodeStringFromStream(stream);
    strings.push(parsed.value);
  }

  return { strings, endIndex };
}

function parseFormatRecord(payload: Uint8Array): { formatIndex: number; format: string } {
  if (payload.length < 5) {
    throw new XlsParserError('MALFORMED_BINARY', 'FORMAT record is too short');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const formatIndex = view.getUint16(0, true);
  // FORMAT record string is always a single segment, so we can use a RecordStream with one chunk
  const stringBytes = payload.subarray(2);
  const stream = new RecordStream([stringBytes]);
  const parsed = parseUnicodeStringFromStream(stream);

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
