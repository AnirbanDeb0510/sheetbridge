# SheetBridge Development Roadmap

## Status Snapshot

- Package scaffold and tooling: Done
- CI workflow and branch protection setup: Done
- Unified parser entrypoint: Done
- CSV support (PapaParse wrapper): Done (baseline)
- XLSX support (read-excel-file wrapper): Done (baseline)
- XLS support: Not done (placeholder)

## What Is Done

### Foundation

- TypeScript project setup (`tsup`, `vitest`, ESLint, Prettier)
- Build artifacts for ESM/CJS + type declarations
- GitHub workflows for CI/publish
- CODEOWNERS and protected PR flow

### Core Parsing Surface

- Input format detection
- Unified `parseFile()` and `parseFileFlat()` API
- Shared types for result and options

### CSV Baseline

- Parse uploaded CSV to JSON row objects
- Header handling
- Blank row skipping
- Column mapping
- Max row limiting
- Fixture coverage for mixed-text CSV rows and quoted edge cases

### XLSX Baseline

- Parse workbook sheets to rows
- Optional header-object conversion
- Trim/mapping support
- Basic sheet selection behavior
- Fixture coverage for multi-sheet workbooks, dates, datetimes, percentages, and fractions

## What Is Left

### Priority 1 (Must have for v1.0)

1. Implement XLS parser (`src/parsers/xls.ts`)
2. Add robust XLS fixture coverage
3. Add unit and integration tests for XLS edge cases
4. Finalize API docs and usage examples

### Priority 2 (Strongly recommended)

1. Improve error model with typed error codes
2. Add explicit metadata fields per sheet
3. Add performance guardrails for large files
4. Add browser compatibility notes in README

### Priority 3 (Post v1.0)

1. Optional Web Worker helper for non-blocking parse
2. Optional schema validation/transformation hook
3. Optional streaming/chunk adapters where feasible

## Suggested Milestones

### Milestone A: Stabilize Current Parsers

- **Completed**: Tighten CSV/XLSX type safety
- **Completed**: Ensure options behave consistently
- **Completed**: Add tests for detection, mapping, trim, maxRows, quoted CSV, multi-sheet XLSX, and sheet selection

### Milestone B: Build XLS Parser

- Implement BIFF8 core reader
- Extract sheets and cell values
- Match existing unified output shape

### Milestone C: Release Candidate

- Final docs
- Coverage threshold in CI
- Versioning and changelog
- Tag and publish `v1.0.0`

## Definition of Done for v1.0

- `csv`, `xlsx`, and `xls` all parse through same public API
- Same options behave consistently across formats
- CI passes on supported Node matrix
- Tests cover core and edge behavior
- README has quick-start + option reference + limits
- Package published under MIT with clean install path
