# sheetbridge

A unified, type-safe TypeScript library to parse CSV, XLS, and XLSX files to JSON in the browser and Node.js.

## Features

- 🎯 **Unified API** — Parse CSV, XLS, and XLSX with a single function call
- 🔍 **Auto-detection** — Automatically detects file format from extension or MIME type
- 📝 **Type-safe** — Full TypeScript support with comprehensive type definitions
- ⚙️ **Highly configurable** — Control headers, blank rows, sheet selection, column mapping, and more
- 🌐 **Browser & Node.js** — Works in modern browsers and Node.js environments
- 🚀 **Zero vulnerabilities** — Built with actively maintained, security-audited dependencies
- 📦 **Small bundle** — Optimized for frontend use with tree-shaking support
- 🔄 **Multi-sheet support** — Read specific sheets or combine all sheets into one JSON

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

## Documentation

Full documentation coming soon. Check the `examples/` directory for usage patterns.

## Supported Formats

- **CSV** — Comma-separated values
- **XLSX** — Excel 2007+ (.xlsx)
- **XLS** — Excel 97-2003 (.xls)

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
