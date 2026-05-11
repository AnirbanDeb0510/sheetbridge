# SheetBridge Architecture and Data Flow

## Goal

SheetBridge provides one unified browser-first API to convert spreadsheet uploads into JSON across CSV, XLSX, and XLS.

## Current High-Level Architecture

```text
UI/File Upload
  -> parseFile(file, options)
    -> format detection (by filename/mime)
      -> CSV  -> parseCSV (PapaParse)
      -> XLSX -> parseXLSX (read-excel-file)
      -> XLS  -> parseXLS (BIFF8 parser)
    -> normalize sheet output
  -> ParseResult { sheets, metadata }
```

## Main Modules

- `src/index.ts`
  - Orchestrates parsing flow.
  - Accepts `File | Blob | ArrayBuffer | Buffer` inputs.
  - Detects format and dispatches parser.
  - Returns unified `ParseResult`.

- `src/detect.ts`
  - Detects format (`csv`, `xlsx`, `xls`, `unknown`) from name and mime.

- `src/parsers/csv.ts`
  - Uses PapaParse to convert CSV into JSON rows.
  - Supports options for `header`, `skipBlankRows`, `maxRows`, `columnMapping`.

- `src/parsers/xlsx.ts`
  - Uses `read-excel-file/browser`.
  - Converts rows to objects when `header=true`.
  - Applies trim/mapping and sheet filtering.

- `src/parsers/xls.ts`
  - Orchestrates BIFF8 parsing and unified option handling.

- `src/parsers/xls/cfb.ts`
  - Parses OLE2/CFB container and stream allocation tables.
  - Resolves workbook stream bytes safely with bounds checks.

- `src/parsers/xls/biff-records.ts`
  - Iterates BIFF records from workbook stream.
  - Enforces record-size and offset safety checks.

- `src/parsers/xls/workbook-globals.ts`
  - Parses workbook globals (sheet metadata, shared strings, formats).

- `src/parsers/xls/worksheet.ts`
  - Parses supported worksheet cell records.
  - Normalizes values into string/number/boolean/date-compatible outputs.

- `src/types.ts`
  - Shared types for API contracts and parser output.

## Data Flow in Detail

1. Input ingestion
   - `parseFile()` accepts uploaded data from browser.
   - Name and mime metadata are captured when available.

2. Format detection
   - `detectFormat()` selects parser path.
   - Unsupported formats fail early with explicit error.

3. Parser execution

- CSV/XLSX/XLS parser executes and returns rows or row-objects.
- XLS path runs BIFF8 parser flow and applies same public options.

4. Normalization
   - Data is wrapped into unified `SheetData[]` shape:
     - `name`
     - `data` (array of row arrays or object rows)

5. Result assembly
   - `ParseResult` includes:
     - `sheets`
     - `metadata` (`format`, `fileName`, `sheetCount`, `rowCount`)

## JSON Conversion Strategy

- Header mode (`header=true`)
  - First row treated as keys.
  - Subsequent rows become objects.

- Raw mode (`header=false`)
  - Rows kept as arrays.

- Optional transforms
  - `trim`: trims string cells.
  - `columnMapping`: renames keys.
  - `skipBlankRows`, `maxRows`: controls result size.

## File-Type Behavior

### CSV

- CSV parsing is string-preserving by default.
- PapaParse is used with `dynamicTyping: false`, so values remain text unless a future explicit conversion step is added.
- Quoted values, embedded commas, and blank-row filtering are handled through the parser options.

### XLSX

- XLSX parsing is type-aware through `read-excel-file`.
- Numbers remain numeric.
- Booleans become booleans.
- Excel date and datetime cells become `Date` instances.
- Percentage and fraction-formatted cells resolve to their numeric values.

### Sheet Selection

- If `options.sheet` is omitted, all sheets are returned.
- If `options.sheet` is a string, the matching sheet name is returned.
- If `options.sheet` is a number, the 0-based sheet index is returned.
- If a requested sheet does not exist, the parser throws a descriptive error.

## Why This Approach

- Reliability: delegates CSV/XLSX decoding to mature parsers.
- Simplicity: exposes one API for three formats.
- Extensibility: XLS parser can be added without changing API.
- Frontend focus: works with browser upload primitives directly.

## Planned XLS Approach

- Implemented: BIFF8 parser with spec-guided record reading.
- Implemented: same output contract as CSV/XLSX parser.
- Implemented: option semantics (`header`, `sheet`, `maxRows`, `trim`, `columnMapping`).

## XLS Parser Data Flow (Implemented)

1. Input to bytes

- `parseFile()` accepts browser/node input and resolves byte buffer.

2. Container extraction

- `cfb.ts` parses OLE2/CFB header, FAT/DIFAT chains, and directory entries.
- Workbook stream is extracted with stream-size and sector-chain bounds checks.

3. BIFF traversal

- `biff-records.ts` walks record headers and payloads.
- Invalid lengths, offsets, or impossible record boundaries fail fast.

4. Workbook globals

- `workbook-globals.ts` captures sheet list, shared string table, and format metadata.

5. Worksheet decoding

- `worksheet.ts` decodes supported cell records (`LABEL`, `LABELSST`, `NUMBER`, `RK`, `MULRK`, `BOOLERR`).
- Values are normalized into API-compatible typed cells.

6. Option application and output

- `xls.ts` applies `header`, `trim`, `maxRows`, `columnMapping`, and `sheet` selection.
- Output is emitted as unified `ParseResult` with per-sheet data + metadata.
