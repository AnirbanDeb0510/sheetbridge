export const XLS_LIMITS = {
  minCfbHeaderBytes: 512,
  maxWorkbookBytes: 64 * 1024 * 1024,
  // BIFF record payload max is 8224 bytes (0x2020), not 8192.
  maxBiffRecordBytes: 8 * 1024 + 32,
  maxSheetCount: 256,
  maxSharedStrings: 1_000_000,
} as const;
