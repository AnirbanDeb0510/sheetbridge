# sheetbridge

A unified, type-safe TypeScript library to parse CSV, XLS, and XLSX files to JSON in the browser and Node.js.

## Features

- Unified API for CSV, XLSX, and XLS parsing
- Automatic format detection from filename and MIME metadata
- Browser and Node.js input support
- Option parity across formats (`header`, `trim`, `maxRows`, `columnMapping`, `sheet`)
- Security-focused XLS BIFF8 parser implementation

## Installation

```bash
npm install sheetbridge
```

## Quick Start

```typescript
import { parseFile } from 'sheetbridge';

// Browser
const file = document.getElementById('fileInput').files[0];
const data = await parseFile(file);
console.log(data); // Array of rows or objects

// Node.js
import fs from 'fs';
const data = await parseFile(fs.readFileSync('data.xlsx'));
```

## Options by Example

### Header mode

```typescript
import { parseFile } from 'sheetbridge';

// header: true (default): first row becomes object keys
const objectRows = await parseFile(file, { header: true });
// [{ Name: 'Ava', Age: 29 }, ...]

// header: false: keep row arrays
const arrayRows = await parseFile(file, { header: false });
// [['Name', 'Age'], ['Ava', 29], ...]
```

### Sheet selection (XLSX/XLS)

```typescript
import { parseFile } from 'sheetbridge';

// by sheet name
const byName = await parseFile(file, { sheet: 'Employees' });

// by 0-based index
const byIndex = await parseFile(file, { sheet: 1 });
```

### Trim, maxRows, and columnMapping

```typescript
import { parseFile } from 'sheetbridge';

const result = await parseFile(file, {
  trim: true,
  maxRows: 500,
  columnMapping: {
    'Employee Name': 'name',
    'Joining Date': 'joinedAt',
    Salary: 'salary',
  },
});
```

## Supported Formats

- **CSV** — Comma-separated values
- **XLSX** — Excel 2007+ (.xlsx)
- **XLS** — Excel 97-2003 (.xls)

## Option Parity

| Option          | CSV                        | XLSX | XLS (BIFF8 v1) |
| --------------- | -------------------------- | ---- | -------------- |
| `header`        | Yes                        | Yes  | Yes            |
| `trim`          | Yes                        | Yes  | Yes            |
| `maxRows`       | Yes                        | Yes  | Yes            |
| `columnMapping` | Yes                        | Yes  | Yes            |
| `sheet`         | N/A (single logical sheet) | Yes  | Yes            |

## All Options Reference

| Option          | Type                                  | Default    | CSV     | XLSX  | XLS   | Notes                                                               |
| --------------- | ------------------------------------- | ---------- | ------- | ----- | ----- | ------------------------------------------------------------------- |
| `header`        | `boolean`                             | `true`     | Yes     | Yes   | Yes   | When `true`, first row is used as keys and output rows are objects. |
| `skipBlankRows` | `boolean`                             | `false`    | Yes     | Yes   | Yes   | Filters blank/empty rows.                                           |
| `sheet`         | `string \| number`                    | all sheets | Ignored | Yes   | Yes   | `string` = sheet name, `number` = 0-based sheet index.              |
| `maxRows`       | `number`                              | unlimited  | Yes     | Yes   | Yes   | Applies an upper bound to returned rows per parsed sheet.           |
| `columnMapping` | `Record<string, string>`              | none       | Yes     | Yes   | Yes   | Renames output object keys when `header=true`.                      |
| `trim`          | `boolean`                             | `false`    | Yes     | Yes   | Yes   | Trims whitespace from string values.                                |
| `dateFormat`    | `string`                              | none       | No      | No-op | No-op | Present in type surface; currently not applied in parser output.    |
| `parseNumber`   | `(value: string) => number \| string` | none       | No      | No-op | No-op | Present in type surface; currently not applied in parser output.    |

## XLS v1 Scope

- BIFF8 `.xls` files only
- Supported value types:
  - string
  - number
  - boolean
  - date / datetime
  - currency-formatted numeric cells
- Multi-sheet parsing and sheet selection by name or index

## XLS v1 Limits

- Formula evaluation is out of scope
- Macros/charts and uncommon BIFF records are out of scope
- Unsupported constructs fail with explicit parser errors

## XLS Parser Data Flow

1. Parse OLE2/CFB container to extract workbook streams.
2. Traverse BIFF records with strict length/offset checks.
3. Parse workbook globals (sheets, shared strings, formats).
4. Parse worksheet cell records and normalize values.
5. Apply public options and return unified `ParseResult`.

For full internals, see `docs/ARCHITECTURE.md`.

## Feature Manifest (XLS)

- Record coverage: `LABEL`, `LABELSST`, `NUMBER`, `RK`, `MULRK`, `BOOLERR`
- Worksheet support: multi-sheet workbook traversal + sheet selection
- Security guardrails:
  - deterministic binary parsing (no regex-heavy parser path)
  - bounds checks before all offset/length reads
  - null-prototype row objects for header-derived keys
  - explicit typed parser errors for malformed or unsupported data

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
