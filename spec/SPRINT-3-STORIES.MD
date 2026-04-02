# SPRINT-3-STORIES.MD

Engineering stories for SpecFerret Sprint 3 (GA blockers tranche 2).
Acceptance criteria map directly to implementation tests.
This sprint targets G4-G5 from ROADMAP.MD.

---

## Status: In Progress

Goal: eliminate manual contract bootstrap friction and harden graph reliability.
Gate target: G4, G5.

---

### S28 — `ferret extract` Deterministic Bootstrap

**As a** developer with annotated TypeScript source,
**I want** SpecFerret to scaffold contract files deterministically,
**so that** I can bootstrap contract coverage without hand-writing every schema.

**Acceptance Criteria:**

- `ferret extract` reads TypeScript files with `@ferret-contract` annotations
- Extraction is deterministic (same input -> byte-identical contract output)
- Generated files use `.contract.md` extension and valid `ferret:` frontmatter
- Generated frontmatter includes `id`, `type`, and `shape`
- Extracted shape supports API request/response and object/array structures
- Command exits non-zero when extraction fails for any annotated symbol
- Command prints per-file/per-symbol diagnostics

**Implementation Notes:**

- Use Tree-sitter TypeScript (native binding) for shape extraction
- Keep command non-LLM and offline
- Preserve existing manual authoring path; extract is additive

**Test Plan:**

- Fixture-based integration tests for annotated TS inputs
- Determinism test: run extract twice and compare output hashes
- Error path tests for malformed annotations and unsupported symbols

**Candidate Test Files:**

- `packages/cli/bin/commands/extract.test.ts` (new)
- `packages/core/src/extractor/typescript.test.ts` (new)

**Status:** ✓ Complete
**Implemented Files:**

- `packages/cli/bin/commands/extract.ts`
- `packages/cli/bin/commands/extract.test.ts`
- `packages/cli/bin/ferret.ts`
- `packages/core/src/extractor/typescript.ts`
- `packages/core/src/extractor/typescript.test.ts`
- `packages/core/src/index.ts`
- `README.md`

---

### S29 — Extraction Guardrails and Canonical Output

**As a** developer reviewing generated contracts,
**I want** stable IDs, path mapping, and schema normalization,
**so that** generated contracts are predictable and reviewable.

**Acceptance Criteria:**

- Contract IDs are stable across repeated extractions
- File path mapping is deterministic and documented (`id` -> file path)
- JSON Schema keys are normalized into canonical ordering
- Existing generated files are updated in place without duplicate contract files
- Invalid annotations fail with actionable diagnostics (file, line, symbol, reason)
- Output includes a summary: created, updated, skipped, failed

**Implementation Notes:**

- Canonical ordering must align with existing `hashSchema` behavior
- Guardrail errors should be copy-paste actionable (clear fix steps)

**Test Plan:**

- Golden-file output tests
- Path-collision tests
- Invalid annotation test matrix

**Candidate Test Files:**

- `packages/cli/bin/commands/extract.test.ts` (new sections)
- `packages/core/src/extractor/typescript.guardrails.test.ts` (new)

**Status:** ✓ Complete
**Implemented Files:**

- `packages/cli/bin/commands/extract.ts`
- `packages/cli/bin/commands/extract.test.ts`

---

### S30 — Import Integrity Enforcement

**As a** developer relying on drift propagation,
**I want** lint to enforce import integrity,
**so that** graph traversal is trustworthy before merge.

**Acceptance Criteria:**

- `ferret lint` fails on unresolved imports
- `ferret lint` fails on self-imports
- `ferret lint` fails on circular imports
- Diagnostics include contract ID, source file, and violating import path
- Exit behavior is consistent in local lint and `--ci`
- Error output remains concise and machine-readable in CI mode

**Implementation Notes:**

- This promotes current roadmap behavior from warning-level to enforceable policy
- Maintain clear distinction between parse errors and graph integrity errors

**Test Plan:**

- Graph fixtures: unresolved, self, simple cycle, multi-node cycle
- CI JSON output checks for integrity failures

**Candidate Test Files:**

- `packages/core/src/reconciler/index.test.ts` (new)
- `packages/cli/bin/commands/lint.test.ts` (new sections)

**Status:** ✓ Complete
**Implemented Files:**

- `packages/cli/bin/commands/lint.ts`
- `packages/cli/bin/commands/lint.test.ts`
- `packages/cli/bin/commands/scan.ts`
- `packages/core/src/reconciler/index.ts`
- `packages/core/src/reconciler/index.test.ts`
- `packages/core/src/store/sqlite.ts`
- `packages/core/src/store/sqlite.test.ts`
- `packages/core/src/store/types.ts`

---

### S31 — Import Suggestion Assist (Non-Blocking)

**As a** developer creating contracts,
**I want** non-blocking import suggestions,
**so that** I can discover likely missing dependencies before drift escapes.

**Acceptance Criteria:**

- Lint emits warning-level suggestions when likely imports are missing
- Suggestions never fail lint by themselves
- Suggestions include confidence and evidence (e.g., referenced contract ID or shape relation)
- Suggestion output is suppressed in strict CI mode unless explicitly requested
- Developers can disable suggestions via config

**Implementation Notes:**

- Keep this assistive: suggestions augment S30 but do not replace enforcement
- Avoid noisy heuristics; precision over recall

**Test Plan:**

- Suggestion fixture tests for true-positive and false-positive control
- Config toggle tests

**Candidate Test Files:**

- `packages/core/src/reconciler/import-suggestions.test.ts` (new)
- `packages/cli/bin/commands/lint.test.ts` (new sections)

**Status:** ✓ Complete
**Implemented Files:**

- `packages/core/src/reconciler/import-suggestions.ts`
- `packages/core/src/reconciler/import-suggestions.test.ts`
- `packages/core/src/reconciler/index.ts`
- `packages/core/src/config.ts`
- `packages/core/src/index.ts`
- `packages/cli/bin/commands/lint.ts`
- `packages/cli/bin/commands/lint.test.ts`
- `packages/cli/bin/commands/init.ts`

---

### Sprint Exit Criteria

1. S28-S31 acceptance criteria all pass.
2. Demo repo with 3 annotated contracts can be bootstrapped via `ferret extract` in under 10 minutes.
3. Import integrity failures block commit/CI with actionable diagnostics.
4. `bun test` green.
5. Documentation updated in same PR set:
   - `README.md`
   - `spec/ROADMAP.MD`
   - `spec/GA-VALIDATION-REPOS.MD`
   - `spec/GA-VALIDATION-RUNBOOK.MD`
   - `spec/DOCUMENTATION-INDEX.MD`

---

_© Laser Unicorn — MIT License_
