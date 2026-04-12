# SpecFerret — Sprint 1 Implementation Plan

Generated: March 2026
Status: Sprint 1 complete.
See ROADMAP.MD for Sprint 2 and beyond. See SPRINT-1-STORIES.MD for engineering stories.

Runtime: Bun 1.0+
Test runner: `bun test`
Install: `bun install -g @specferret/cli`

---

## Technology Decisions — Final

Boris and Todd approved. Not open for reconsideration.

| Job                      | Tool                             | Reason                                                               |
| ------------------------ | -------------------------------- | -------------------------------------------------------------------- |
| Runtime                  | Bun 1.0+                         | Performance, native SQLite, TypeScript native, Claude Code alignment |
| Spec frontmatter parsing | `gray-matter`                    | Synchronous, proven, zero deps, no WASM, no build step               |
| JSON Schema validation   | `ajv` + `ajv-formats`            | Proven. 50M weekly downloads.                                        |
| Schema hashing           | `node:crypto` SHA-256            | Built-in, deterministic, fast                                        |
| Storage — default        | `bun:sqlite`                     | Built-in to Bun, synchronous, zero deps                              |
| Storage — roadmap        | Postgres via `DBStore` interface | Sprint 2                                                             |
| Annotation detection     | Regex                            | Sprint 3. Predictable pattern. No parser needed.                     |
| Code shape extraction    | Tree-sitter TypeScript           | Sprint 3. The one job needing a real AST parser.                     |
| Test runner              | `bun test`                       | Native to runtime, fast, no config                                   |

**SpecFerret is a CLI. It runs natively on Bun. Never use the WASM build of Tree-sitter — that is for browsers. Use the native binding in Sprint 3.**
**No LLM in the default path. Ever.**

---

## Monorepo Structure

```
packages/
  core/                        @specferret/core
    src/
      store/                   DBStore interface, bun:sqlite, Postgres stub, factory
      extractor/               frontmatter.ts, validator.ts, hash.ts
      reconciler/              BFS engine
      context/                 context.json writer
      config.ts
      index.ts
    package.json
    tsconfig.json
    tsconfig.build.json
  cli/                         @specferret/cli
    bin/
      commands/                init.ts, scan.ts, lint.ts
      ferret.ts
    package.json
    tsconfig.json
    tsconfig.build.json
package.json                   workspace root
bun.lock
README.md
LICENSE
.github/
  workflows/
    ci.yml
    publish.yml
```

---

## Sprint 1 — Complete

All tasks built, tested, and committed.
62 tests passing. `ferret lint` at 11ms wall clock on a clean project.
Performance gate cleared. npm publish pipeline in place.

---

### Task 1 — Store Layer ✓

`packages/core/src/store/types.ts` — `FerretContract` interface with `shape_schema` field.
`packages/core/src/store/sqlite.ts` — `bun:sqlite` implementation, `shape_schema` column, migration.
`packages/core/src/store/factory.ts` — returns correct store based on environment.
`packages/core/src/store/postgres.ts` — Sprint 2 stub. Throws on any call.

**Key interface:**

```typescript
export interface FerretContract {
  id: string;
  node_id: string;
  shape_hash: string; // SHA-256 of key-sorted schema — quick diff
  shape_schema: string; // JSON.stringify of schema object — comparison
  type: string;
  status: ContractStatus;
}
```

**SQLite schema:**

```sql
CREATE TABLE IF NOT EXISTS ferret_contracts (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  shape_hash TEXT NOT NULL,
  shape_schema TEXT NOT NULL DEFAULT '{}',
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES ferret_nodes(id)
);
```

Tests: `packages/core/src/store/sqlite.test.ts`

---

### Task 2 — Validator ✓

`packages/core/src/extractor/validator.ts`

Pure function. No I/O. No side effects. Ever.

- `validateFerretSchema(shape, filePath)` — warns on unsupported keywords, never throws
- `compareSchemas(previous, current)` — returns `breaking | non-breaking | no-change` with reason
- Nested schemas (`response:`, `items:`) compared recursively
- Non-breaking results bubble up correctly from nested comparisons
- Property order changes are no-ops — keys sorted before comparison

Tests: `packages/core/src/extractor/validator.test.ts`

---

### Task 3 — Frontmatter Extractor ✓

`packages/core/src/extractor/frontmatter.ts`

Synchronous only. No async. No await. Anywhere in this file.

- Extracts `id`, `type`, `shape`, `imports` from YAML frontmatter via `gray-matter`
- No frontmatter → returns `warning: 'no-frontmatter'`, empty contracts, does not throw
- Missing required field → throws with field name(s) in message
- Unsupported schema keyword → warns to stderr, continues
- Returns `ExtractionResult` — same interface as Tree-sitter will return in Sprint 3
- Extractor never calls the store

`packages/core/src/extractor/hash.ts` — `hashSchema(schema)` — SHA-256 of key-sorted JSON.

Tests: `packages/core/src/extractor/frontmatter.test.ts`

---

### Task 4 — Config ✓

`packages/core/src/config.ts`

```typescript
export interface FerretConfig {
  specDir: string;
  filePattern: string;
  includes?: string[];
  store: 'sqlite' | 'postgres';
  codeContracts?: {
    include: string[];
    watchNodes?: string[];
  };
}

export const DEFAULT_CONFIG: FerretConfig = {
  specDir: 'contracts/',
  filePattern: '**/*.contract.md',
  includes: ['**/*.contract.md'],
  store: 'sqlite',
};
```

---

### Task 5 — Context Writer ✓

`packages/core/src/context/index.ts`

Auto-generates `.ferret/context.json` at the end of every `ferret scan`.
No separate command. Silent. If write fails, logs to stderr and continues.

```typescript
export interface FerretContext {
  version: '2.0';
  generated: string; // ISO timestamp
  contracts: ContextContract[];
  edges: ContextEdge[];
  needsReview: string[]; // contract IDs currently flagged
}
```

Tests: `packages/core/src/context/index.test.ts`

---

### Task 6 — ferret init ✓

`packages/cli/bin/commands/init.ts`

- Creates `.ferret/graph.db` silently — no prompt
- Creates `contracts/` directory
- Writes `contracts/example.contract.md` with valid frontmatter template
- Writes `ferret.config.json` with correct defaults
- Writes `CLAUDE.md` with `context.json` instruction
- Pre-commit hook prompt — opt-in, defaults to no
- Idempotent — running twice does not overwrite existing files

---

### Task 7 — ferret scan ✓

`packages/cli/bin/commands/scan.ts`

- Reads all `.md` files under `specDir` matching `filePattern`
- Skips files with unchanged hash (no `--force`)
- `--force` bypasses file-hash gate, forces schema comparison
- Classifies changes: `breaking | non-breaking | no-change`
- Prints `BREAKING` or `NON-BREAKING` lines for changed contracts
- Files with no frontmatter print warning to stderr and are skipped cleanly
- Writes `.ferret/context.json` automatically after every scan

---

### Task 8 — ferret lint ✓

`packages/cli/bin/commands/lint.ts`

- Runs scan, then reconcile, then reports drift status
- Clean project: `✓ ferret  N contracts  0 drift  Xms` — exits 0
- Drifting project: drift tree output — exits 1
- `--ci`: JSON to stdout, zero ANSI codes, exits 1 on drift
- Performance gate: under 500ms on clean project. Hard gate, not a target.

**CI JSON output shape:**

```json
{
  "version": "2.0",
  "consistent": true,
  "breaking": 0,
  "nonBreaking": 0,
  "flagged": [],
  "timestamp": "2026-03-01T00:00:00.000Z"
}
```

---

### Task 9 — Public API ✓

`packages/core/src/index.ts`

```typescript
export * from './extractor/frontmatter.js';
export * from './extractor/validator.js';
export * from './extractor/hash.js';
export * from './context/index.js';
export * from './store/types.js';
export * from './store/sqlite.js';
export * from './store/factory.js';
export * from './reconciler/index.js';
export * from './config.js';
export * from './utils/paths.js';
```

---

## Verification — All 8 Steps Passed

```
1. bun test
   ✓ 62 tests passing across all layers

2. ferret init in a fresh directory
   ✓ contracts/example.contract.md created with correct frontmatter
   ✓ ferret.config.json created
   ✓ CLAUDE.md created
   ✓ .ferret/graph.db created silently

3. ferret scan on contracts/example.contract.md
   ✓ Extracts contracts correctly via gray-matter
   ✓ .ferret/context.json written automatically

4. Edit contracts/example.contract.md — remove a required field
   ✓ ferret scan classifies as breaking
   ✓ BREAKING printed to stdout

5. Edit contracts/example.contract.md — add an optional field
   ✓ ferret scan classifies as non-breaking
   ✓ NON-BREAKING printed to stdout

6. ferret lint — clean project
   ✓ exits 0
   ✓ ✓ ferret  N contracts  0 drift  11ms
   ✓ Under 500ms gate

7. ferret scan — file with no frontmatter
   ✓ Warning to stderr
   ✓ Scan completes, exits 0
   ✓ Does not crash

8. ferret lint --ci — with breaking drift
   ✓ exits 1
   ✓ JSON to stdout
   ✓ Zero ANSI codes
```

---

## Sprint 2 — Roadmap

Do not build these in Sprint 1.

| Task | Description                                                                                 |
| ---- | ------------------------------------------------------------------------------------------- |
| S09  | Postgres store implementation — `FERRET_DATABASE_URL` wiring                                |
| S10  | SQLite → Postgres migration                                                                 |
| S11  | `ferret upgrade` command                                                                    |
| S12  | `ferret watch` — watch `contracts/**/*.contract.md` and auto-run scan + reconcile on change |

---

## Sprint 3 — Historical Roadmap Snapshot

This section is an archived planning snapshot. Current implementation status for Sprint 3 bootstrap work lives in the G4/G5 execution breakdown below and in `spec/SPRINT-3-STORIES.MD`.
`ferret extract` is implemented and tracked there as complete.

| Task | Description                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------- |
| S13  | Tree-sitter TypeScript shape extraction                                                               |
| S14  | `@ferret-contract` annotation scanning via regex                                                      |
| S15  | Code-to-spec contract linking, upward BFS drift detection                                             |
| S16  | `ferret place` command                                                                                |
| S17  | `ferret status` command                                                                               |
| S18  | `ferret graph` command                                                                                |
| S19  | `ferret extract` — deterministic extraction of contract shapes from annotated TypeScript source files |
| S20  | Full import integrity enforcement (unresolved, self-import, circular)                                 |

---

## Sprint 4 — Roadmap

| Task | Description                                    |
| ---- | ---------------------------------------------- |
| S21  | `ferret audit` — bidirectional drift report    |
| S22  | `ferret review` — interactive resolution flow  |
| S23  | Deleted contract lifecycle handling            |
| S24  | Extended lifecycle: roadmap status propagation |

---

## Sprint 6 — Adoption Distribution (Complete)

| Task | Description                                                                 |
| ---- | --------------------------------------------------------------------------- |
| S46  | Publish reusable GitHub Action wrapper for `ferret lint --ci`               |
| S47  | Add Action outputs for PR annotations, summary markdown, and artifact links |
| S48  | Add copy-paste starter workflows for common repo layouts                    |
| S49  | Define Action release/version policy (`v1`, breaking-change strategy)       |

---

## Sprint 7 — Upward Code-to-Spec Drift (Complete)

| Task | Description                                                                            |
| ---- | -------------------------------------------------------------------------------------- |
| S50  | Build code-shape snapshot extraction for annotated TypeScript as drift baseline        |
| S51  | Implement upward drift detector (code change -> spec mismatch) with deterministic diff |
| S52  | Integrate upward drift checks into `ferret lint` and `ferret lint --ci` diagnostics    |
| S53  | Extend `ferret review` / `--json` resolution context for code-origin drift events      |
| S54  | Add validation scenarios and release evidence for upward drift coverage                |

---

## Sprint 8 — TypeScript-Native Contract Format (Planned)

Target: v0.3.0

| Task | Description                                                                          |
| ---- | ------------------------------------------------------------------------------------ |
| S55  | Contract type + defineContract helper + isContract type guard                        |
| S56  | TypeScript contract extractor (extractFromContractFile)                              |
| S57  | Wire .contract.ts into ferret scan file discovery and ferret.config.json             |
| S58  | Thread .contract.ts through upward-classifier, source: blocks, and inferred IDs      |
| S59  | ferret status command                                                                |

Detailed acceptance criteria: `spec/SPRINT-8-STORIES.MD`.

---

## GA Release Gate — Blockers

SpecFerret does not ship GA until every gate below is complete and verified.
Validation repository execution details live in `spec/GA-VALIDATION-REPOS.MD`.

| Gate | Requirement                               | Acceptance Criteria                                                                                                                                                                |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1   | Zero-manual enforcement setup             | `ferret init` installs commit enforcement by default (opt-out only). Fresh repo: contract-breaking change is blocked on first commit with no extra setup commands.                 |
| G2   | Lint-first daily UX                       | Public docs and CLI help position `ferret lint` as the default developer command. `ferret scan` is documented as advanced/manual only.                                             |
| G3   | CI baseline correctness                   | `ferret lint --ci` cannot false-pass due to missing local state. CI path is deterministic via explicit baseline strategy (committed context or rebuild mode) and documented setup. |
| G4   | Seamless contract bootstrap               | First-party `ferret extract` supports deterministic contract scaffolding from annotated TypeScript shapes. Team can bootstrap first 3 real contracts in under 10 minutes.          |
| G5   | Dependency graph reliability              | Missing/invalid imports are surfaced before merge via lint checks and clear diagnostics. Contract graph gaps are visible to developers before commit.                              |
| G6   | Guided drift resolution                   | `ferret review` provides a guided resolution flow (accept/update/reject path), not just manual file editing instructions.                                                          |
| G7   | External workflow proof (spec-kit + BMAD) | Two dedicated validation repositories (one spec-kit, one BMAD) run the same GA smoke flow and pass in CI. No GA without both green.                                                |

### Current Gate Status (as of 2026-04-04)

- G7 is currently **met** for the tested candidate.
- spec-kit evidence: https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/23962649755
- BMAD evidence: https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/23962652352
- Candidate execution note: validation used pinned repo-local bundle (`vendor/ferret.bundle.js`) during matrix execution; release artifacts are now published as `@specferret/cli@0.1.2` and `@specferret/core@0.1.2`.

### GA Verification Checklist

1. New repository setup completed by a developer with no SpecFerret experience in under 30 minutes.
2. First breaking drift is blocked at commit with no additional tooling setup beyond `ferret init`.
3. CI fails on real drift and passes on no-drift across two clean runners.
4. Two-person trial (feature author + reviewer) resolves a drift event using `ferret review` with no external help.
5. End-to-end smoke path is documented and repeatable: `ferret init` -> create contract -> `ferret lint` -> breaking change -> blocked commit -> resolution -> green CI.
6. Spec-kit validation repository passes the GA smoke flow and publishes CI artifacts.
7. BMAD validation repository passes the GA smoke flow and publishes CI artifacts.
8. Validation repos are rerun against the candidate GA tag before release announcement.

### Release Decision Rule

If any gate G1-G7 is not met, release remains pre-GA.

### Post-GA Growth Gates

These gates are for post-GA adoption and product-scope expansion.

| Gate | Requirement                     | Acceptance Criteria                                                                                               |
| ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| G8   | One-line CI adoption            | Teams can enable drift enforcement via reusable GitHub Action without custom shell orchestration.                 |
| G9   | Bidirectional drift enforcement | SpecFerret detects both spec-to-downstream drift and code-to-spec drift with deterministic classification and UX. |

---

## GA Execution Breakdown (S25+)

This is the implementation plan for G1-G7. Stories are ordered by dependency.

### Sprint 2.5 — Enforcement + DX Baseline

| Story | Gate | Scope                                                                                     | Deliverable                                     | Acceptance Test                                                                           |
| ----- | ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| S25   | G1   | `ferret init` installs commit hook by default, opt-out flag (`--no-hook`) still supported | New init behavior + tests                       | Fresh repo: `ferret init` -> breaking contract edit -> commit blocked without extra setup |
| S26   | G2   | CLI messaging and docs become lint-first (`scan` labeled advanced/manual)                 | Updated help text + docs pass                   | New user follows README without using `scan` and catches drift with `lint` only           |
| S27   | G3   | CI baseline mode (explicit strategy) with deterministic behavior                          | `--ci` baseline policy implemented + documented | Two clean CI runners produce identical pass/fail results on same commit                   |

### Sprint 3 — Bootstrap + Graph Reliability

| Story | Gate | Scope                                                                                        | Deliverable                            | Acceptance Test                                                                                   |
| ----- | ---- | -------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| S28   | G4   | `ferret extract` deterministic extraction from annotated TypeScript (`@ferret-contract`)     | Working CLI command + fixture suite    | Repo with 3 annotated shapes -> 3 valid `.contract.md` files generated in <10 min workflow        |
| S29   | G4   | Contract file generation quality guardrails (stable IDs, path mapping, schema normalization) | Extraction validation + error messages | Invalid annotations fail with actionable diagnostics; valid annotations generate canonical output |
| S30   | G5   | Import integrity lint checks (missing, self-import, unresolved, circular)                    | Lint diagnostics + exit behavior       | Broken import graph fails `ferret lint` pre-commit and in CI with precise file/ID references      |
| S31   | G5   | Import suggestion assist (non-blocking hints from known graph neighbors)                     | Warning hints in lint output           | Developer sees suggested import IDs when dependency appears likely but undeclared                 |

### Sprint 4 — Resolution UX + GA Hardening

| Story | Gate  | Scope                                                                                 | Deliverable                                              | Acceptance Test                                                         |
| ----- | ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| S32   | G6    | Guided `ferret review` flow (accept/update/reject) with structured copy-paste context | Interactive review command + AI-friendly terminal output | Two-person trial resolves a drift event without opening docs            |
| S33   | G6    | Non-interactive review mode for CI/dev scripts                                        | `ferret review --json` and structured output             | Tooling can consume resolution options programmatically                 |
| S34   | G1-G6 | End-to-end GA smoke harness (`init` -> lint -> break -> block -> review -> green CI)  | Automated smoke test workflow                            | Smoke pipeline passes on main and fails on intentional drift seed       |
| S35   | G1-G6 | Docs and onboarding hardening (single 30-min quickstart path)                         | Consolidated quickstart + troubleshooting                | New developer completes setup + first blocked drift in under 30 minutes |
| S36   | G7    | Build spec-kit validation repository and CI harness                                   | Public/paired test repo + workflow + evidence log        | Spec-kit repo green on full smoke flow and drift-block scenario         |
| S37   | G7    | Build BMAD validation repository and CI harness                                       | Public/paired test repo + workflow + evidence log        | BMAD repo green on full smoke flow and drift-block scenario             |

### Sprint 5 — Branch-Matrix Dogfooding (Coverage Expansion)

Goal: formalize branch-based scenario coverage across existing validation repositories (spec-kit + BMAD) plus one opinionated SpecFerret scenario track.

| Story | Gate | Scope                                                                                            | Deliverable                                                | Acceptance Test                                                                                 |
| ----- | ---- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| S38   | G7   | Define canonical scenario branch taxonomy shared by both validation repositories                 | Branch policy + required scenario manifest                 | Both repos expose the same branch families and expected outcomes                                |
| S39   | G7   | Add deterministic assertion matrix per branch (exit code, drift class, review requirement)       | Branch assertion matrix + CI checks                        | CI fails if actual branch behavior diverges from expected branch outcomes                       |
| S40   | G7   | Add transitive impact-depth validation scenario                                                  | Scenario fixtures + depth-aware assertions                 | Drift reports include direct and depth-2+ downstream context on transitive scenario branches    |
| S41   | G7   | Add guided-resolution scenario branch covering accept/update/reject                              | Scenario/review-resolution-flow branch + evidence template | Branch proves block -> review action -> expected post-action state                              |
| S42   | G7   | Add code-first extraction scenario branch for annotated TypeScript bootstrap                     | Scenario/code-first-extract branch + determinism checks    | Running `ferret extract` twice on same commit yields byte-identical contract output             |
| S43   | G7   | Add opinionated SpecFerret scenario branches for layout, lint-first CI, and enforcement defaults | Scenario/specferret-opinionated-\* branch set              | Opinionated branches prove default workflow policy and guardrail behavior                       |
| S44   | G7   | Update validation policy and runbook for branch-matrix operation, triage, and evidence capture   | Updated GA validation docs                                 | Maintainer can execute full branch matrix with no interpretation and collect complete artifacts |
| S45   | G7   | Add release-readiness gate for matrix-green evidence on both repos for the same candidate tag    | Candidate release checklist update                         | Candidate is blocked if any required scenario branch is red in either validation repository     |

### Sprint 6 — GitHub Action Adoption (Post-GA)

Goal: remove CI adoption friction to one line (`uses: BenGardiner123/action@v1`) while preserving deterministic drift enforcement.

Sprint 6 status: Complete.

| Story | Gate | Scope                                                                      | Deliverable                                         | Acceptance Test                                                                                  |
| ----- | ---- | -------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| S46   | G8   | Publish reusable GitHub Action for `ferret lint --ci`                      | `BenGardiner123/action` v1 with usage docs          | Fresh repo workflow uses Action with no custom shell script and receives pass/fail drift outcome |
| S47   | G8   | Add machine- and human-friendly Action outputs                             | PR summary + JSON artifact + stable output contract | Action run exposes consistent output fields and links artifacts in workflow summary              |
| S48   | G8   | Publish starter workflow templates for monorepo and single-package layouts | Copy-paste workflow snippets + docs                 | New maintainer can enable CI drift checks in under 10 minutes                                    |
| S49   | G8   | Define Action release/versioning policy and support window                 | Versioning policy doc + release checklist           | `v1` consumers get non-breaking updates; breaking changes require explicit major tag rollout     |

### Sprint 7 — Upward Code-to-Spec Drift (v0.2.0)

Goal: detect and explain mismatches when implementation code changes but contract files are not updated.

Required Sprint 7 validation branches (both validation repositories):

- `main`
- `scenario/upward-breaking-signature-change`
- `scenario/upward-nonbreaking-optional-add`
- `scenario/upward-review-resolution-flow`

Sprint 7 closeout rule:

- candidate closeout is blocked if any required Sprint 7 branch is missing or red in either validation repository.

| Story | Gate | Scope                                                                                | Deliverable                                        | Acceptance Test                                                                                        |
| ----- | ---- | ------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| S50   | G9   | Deterministic code-shape baseline from annotated TypeScript                          | Code-shape snapshot model + fixtures               | Same commit produces byte-identical code snapshot hashes                                               |
| S51   | G9   | Upward drift classifier (code -> spec mismatch)                                      | Diff engine + breaking/non-breaking classification | Code-only breaking change without spec update is flagged reliably                                      |
| S52   | G9   | Lint integration for upward drift diagnostics                                        | `ferret lint` / `--ci` output extensions           | CI fails with explicit code-origin drift context and impacted contract IDs                             |
| S53   | G9   | Guided resolution support for upward drift                                           | `ferret review` and `ferret review --json` updates | Review payload provides actionable options for code-origin drift remediation                           |
| S54   | G9   | Validation matrix additions and release evidence for bidirectional drift enforcement | External validation scenarios + evidence links     | Candidate release blocked when any required Sprint 7 validation branch fails in either validation repo |

Sprint 7 status: Complete. (v0.2.0, G9 — shipped 2026-04-12)

Evidence:

- spec-kit: https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/24218834579
- BMAD: https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/24218835475

### Ownership and Sequencing Notes

1. S25-S27 are blockers for external beta.
2. S28-S31 are blockers for "seamless with spec-driven workflows" positioning.
3. S32-S35 are blockers for GA announcement readiness.
4. S36-S37 are hard blockers for GA launch approval.
5. `ferret watch` (S12) can run in parallel but does not replace any GA gate.

For S32-S33, terminal output must be structured enough that editor agents can read `ferret review` the same way they read build or test output today.

### Definition of Done for GA Program

1. All stories S25-S45 merged with passing tests.
2. GA Verification Checklist passes in CI and in one manual dry run.
3. Changelog calls out migration notes for hook defaults and CI baseline strategy.
4. README, CLI `--help`, and onboarding docs are mutually consistent.
5. Validation evidence from spec-kit and BMAD repos is linked in release notes.
6. Required Sprint 5 scenario branches are green on both validation repositories for the same candidate tag.

### Sprint 5 Closeout Checklist (Systematic Execution)

Use this ordered checklist to close S38-S45 with no ambiguity.

1. Run matrix workflows for the same candidate version in both validation repos.
2. Record run links, candidate tag, and commit SHAs for both repos.
3. Confirm all 8 required branches are green in both repos for that same candidate.
4. Verify S40 depth behavior explicitly on `scenario/transitive-impact-depth`:

- JSON/report evidence shows direct impact (`depth: 1`) and transitive impact (`depth: 2+`).

5. Verify S41 review flow explicitly with evidence for `accept`, `update`, and `reject` paths:

- Capture before/after command output and JSON artifacts.

6. Verify S42 determinism explicitly on `scenario/code-first-extract`:

- Run `ferret extract` twice on same commit.
- Prove byte-identical output for generated contract files.

7. Confirm S43 scope is explicit in docs:

- Recommended opinionated posture is documented as recommendation, not universal requirement.

8. Update story statuses from Planned to Complete (or Deferred with rationale) for S38-S45.
9. Link final evidence bundle in release notes and GA sign-off records.
10. Block candidate release if any required branch is red in either repo.

### Sprint 8 — TypeScript-Native Contract Format (v0.3.0)

Goal: ship `.contract.ts` as a first-class contract format. `.contract.md` support unchanged.
Warren CI pipeline depends on `ferret status` from this sprint.

| Story | Scope                                                                                | Deliverable                                              | Acceptance Test                                                                  |
| ----- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| S55   | Contract type + defineContract helper + isContract type guard                        | `packages/core/src/contract.ts` + tests                  | tsc compiles a sample .contract.ts against the type without errors               |
| S56   | TypeScript contract extractor (extractFromContractFile)                              | `packages/core/src/extractor/typescript-contract.ts`     | .contract.ts exports extracted identically to gray-matter path                   |
| S57   | Wire .contract.ts into ferret scan file discovery and ferret.config.json             | File pattern discovery + config schema update            | ferret scan processes .contract.ts alongside .contract.md without extra config   |
| S58   | Thread .contract.ts through upward-classifier, source: blocks, and inferred IDs     | Upward drift + ID collision detection                    | Upward drift flagged against .contract.ts; ID collision surfaced as lint error   |
| S59   | ferret status command                                                                | `packages/cli/bin/commands/status.ts`                    | `ferret status --json` outputs valid JSON; `--export` writes STATUS.md           |

Detailed acceptance criteria: `spec/SPRINT-8-STORIES.MD`.

---

## V3 — Sebastian's Vision

Built on the JSON Schema foundation from Sprint 1.
Revisit when there are real users and real data.

- Rust transpiler
- Additional language grammars
- Full JSON Schema support (`$ref`, `allOf`, composition)

---

## Marketing Decisions — Final

Maria approved.

| Decision          | Value                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Tagline**       | "SpecFerret keeps your specs honest."                                                               |
| **Domain**        | `specferret.dev` ✓ `ferretout.dev` ✓                                                                |
| **npm packages**  | `@specferret/cli` and `@specferret/core`                                                            |
| **CLI command**   | `ferret`                                                                                            |
| **Install**       | `bun install -g @specferret/cli`                                                                    |
| **HN Post title** | "I built a tool that stops AI coding assistants from confidently building the wrong thing"          |
| **HN timing**     | Tuesday 9am Eastern. Ben posts personally. Answers every comment.                                   |
| **Badge**         | `[![SpecFerret](https://img.shields.io/badge/spec--drift-protected-green)](https://specferret.dev)` |
| **Distribution**  | Claude Code + Cursor starter templates. One integration > 1000 blog posts.                          |
| **We do not**     | Run ads. Describe ourselves as AI-powered. We are the thing that keeps AI honest.                   |

---

_© Laser Unicorn — MIT License_
