# MASTER-STORIES.MD

User stories for SpecFerret. Acceptance criteria map directly to the test suite.
This file contains both historical planning snapshots and implemented story records.
For current feature status, prefer the dedicated sprint story docs and README over archived roadmap headings.

---

## Sprint 1 — Core Engine (Complete)

These stories are built, tested, and committed.
62 tests green under `bun test`. `ferret lint` at 330.69ms wall clock.

---

### S01 — Project Initialisation

**As a** developer setting up SpecFerret for the first time,
**I want** a single command that scaffolds everything I need,
**so that** I can start tracking contracts in under a minute.

**Acceptance Criteria:**

- `ferret init` creates `.ferret/graph.db` silently (no prompt)
- `ferret init` creates `contracts/` directory if it does not exist
- `ferret init` writes `contracts/example.contract.md` with valid frontmatter template
- `ferret init` writes `ferret.config.json` with correct defaults (`specDir`, `filePattern`, `store`)
- `ferret init` writes `CLAUDE.md` with context.json instruction
- `ferret init` prompts (opt-in) to install pre-commit hook — defaults to no
- `ferret init` is idempotent — running it twice does not overwrite existing files
- All output goes to stdout. No output goes to stderr on clean run.

**Status:** ✓ Built. Tests: no dedicated automated init test file yet.

---

### S02 — Spec File Extraction

**As a** developer with spec files in `contracts/`,
**I want** SpecFerret to read the frontmatter and extract a typed contract,
**so that** the system knows what shape each contract promises.

**Acceptance Criteria:**

- Extracts `id`, `type`, `shape`, and `imports` from YAML frontmatter via gray-matter
- Returns `ExtractionResult` with correct `contracts[]` array
- `extractedBy` is always `'gray-matter'` in Sprint 1
- `fileType` is always `'spec'` in Sprint 1
- Files with no `ferret:` frontmatter block return `warning: 'no-frontmatter'` and empty contracts — they do not crash
- Files with a `ferret:` block missing required fields (`id`, `type`, `shape`) throw with the missing field name in the message
- Unsupported JSON Schema keywords (`$ref`, `allOf`, `anyOf`, etc.) print a warning to stderr and continue — they do not fail the scan
- Extraction is purely synchronous — no async, no await, no I/O inside the extractor
- Extractor never calls the store — it returns a value, nothing else

**Status:** ✓ Built. Tests: `src/extractor/frontmatter.test.ts`

---

### S03 — Deterministic Schema Hashing

**As a** developer who edits spec files,
**I want** SpecFerret to detect real shape changes and ignore formatting noise,
**so that** I don't get false positives from whitespace or property reordering.

**Acceptance Criteria:**

- Identical schemas always produce identical hashes regardless of property order
- Hash is SHA-256 of canonically serialised (key-sorted) JSON
- Hash output is a 64-character hex string
- Whitespace differences in YAML produce identical hashes
- Required array order differences produce identical hashes
- A genuine field change produces a different hash

**Status:** ✓ Built. Tests: `src/extractor/validator.test.ts`

---

### S04 — Breaking / Non-Breaking Classification

**As a** developer scanning a changed spec file,
**I want** SpecFerret to tell me whether my change is breaking or non-breaking,
**so that** I know whether downstream consumers are affected.

**Acceptance Criteria:**

**Breaking (exit 1 in CI, downstream flagged):**

- Required field removed
- Required field added
- Field type changed
- Enum value removed
- Property removed entirely
- Array items type changed

**Non-breaking (hash updated, no downstream flags):**

- Optional field added (present in `properties`, absent from `required`)
- Enum value added

**No-change (complete no-op):**

- Property order changed
- Required array order changed
- Whitespace differences

**Structural rules:**

- Classification is a pure function — no I/O, no side effects, no async
- Nested schemas (`response:`, `items:`) are compared recursively
- Non-breaking results from nested comparisons bubble up correctly
- `null` previous schema is treated as empty object

**Status:** ✓ Built. Tests: `src/extractor/validator.test.ts`

---

### S05 — Scan Command

**As a** developer who has edited a spec file,
**I want** to run `ferret scan` and see what changed,
**so that** the database reflects the current contract state.

**Acceptance Criteria:**

- `ferret scan` reads all `.md` files under `specDir` matching `filePattern`
- Scan prints only the final summary line: "N files scanned. N changed. N contracts updated."
- Changed contracts are compared against the stored `shape_schema` and classified
- Breaking changes print: `BREAKING <contractId> — <reason>`
- Non-breaking changes print: `NON-BREAKING <contractId> — <reason>`
- Unchanged files (hash match) are skipped — no output, no DB write
- `ferret scan --force` bypasses the file-hash gate and forces schema comparison regardless
- Files with no frontmatter print a warning to stderr and are skipped cleanly
- Breaking contracts are stored with `status: 'needs-review'`
- Non-breaking and unchanged contracts are stored with `status: 'stable'`
- After scan completes, `.ferret/context.json` is written automatically

**Status:** ✓ Built. Tests: behavior covered by `src/extractor/frontmatter.test.ts`, `src/extractor/validator.test.ts`, and `src/context/index.test.ts`.

---

### S06 — Context File Generation

**As an** AI coding tool (or developer) reading the project state,
**I want** a machine-readable contract graph written after every scan,
**so that** I always work from accurate contract state, not stale prose.

**Acceptance Criteria:**

- `.ferret/context.json` is written after every successful `ferret scan`
- Contains full node list, contract list, and dependency edges
- Format is stable JSON — no ANSI codes, no human-only formatting
- File is overwritten on each scan — not appended
- Writing context.json does not affect scan exit code

**Status:** ✓ Built. Tests: `src/context/index.test.ts`

---

### S07 — Lint Command

**As a** developer or CI pipeline,
**I want** to run `ferret lint` and get a clear pass/fail on drift,
**so that** breaking spec changes never ship unreviewed.

**Acceptance Criteria:**

- `ferret lint` runs scan first, then reconcile, then reports drift status
- Clean project (no drift): prints `✓ ferret  N contracts  0 drift  Xms` and exits 0
- Drifting project: prints drift summary and exits 1
- `ferret lint --ci` outputs JSON to stdout, zero ANSI codes, exits 1 if drift present
- JSON output shape: `{ version, consistent, breaking, nonBreaking, flagged, timestamp }`
- Performance gate: clean lint completes in under 500ms wall clock — this is a hard gate, not a target

**Status:** ✓ Built. Tests: no dedicated automated lint test file yet.

---

### S08 — SQLite Store

**As a** SpecFerret core engine,
**I want** a persistent, local store backed by SQLite,
**so that** contract state survives between scans without requiring a network.

**Acceptance Criteria:**

- Default store is SQLite at `.ferret/graph.db`
- Default SQLite implementation uses Bun's built-in `bun:sqlite` driver
- Store layer contains SQL only — no business logic, no graph traversal, ever
- `upsertNode`, `upsertContract`, `upsertDependency` are idempotent
- `getNodeByFilePath` returns null for unknown paths (not an error)
- `getContract` returns null for unknown ids (not an error)
- `getNodesByStatus` filters correctly by status value
- In-memory mode (`:memory:`) works for tests — no disk writes
- Store initialises schema on `init()` — safe to call multiple times (idempotent DDL)
- `shape_schema` column stores full JSON string of the contract shape

**Status:** ✓ Built. Tests: `src/store/sqlite.test.ts`

---

## Sprint 2 — Roadmap (Not Yet Built)

Do not build these in Sprint 1. They are listed here for scope clarity only.

| Story | Description                                                    |
| ----- | -------------------------------------------------------------- |
| S09   | Postgres store implementation and `FERRET_DATABASE_URL` wiring |
| S10   | SQLite → Postgres migration command                            |
| S11   | `ferret upgrade` command                                       |

---

## Sprint 3 — Historical Roadmap Snapshot

This section predates the later G4/G5 story breakdown. It should not be read as current status.
`ferret extract` is implemented and documented in `spec/SPRINT-3-STORIES.MD` under S28.

| Story | Description                                                           |
| ----- | --------------------------------------------------------------------- |
| S12   | Tree-sitter TypeScript shape extraction for code contracts            |
| S13   | `@ferret-contract` annotation scanning                                |
| S14   | Code-to-spec contract linking and upward BFS drift detection          |
| S15   | `ferret place` command                                                |
| S16   | `ferret status` command                                               |
| S17   | `ferret graph` command                                                |
| S18   | Full import integrity enforcement (unresolved, self-import, circular) |

---

## Sprint 4 — Roadmap (Not Yet Built)

| Story | Description                                                    |
| ----- | -------------------------------------------------------------- |
| S19   | `ferret audit` — bidirectional drift report                    |
| S20   | `ferret review` — interactive resolution flow                  |
| S21   | `ferret reconcile` — bulk reconciliation                       |
| S22   | Deleted contract lifecycle handling (soft delete, audit trail) |
| S23   | Extended lifecycle: roadmap status propagation through scan    |

---

## Sprint 5 — Branch-Matrix Dogfooding (Complete)

Sprint 5 branch-matrix validation is complete. Detailed acceptance criteria and evidence live in `spec/SPRINT-5-STORIES.MD`.

| Story | Description                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------- |
| S38   | Canonical scenario branch taxonomy across spec-kit and BMAD validation repositories            |
| S39   | Deterministic branch assertion matrix (exit code, drift class, review requirement)             |
| S40   | Transitive impact-depth scenario validation                                                    |
| S41   | Guided resolution scenario flow (`accept`, `update`, `reject`)                                 |
| S42   | Code-first extraction determinism scenario (`ferret extract`)                                  |
| S43   | Opinionated SpecFerret scenario branch set (layout + lint-first CI + enforcement defaults)     |
| S44   | Branch-matrix validation policy and runbook hardening                                          |
| S45   | Candidate release gate upgrade requiring matrix-green evidence in both validation repositories |

Detailed acceptance criteria: `spec/SPRINT-5-STORIES.MD`.

---

## Sprint 6 — GitHub Action Adoption (Complete)

| Story | Description                                                                      |
| ----- | -------------------------------------------------------------------------------- |
| S46   | Reusable GitHub Action for `ferret lint --ci` (`uses: BenGardiner123/action@v1`) |
| S47   | Stable Action outputs, workflow summary, and artifact linkage                    |
| S48   | Starter workflow templates for monorepo and single-package adoption              |
| S49   | Action release/version policy and compatibility strategy                         |

Detailed acceptance criteria: `spec/SPRINT-6-STORIES.MD`.

---

## Sprint 7 — Upward Code-to-Spec Drift (Complete)

| Story | Description                                                                        |
| ----- | ---------------------------------------------------------------------------------- |
| S50   | Deterministic code-shape snapshot baseline for annotated TypeScript                |
| S51   | Upward drift classifier for code -> spec mismatches                                |
| S52   | Lint/CI integration for upward drift diagnostics                                   |
| S53   | `ferret review` / `--json` support for code-origin drift resolution context        |
| S54   | Validation scenarios and release-gate evidence for bidirectional drift enforcement |

Detailed acceptance criteria: `spec/SPRINT-7-STORIES.MD`.

---

## Sprint 8 — TypeScript-Native Contract Format (Planned)

| Story | Description                                                                      |
| ----- | -------------------------------------------------------------------------------- |
| S55   | Contract type + defineContract helper + isContract type guard                    |
| S56   | TypeScript contract extractor (extractFromContractFile)                          |
| S57   | Wire .contract.ts into ferret scan file discovery and ferret.config.json         |
| S58   | Thread .contract.ts through upward-classifier, source: blocks, inferred IDs     |
| S59   | ferret status command                                                            |

Detailed acceptance criteria: `spec/SPRINT-8-STORIES.MD`.

---

## V3 — Sebastian's Vision (Not Yet Scoped)

| Item | Description                                                         |
| ---- | ------------------------------------------------------------------- |
| —    | Rust transpiler — built on the JSON Schema foundation from Sprint 1 |
| —    | Additional language grammars                                        |
| —    | Full JSON Schema support (`$ref`, `allOf`, composition)             |

Revisit when there are real users and real data. Not before.

---

_© Laser Unicorn — MIT License_
