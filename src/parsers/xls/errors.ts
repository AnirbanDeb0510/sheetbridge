export type XlsParserErrorCode =
  | 'INVALID_XLS'
  | 'UNSUPPORTED_XLS_FEATURE'
  | 'MALFORMED_BINARY'
  | 'BOUNDS_VIOLATION';

export class XlsParserError extends Error {
  constructor(
    public readonly code: XlsParserErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'XlsParserError';
  }
}

export function isXlsParserError(error: unknown): error is XlsParserError {
  return error instanceof XlsParserError;
}
