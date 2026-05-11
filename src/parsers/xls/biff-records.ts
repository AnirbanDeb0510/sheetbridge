import { XlsParserError } from './errors';
import { XLS_LIMITS } from './limits';

export interface BiffRecord {
  id: number;
  length: number;
  offset: number;
  payload: Uint8Array;
}

export function* iterateBiffRecords(workbookStream: Uint8Array): Generator<BiffRecord> {
  let offset = 0;

  while (offset + 4 <= workbookStream.length) {
    const view = new DataView(workbookStream.buffer, workbookStream.byteOffset + offset, 4);
    const id = view.getUint16(0, true);
    const length = view.getUint16(2, true);

    if (length > XLS_LIMITS.maxBiffRecordBytes) {
      throw new XlsParserError(
        'BOUNDS_VIOLATION',
        `BIFF record 0x${id.toString(16)} length ${length} exceeds max ${XLS_LIMITS.maxBiffRecordBytes}`
      );
    }

    const payloadStart = offset + 4;
    const payloadEnd = payloadStart + length;
    if (payloadEnd > workbookStream.length) {
      throw new XlsParserError(
        'MALFORMED_BINARY',
        `Truncated BIFF record 0x${id.toString(16)} at offset ${offset}`
      );
    }

    yield {
      id,
      length,
      offset,
      payload: workbookStream.subarray(payloadStart, payloadEnd),
    };

    offset = payloadEnd;
  }

  if (offset !== workbookStream.length) {
    const trailing = workbookStream.subarray(offset);
    const hasNonZero = trailing.some((value) => value !== 0);
    if (hasNonZero) {
      throw new XlsParserError('MALFORMED_BINARY', 'Unexpected trailing bytes in BIFF stream');
    }
  }
}
