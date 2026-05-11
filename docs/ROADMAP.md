# SheetBridge Development Roadmap

## Current Status

- Core package/tooling: Done
- Unified parser API (`parseFile`, `parseFileFlat`): Done
- CSV support: Done
- XLSX support: Done
- XLS support (BIFF8 v1 scope): Implemented and tested

## Remaining for v1.0

### 1) Documentation finalization

- Keep README and architecture docs aligned with shipped behavior.
- Keep XLS feature boundaries and unsupported behavior explicit in public docs.

### 2) Feature manifest for release docs

- Document shipped XLS feature coverage and parser boundaries.
- Include record coverage, option behavior, and failure semantics.

### 3) Release validation checklist

- Provide one command or scripted sequence that validates:
  - type-check
  - unit/integration tests
  - browser tests
  - build
- Confirm CI stability for Node 20 and browser jobs.

### 4) Publish preparation

- Changelog entries for XLS introduction scope and caveats.
- Version bump and release notes.
- Final package sanity check (dist files/types/exports).

## Recommended After v1.0 (v1.x)

1. Typed public error model.

- Standardize parser-facing error codes for invalid format, malformed binary, unsupported feature, bounds violations.

2. Sheet metadata enhancements.

- Include optional metadata per sheet (row/column counts, parse warnings, inferred formats).

3. Performance guardrails.

- Add explicit limits and documented behavior for very large workbooks and shared string tables.

## Post v1.0

1. Web Worker helper for non-blocking browser parsing.
2. Optional schema validation/transformation hook.
3. Optional streaming/chunk adapters where feasible.

## Definition of Done for v1.0

- [x] CSV, XLSX, and XLS parse through the same public API.
- [x] Option behavior is documented and aligned across formats within v1 scope.
- [x] Tests cover core + hostile parsing paths (Node + browser coverage present).
- [x] README includes quick start, option examples, and compact options reference.
- [ ] CI passes on supported Node/browser matrix with release-gate confidence.
- [ ] Changelog, version bump, and release notes are finalized.
- [ ] Package is published with clean install/build path.

## Notes

- XLS parser data flow is maintained in `docs/ARCHITECTURE.md`.
- XLS v1 scope/limits and security guardrails are maintained in `README.md`.
