import { iterateBiffRecords } from './biff-records';
import { XlsParserError } from './errors';
import type { WorkbookGlobals } from './workbook-globals';

const BIFF = {
  EOF: 0x000a,
  DIMENSION: 0x0200,
  LABEL: 0x0204,
  NUMBER: 0x0203,
  BOOLERR: 0x0205,
  RK: 0x027e,
  MULRK: 0x00bd,
  LABELSST: 0x00fd,
} as const;

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export type WorksheetCellValue = string | number | boolean | Date | null;

function decodeAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function excelSerialToDate(serial: number): Date {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const excelEpochUtc = Date.UTC(1899, 11, 30);
  const timestamp = excelEpochUtc + serial * millisecondsPerDay;
  return new Date(timestamp);
}

function isDateLikeFormat(formatIndex: number, customFormats: Map<number, string>): boolean {
  if (BUILTIN_DATE_FORMATS.has(formatIndex)) {
    return true;
  }

  const custom = customFormats.get(formatIndex);
  if (!custom) {
    return false;
  }

  const normalized = custom.toLowerCase();
  return /[ymdhis]/.test(normalized);
}

function getCellFormatIndex(xfIndex: number, globals: WorkbookGlobals): number {
  if (xfIndex < 0 || xfIndex >= globals.xfFormatIndexes.length) {
    return 0;
  }
  return globals.xfFormatIndexes[xfIndex] ?? 0;
}

function maybeNormalizeNumeric(
  value: number,
  xfIndex: number,
  globals: WorkbookGlobals
): number | Date {
  const formatIndex = getCellFormatIndex(xfIndex, globals);
  if (!isDateLikeFormat(formatIndex, globals.customFormats)) {
    return value;
  }
  return excelSerialToDate(value);
}

function decodeRkValue(raw: number): number {
  const isInteger = (raw & 0x02) === 0x02;
  const multiplyByHundred = (raw & 0x01) === 0x01;

  let value: number;
  if (isInteger) {
    value = raw >> 2;
  } else {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(4, raw & 0xfffffffc, true);
    value = view.getFloat64(0, true);
  }

  if (multiplyByHundred) {
    value /= 100;
  }

  return value;
}

function ensureCellPayloadLength(payload: Uint8Array, minLength: number, recordName: string): void {
  if (payload.length < minLength) {
    throw new XlsParserError('MALFORMED_BINARY', `${recordName} record is too short`);
  }
}

function setCell(
  rowMap: Map<number, Map<number, WorksheetCellValue>>,
  rowIndex: number,
  colIndex: number,
  value: WorksheetCellValue
): void {
  let row = rowMap.get(rowIndex);
  if (!row) {
    row = new Map<number, WorksheetCellValue>();
    rowMap.set(rowIndex, row);
  }
  row.set(colIndex, value);
}

export function parseWorksheetRows(
  workbookStream: Uint8Array,
  sheetOffset: number,
  sheetEndOffset: number,
  globals: WorkbookGlobals
): Array<Array<WorksheetCellValue>> {
  if (sheetOffset < 0 || sheetOffset >= workbookStream.length) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      `Sheet offset ${sheetOffset} is out of workbook bounds`
    );
  }

  if (sheetEndOffset <= sheetOffset || sheetEndOffset > workbookStream.length) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      `Sheet end offset ${sheetEndOffset} is invalid for start ${sheetOffset}`
    );
  }

  const sheetStream = workbookStream.subarray(sheetOffset, sheetEndOffset);
  const rowMap = new Map<number, Map<number, WorksheetCellValue>>();
  let maxRow = -1;
  let maxCol = -1;

  for (const record of iterateBiffRecords(sheetStream)) {
    if (record.id === BIFF.EOF) {
      break;
    }

    if (record.id === BIFF.DIMENSION) {
      continue;
    }

    if (record.id === BIFF.LABELSST) {
      ensureCellPayloadLength(record.payload, 10, 'LABELSST');
      const view = new DataView(
        record.payload.buffer,
        record.payload.byteOffset,
        record.payload.byteLength
      );
      const row = view.getUint16(0, true);
      const col = view.getUint16(2, true);
      const sstIndex = view.getUint32(6, true);
      const value = globals.sharedStrings[sstIndex] ?? '';
      setCell(rowMap, row, col, value);
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
      continue;
    }

    if (record.id === BIFF.LABEL) {
      ensureCellPayloadLength(record.payload, 8, 'LABEL');
      const view = new DataView(
        record.payload.buffer,
        record.payload.byteOffset,
        record.payload.byteLength
      );
      const row = view.getUint16(0, true);
      const col = view.getUint16(2, true);
      const textLength = view.getUint16(6, true);
      const textStart = 8;
      const textEnd = textStart + textLength;
      if (textEnd > record.payload.length) {
        throw new XlsParserError('MALFORMED_BINARY', 'LABEL text exceeds payload bounds');
      }
      const value = decodeAscii(record.payload.subarray(textStart, textEnd));
      setCell(rowMap, row, col, value);
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
      continue;
    }

    if (record.id === BIFF.NUMBER) {
      ensureCellPayloadLength(record.payload, 14, 'NUMBER');
      const view = new DataView(
        record.payload.buffer,
        record.payload.byteOffset,
        record.payload.byteLength
      );
      const row = view.getUint16(0, true);
      const col = view.getUint16(2, true);
      const xfIndex = view.getUint16(4, true);
      const numeric = view.getFloat64(6, true);
      const value = maybeNormalizeNumeric(numeric, xfIndex, globals);
      setCell(rowMap, row, col, value);
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
      continue;
    }

    if (record.id === BIFF.RK) {
      ensureCellPayloadLength(record.payload, 10, 'RK');
      const view = new DataView(
        record.payload.buffer,
        record.payload.byteOffset,
        record.payload.byteLength
      );
      const row = view.getUint16(0, true);
      const col = view.getUint16(2, true);
      const xfIndex = view.getUint16(4, true);
      const rkRaw = view.getUint32(6, true);
      const numeric = decodeRkValue(rkRaw);
      const value = maybeNormalizeNumeric(numeric, xfIndex, globals);
      setCell(rowMap, row, col, value);
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
      continue;
    }

    if (record.id === BIFF.MULRK) {
      ensureCellPayloadLength(record.payload, 10, 'MULRK');
      const view = new DataView(
        record.payload.buffer,
        record.payload.byteOffset,
        record.payload.byteLength
      );
      const row = view.getUint16(0, true);
      const firstCol = view.getUint16(2, true);
      const lastCol = view.getUint16(record.payload.length - 2, true);
      const valueBytesLength = record.payload.length - 6;

      if (valueBytesLength % 6 !== 0) {
        throw new XlsParserError('MALFORMED_BINARY', 'MULRK value section is misaligned');
      }

      const count = valueBytesLength / 6;
      for (let index = 0; index < count; index += 1) {
        const col = firstCol + index;
        if (col > lastCol) {
          break;
        }
        const entryOffset = 4 + index * 6;
        const xfIndex = view.getUint16(entryOffset, true);
        const rkRaw = view.getUint32(entryOffset + 2, true);
        const numeric = decodeRkValue(rkRaw);
        const value = maybeNormalizeNumeric(numeric, xfIndex, globals);
        setCell(rowMap, row, col, value);
        maxRow = Math.max(maxRow, row);
        maxCol = Math.max(maxCol, col);
      }

      continue;
    }

    if (record.id === BIFF.BOOLERR) {
      ensureCellPayloadLength(record.payload, 8, 'BOOLERR');
      const view = new DataView(
        record.payload.buffer,
        record.payload.byteOffset,
        record.payload.byteLength
      );
      const row = view.getUint16(0, true);
      const col = view.getUint16(2, true);
      const rawValue = view.getUint8(6);
      const isError = view.getUint8(7) === 1;
      const value: WorksheetCellValue = isError ? null : rawValue !== 0;
      setCell(rowMap, row, col, value);
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
  }

  if (maxRow < 0 || maxCol < 0) {
    return [];
  }

  const rows: Array<Array<WorksheetCellValue>> = [];
  for (let rowIndex = 0; rowIndex <= maxRow; rowIndex += 1) {
    const row = new Array<WorksheetCellValue>(maxCol + 1).fill(null);
    const source = rowMap.get(rowIndex);
    if (source) {
      for (const [colIndex, value] of source.entries()) {
        row[colIndex] = value;
      }
    }
    rows.push(row);
  }

  return rows;
}
