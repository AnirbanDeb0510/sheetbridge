import { XlsParserError } from './errors';
import { XLS_LIMITS } from './limits';

const CFB_SIGNATURE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const CFB_FREE_SECTOR = 0xffffffff;
const CFB_END_OF_CHAIN = 0xfffffffe;
const CFB_FAT_SECTOR = 0xfffffffd;
const CFB_DIFAT_SECTOR = 0xfffffffc;
const CFB_HEADER_DIFAT_ENTRIES = 109;
const CFB_DIRECTORY_ENTRY_SIZE = 128;
const CFB_MINI_STREAM_OBJECT_TYPE = 2;
const CFB_ROOT_OBJECT_TYPE = 5;

export interface CfbHeader {
  sectorShift: number;
  miniSectorShift: number;
  dirSectorCount: number;
  fatSectorCount: number;
  firstDirSectorLocation: number;
  miniStreamCutoffSize: number;
  firstMiniFatSectorLocation: number;
  miniFatSectorCount: number;
  firstDifatSectorLocation: number;
  difatSectorCount: number;
}

function hasCfbSignature(bytes: Uint8Array): boolean {
  if (bytes.length < CFB_SIGNATURE.length) {
    return false;
  }
  for (let index = 0; index < CFB_SIGNATURE.length; index += 1) {
    if (bytes[index] !== CFB_SIGNATURE[index]) {
      return false;
    }
  }
  return true;
}

function toHex(value: number): string {
  return `0x${value.toString(16)}`;
}

function getSectorSize(header: CfbHeader): number {
  return 1 << header.sectorShift;
}

function getMiniSectorSize(header: CfbHeader): number {
  return 1 << header.miniSectorShift;
}

function getSectorOffset(header: CfbHeader, sectorId: number): number {
  const sectorSize = getSectorSize(header);
  const offset = (sectorId + 1) * sectorSize;
  return offset;
}

function ensureSectorInBounds(header: CfbHeader, bytes: Uint8Array, sectorId: number): void {
  const sectorSize = getSectorSize(header);
  const offset = getSectorOffset(header, sectorId);
  if (offset < 0 || offset + sectorSize > bytes.length) {
    throw new XlsParserError(
      'BOUNDS_VIOLATION',
      `Sector ${sectorId} is out of bounds for file size ${bytes.length}`
    );
  }
}

function readSector(header: CfbHeader, bytes: Uint8Array, sectorId: number): Uint8Array {
  ensureSectorInBounds(header, bytes, sectorId);
  const sectorSize = getSectorSize(header);
  const offset = getSectorOffset(header, sectorId);
  return bytes.subarray(offset, offset + sectorSize);
}

function buildDifat(header: CfbHeader, bytes: Uint8Array): number[] {
  const difat: number[] = [];
  const headerView = new DataView(bytes.buffer, bytes.byteOffset, XLS_LIMITS.minCfbHeaderBytes);

  for (let index = 0; index < CFB_HEADER_DIFAT_ENTRIES; index += 1) {
    const sectorId = headerView.getUint32(76 + index * 4, true);
    if (sectorId !== CFB_FREE_SECTOR) {
      difat.push(sectorId);
    }
  }

  if (header.difatSectorCount === 0) {
    return difat;
  }

  let currentDifatSector = header.firstDifatSectorLocation;
  const sectorSize = getSectorSize(header);
  const entriesPerDifatSector = sectorSize / 4 - 1;

  for (let index = 0; index < header.difatSectorCount; index += 1) {
    if (currentDifatSector === CFB_END_OF_CHAIN || currentDifatSector === CFB_FREE_SECTOR) {
      break;
    }

    const difatSector = readSector(header, bytes, currentDifatSector);
    const view = new DataView(difatSector.buffer, difatSector.byteOffset, difatSector.byteLength);

    for (let entryIndex = 0; entryIndex < entriesPerDifatSector; entryIndex += 1) {
      const fatSectorId = view.getUint32(entryIndex * 4, true);
      if (fatSectorId !== CFB_FREE_SECTOR) {
        difat.push(fatSectorId);
      }
    }

    currentDifatSector = view.getUint32(entriesPerDifatSector * 4, true);
  }

  return difat;
}

function buildFat(header: CfbHeader, bytes: Uint8Array): Uint32Array {
  const difat = buildDifat(header, bytes);
  if (difat.length < header.fatSectorCount) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      `FAT sector count mismatch: expected ${header.fatSectorCount}, found ${difat.length}`
    );
  }

  const sectorSize = getSectorSize(header);
  const entriesPerFatSector = sectorSize / 4;
  const fat = new Uint32Array(header.fatSectorCount * entriesPerFatSector);

  for (let sectorIndex = 0; sectorIndex < header.fatSectorCount; sectorIndex += 1) {
    const fatSectorId = difat[sectorIndex];
    const fatSector = readSector(header, bytes, fatSectorId);
    const view = new DataView(fatSector.buffer, fatSector.byteOffset, fatSector.byteLength);

    for (let entryIndex = 0; entryIndex < entriesPerFatSector; entryIndex += 1) {
      fat[sectorIndex * entriesPerFatSector + entryIndex] = view.getUint32(entryIndex * 4, true);
    }
  }

  return fat;
}

function readFatEntry(fat: Uint32Array, sectorId: number): number {
  if (sectorId < 0 || sectorId >= fat.length) {
    throw new XlsParserError('BOUNDS_VIOLATION', `FAT sector index out of range: ${sectorId}`);
  }
  return fat[sectorId];
}

function readSectorChain(
  header: CfbHeader,
  bytes: Uint8Array,
  fat: Uint32Array,
  startSectorId: number,
  expectedSize?: number
): Uint8Array {
  if (startSectorId === CFB_END_OF_CHAIN || startSectorId === CFB_FREE_SECTOR) {
    return new Uint8Array(0);
  }

  const sectorSize = getSectorSize(header);
  const maxChainLength = Math.ceil(bytes.length / sectorSize) + 2;
  const collected: Uint8Array[] = [];
  let totalLength = 0;
  let current = startSectorId;

  for (let hops = 0; hops < maxChainLength; hops += 1) {
    if (
      current === CFB_END_OF_CHAIN ||
      current === CFB_FREE_SECTOR ||
      current === CFB_FAT_SECTOR ||
      current === CFB_DIFAT_SECTOR
    ) {
      break;
    }

    const sector = readSector(header, bytes, current);
    collected.push(sector);
    totalLength += sector.length;

    const next = readFatEntry(fat, current);
    if (next === current) {
      throw new XlsParserError(
        'MALFORMED_BINARY',
        `Detected self-referential FAT chain at sector ${current}`
      );
    }
    current = next;
  }

  if (collected.length === 0) {
    return new Uint8Array(0);
  }

  const outputSize = expectedSize === undefined ? totalLength : Math.min(expectedSize, totalLength);
  const output = new Uint8Array(outputSize);
  let offset = 0;
  for (const sector of collected) {
    if (offset >= outputSize) {
      break;
    }
    const copyLength = Math.min(sector.length, outputSize - offset);
    output.set(sector.subarray(0, copyLength), offset);
    offset += copyLength;
  }

  if (expectedSize !== undefined && offset < expectedSize) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      `Stream chain ended early: expected ${expectedSize} bytes, read ${offset}`
    );
  }

  return output;
}

interface DirectoryEntry {
  name: string;
  objectType: number;
  startSector: number;
  streamSize: number;
}

function decodeUtf16Le(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const codeUnit = bytes[index] | (bytes[index + 1] << 8);
    if (codeUnit === 0) {
      break;
    }
    result += String.fromCharCode(codeUnit);
  }
  return result;
}

function parseDirectoryEntries(directoryStream: Uint8Array): DirectoryEntry[] {
  if (directoryStream.length % CFB_DIRECTORY_ENTRY_SIZE !== 0) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      'Directory stream length is not aligned to 128-byte entries'
    );
  }

  const entries: DirectoryEntry[] = [];
  for (let offset = 0; offset < directoryStream.length; offset += CFB_DIRECTORY_ENTRY_SIZE) {
    const entry = directoryStream.subarray(offset, offset + CFB_DIRECTORY_ENTRY_SIZE);
    const view = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);

    const nameLengthBytes = view.getUint16(64, true);
    if (nameLengthBytes < 2 || nameLengthBytes > 64) {
      continue;
    }

    const nameByteCount = nameLengthBytes - 2;
    const name = decodeUtf16Le(entry.subarray(0, nameByteCount));
    const objectType = view.getUint8(66);

    const startSector = view.getUint32(116, true);
    const streamSizeLow = view.getUint32(120, true);
    const streamSizeHigh = view.getUint32(124, true);
    if (streamSizeHigh !== 0) {
      throw new XlsParserError(
        'UNSUPPORTED_XLS_FEATURE',
        `Directory entry "${name}" exceeds 32-bit stream size support`
      );
    }

    entries.push({
      name,
      objectType,
      startSector,
      streamSize: streamSizeLow,
    });
  }

  return entries;
}

function readMiniStream(
  header: CfbHeader,
  rootEntry: DirectoryEntry,
  bytes: Uint8Array,
  fat: Uint32Array
): Uint8Array {
  if (rootEntry.streamSize === 0) {
    return new Uint8Array(0);
  }

  return readSectorChain(header, bytes, fat, rootEntry.startSector, rootEntry.streamSize);
}

function buildMiniFat(header: CfbHeader, bytes: Uint8Array, fat: Uint32Array): Uint32Array {
  if (header.miniFatSectorCount === 0) {
    return new Uint32Array(0);
  }

  const miniFatStream = readSectorChain(
    header,
    bytes,
    fat,
    header.firstMiniFatSectorLocation,
    header.miniFatSectorCount * getSectorSize(header)
  );

  const entries = miniFatStream.length / 4;
  const miniFat = new Uint32Array(entries);
  const view = new DataView(
    miniFatStream.buffer,
    miniFatStream.byteOffset,
    miniFatStream.byteLength
  );
  for (let index = 0; index < entries; index += 1) {
    miniFat[index] = view.getUint32(index * 4, true);
  }
  return miniFat;
}

function readMiniSectorChain(
  header: CfbHeader,
  miniStream: Uint8Array,
  miniFat: Uint32Array,
  startMiniSector: number,
  expectedSize: number
): Uint8Array {
  if (startMiniSector === CFB_END_OF_CHAIN || startMiniSector === CFB_FREE_SECTOR) {
    return new Uint8Array(0);
  }

  const miniSectorSize = getMiniSectorSize(header);
  const maxChainLength = Math.ceil(miniStream.length / miniSectorSize) + 2;
  const output = new Uint8Array(expectedSize);
  let written = 0;
  let current = startMiniSector;

  for (let hops = 0; hops < maxChainLength && written < expectedSize; hops += 1) {
    if (current < 0 || current >= miniFat.length) {
      throw new XlsParserError('BOUNDS_VIOLATION', `MiniFAT sector index out of range: ${current}`);
    }

    const start = current * miniSectorSize;
    const end = start + miniSectorSize;
    if (end > miniStream.length) {
      throw new XlsParserError(
        'BOUNDS_VIOLATION',
        `Mini stream sector ${current} exceeds mini stream bounds`
      );
    }

    const chunk = miniStream.subarray(start, end);
    const copyLength = Math.min(chunk.length, expectedSize - written);
    output.set(chunk.subarray(0, copyLength), written);
    written += copyLength;

    const next = miniFat[current];
    if (next === current) {
      throw new XlsParserError(
        'MALFORMED_BINARY',
        `Detected self-referential MiniFAT chain at sector ${current}`
      );
    }

    if (next === CFB_END_OF_CHAIN || next === CFB_FREE_SECTOR) {
      break;
    }

    current = next;
  }

  if (written < expectedSize) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      `Mini stream chain ended early: expected ${expectedSize} bytes, read ${written}`
    );
  }

  return output;
}

export function parseCfbHeader(bytes: Uint8Array): CfbHeader {
  if (bytes.length < XLS_LIMITS.minCfbHeaderBytes) {
    throw new XlsParserError(
      'INVALID_XLS',
      `XLS file is too small to contain a valid CFB header (${bytes.length} bytes)`
    );
  }

  if (!hasCfbSignature(bytes)) {
    throw new XlsParserError('INVALID_XLS', 'Invalid XLS/CFB signature');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, XLS_LIMITS.minCfbHeaderBytes);
  const majorVersion = view.getUint16(26, true);
  const byteOrder = view.getUint16(28, true);
  const sectorShift = view.getUint16(30, true);
  const miniSectorShift = view.getUint16(32, true);

  if (byteOrder !== 0xfffe) {
    throw new XlsParserError('MALFORMED_BINARY', 'Unsupported CFB byte order');
  }

  if (majorVersion !== 3 && majorVersion !== 4) {
    throw new XlsParserError(
      'UNSUPPORTED_XLS_FEATURE',
      `Unsupported CFB major version: ${majorVersion}`
    );
  }

  if ((majorVersion === 3 && sectorShift !== 9) || (majorVersion === 4 && sectorShift !== 12)) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      `Unexpected sector shift ${sectorShift} for CFB major version ${majorVersion}`
    );
  }

  if (miniSectorShift !== 6) {
    throw new XlsParserError('MALFORMED_BINARY', `Unexpected mini sector shift ${miniSectorShift}`);
  }

  const header: CfbHeader = {
    sectorShift,
    miniSectorShift,
    dirSectorCount: view.getUint32(40, true),
    fatSectorCount: view.getUint32(44, true),
    firstDirSectorLocation: view.getUint32(48, true),
    miniStreamCutoffSize: view.getUint32(56, true),
    firstMiniFatSectorLocation: view.getUint32(60, true),
    miniFatSectorCount: view.getUint32(64, true),
    firstDifatSectorLocation: view.getUint32(68, true),
    difatSectorCount: view.getUint32(72, true),
  };

  return header;
}

export function extractWorkbookStream(cfbBytes: Uint8Array): Uint8Array {
  const header = parseCfbHeader(cfbBytes);
  const fat = buildFat(header, cfbBytes);
  const directoryStream = readSectorChain(
    header,
    cfbBytes,
    fat,
    header.firstDirSectorLocation,
    header.dirSectorCount > 0 ? header.dirSectorCount * getSectorSize(header) : undefined
  );
  const directoryEntries = parseDirectoryEntries(directoryStream);

  const rootEntry = directoryEntries.find((entry) => entry.objectType === CFB_ROOT_OBJECT_TYPE);
  if (!rootEntry) {
    throw new XlsParserError('MALFORMED_BINARY', 'Root directory entry was not found');
  }

  const workbookEntry = directoryEntries.find(
    (entry) =>
      entry.objectType === CFB_MINI_STREAM_OBJECT_TYPE &&
      (entry.name === 'Workbook' || entry.name === 'Book')
  );

  if (!workbookEntry) {
    throw new XlsParserError('INVALID_XLS', 'Workbook stream entry was not found in CFB directory');
  }

  if (workbookEntry.streamSize > XLS_LIMITS.maxWorkbookBytes) {
    throw new XlsParserError(
      'BOUNDS_VIOLATION',
      `Workbook stream size ${workbookEntry.streamSize} exceeds max ${XLS_LIMITS.maxWorkbookBytes}`
    );
  }

  const useMiniStream = workbookEntry.streamSize < header.miniStreamCutoffSize;
  if (!useMiniStream) {
    return readSectorChain(
      header,
      cfbBytes,
      fat,
      workbookEntry.startSector,
      workbookEntry.streamSize
    );
  }

  const miniStream = readMiniStream(header, rootEntry, cfbBytes, fat);
  const miniFat = buildMiniFat(header, cfbBytes, fat);
  if (miniFat.length === 0) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      'Workbook is stored in mini stream but MiniFAT is missing'
    );
  }

  const workbookBytes = readMiniSectorChain(
    header,
    miniStream,
    miniFat,
    workbookEntry.startSector,
    workbookEntry.streamSize
  );

  if (workbookBytes.length === 0) {
    throw new XlsParserError(
      'MALFORMED_BINARY',
      `Workbook stream entry ${toHex(workbookEntry.startSector)} resolved to empty data`
    );
  }

  return workbookBytes;
}
