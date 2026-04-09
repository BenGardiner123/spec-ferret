# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
