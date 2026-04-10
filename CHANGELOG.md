# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.2.0] - 2026-04-14

### Added (Sprint 7 — Bidirectional Drift Enforcement, G9)

- **Upward drift detection** (`code → spec`): `ferret lint` and `ferret lint --ci` now detect when an annotated TypeScript implementation diverges from its declared contract.
  - Breaking upward drift (required field removed, type changed, etc.) exits 1 and blocks CI.
  - Non-breaking upward drift (optional field added, enum extended) is surfaced but non-blocking by default.
  - Human output labels: `BREAKING (code)` and `NON-BREAKING (code)` alongside existing spec-direction diagnostics.
- **`ferret lint --ci` JSON** now includes `upwardDrift: UpwardDriftResult[]` array with `contractId`, `driftClass`, `sourceFile`, `sourceSymbol`, and `reason`.
- **`ferret review`** presents upward drift context in terminal output: `UPWARD DRIFT (code → spec)` section with source symbol, mismatch reason, and resolution options.
- **`ferret review --json`** includes `upwardDrift: UpwardDriftReviewItem[]` with `resolutionOptions` array distinguishing `spec-update` vs `code-rollback` intent.
- **`classifyUpwardDrift`** exported from `@specferret/core` — pure function, no I/O.
- **`source:` frontmatter block** in `.contract.md` files links a contract to its TypeScript source file and symbol.
  - Schema: `ferret.source.file` (relative path) and `ferret.source.symbol` (TypeScript symbol name).
  - Populated automatically by `ferret extract`.
- **SQLite migration**: `code_source_file` and `code_source_symbol` columns added to `ferret_contracts` table.
- **Validation template updates**: `src/auth/jwt.ts`, `contracts/auth/jwt-payload.contract.md`, and three upward drift scenario branches added to both validation repo templates (bmad and spec-kit).
- **Scenario assertion scripts** updated to validate `upwardDrift` in CI JSON payloads.
- **Required validation branch matrix** extended to 11 branches (added `scenario/upward-breaking-signature-change`, `scenario/upward-nonbreaking-optional-add`, `scenario/upward-review-resolution-flow`).

### Changed

- `ferret lint --ci` `consistent` field now accounts for upward drift (`consistent: false` when upward drift is present even with no spec-direction drift).
- Exit code on clean + perf-exceeded path preserved as 1 (no behavior change).

## [0.1.4] - 2026-04-09

### Added

- `ferret init` now scaffolds canonical agent rules for Claude, Copilot, and Gemini via `--agent-targets`.
  - Writes `.github/specferret/canonical-agent-rules.md` and `.github/instructions/specferret-agent.instructions.md`.
  - Use `--no-agent-rules` to skip.
- Tree-sitter TypeScript extraction is now the default code-first path — no `@ferret-contract` annotations required.
  - Deterministic TS-to-contract id mapping with inferred contract id collision detection.
  - `ferret extract` summary includes `inferred=<n>` and `annotated=<n>` counts.
  - Golden fixture test coverage for generics, unions, intersections, optional-nested, and unsupported-syntax patterns.
- Context schema versioning (`contextSchemaVersion`) in `.ferret/context.json` with automatic baseline migration.
- `ferret diagnostics` command for import graph diagnostics.
- `--perf-budget-ms` flag on both `ferret lint` and `ferret extract`.
- `ferret lint --ci` now emits `diagnosticsSchemaVersion` in the machine JSON payload.
- `ferret review --json` now emits `diagnosticsSchemaVersion` in the machine JSON payload.

### Changed

- Align contract type semantics across runtime and docs: `ferret.type` now uses a strict six-type model (`api`, `table`, `type`, `event`, `flow`, `config`) in both extractor behavior and documentation.
- Document migration guidance for legacy frontmatter type values such as `schema`, `service`, and `model`.
- Breaking/non-breaking classification is now based on trigger severity rather than graph depth.
- Perf budget flag parsing deduplicated and hardened — silent skip on drift+budget-exceeded path fixed.
- `ferret review` `recommendedAction` aligned with `suggestedActions`, duplicate classification logic removed.
- `ferret scan` and `ferret lint` fail-fast diagnostics hardened.
- Copilot adapter output format and managed-file detection corrected in `ferret init`.
- `init` output ordering stabilized.

### Notes

- If a contract does not fit a core type, select the closest core type and open an issue to propose expansion of the core type set.
- Mixed annotation and inferred extraction is fully supported; remove `@ferret-contract` annotations incrementally once inferred ids/types are confirmed stable.
