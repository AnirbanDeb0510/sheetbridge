# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-05-12

### Fixed

- Fixed XLS shared-string (SST) decoding across BIFF8 `CONTINUE` records.
- Resolved failures where some `.xls` files could throw `Unicode string data exceeds payload bounds` due to record-boundary handling.
- Updated workbook globals parsing to correctly handle continuation record transitions and continuation encoding flags while reading split shared strings.

### Tests

- Added targeted XLS SST/CONTINUE regression tests for:
  - Unicode strings split across SST/CONTINUE boundaries.
  - Continuation encoding flag transitions.
  - Malformed split-string payload error paths.
- Ran full lint and test suite successfully (`40/40` tests passing).

### Compatibility

- Re-validated in Angular smoke app runtime by uploading and parsing `.xls` fixture successfully.

## [1.0.0] - 2026-05-11

### Added

- Unified parsing API for CSV, XLSX, and XLS via `parseFile` and `parseFileFlat`.
- XLS (BIFF8) parsing support with custom parser modules for container parsing, BIFF record iteration, workbook globals, and worksheet extraction.
- Browser and Node.js coverage for core parsing flows, including real XLS fixture coverage.
- Option support and parity across formats for:
  - `header`
  - `sheet`
  - `trim`
  - `maxRows`
  - `columnMapping`
  - `skipBlankRows`

### Security

- No runtime dependency on legacy npm `xlsx` package.
- Security-focused XLS parsing approach with deterministic binary parsing, explicit bounds checks, and explicit parser failures for unsupported/malformed input.

### Compatibility

- Browser smoke validation completed in Angular app context for upload + parse flow.

### Changed

- Package export paths updated to match actual build outputs (`dist/index.js` and `dist/index.mjs`).

### XLS v1 Scope

- BIFF8 `.xls` support.
- Supported values: strings, numbers, booleans, dates, datetimes, currency-formatted numeric cells.
- Multi-sheet parsing and selection by sheet name or 0-based index.

### XLS v1 Limits

- Formula evaluation is out of scope.
- Macros/charts and uncommon BIFF records are out of scope.
- Unsupported constructs fail with explicit parser errors.
