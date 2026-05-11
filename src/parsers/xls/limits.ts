export const XLS_LIMITS = {
  minCfbHeaderBytes: 512,
  maxWorkbookBytes: 64 * 1024 * 1024,
  maxBiffRecordBytes: 8 * 1024,
  maxSheetCount: 256,
  maxSharedStrings: 1_000_000,
} as const;
