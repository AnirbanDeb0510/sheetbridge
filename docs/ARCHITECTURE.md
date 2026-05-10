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
      -> XLS  -> parseXLS (placeholder today)
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
  - Placeholder for BIFF8/OLE implementation.
  - Planned for v1.0 before release.

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
   - CSV/XLSX parser executes and returns rows or row-objects.
   - XLS parser path currently throws not-implemented.

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

- Implement BIFF8 parser with spec-guided record reading.
- Keep same output contract as CSV/XLSX parser.
- Reuse option semantics (`header`, `sheet`, `maxRows`, etc.).
