# SPRINT-4-STORIES.MD

Engineering stories for SpecFerret Sprint 4 (resolution UX + GA hardening).
Acceptance criteria map directly to implementation tests.
This sprint targets G6 and the final GA hardening tranche.

---

## Status: In Progress

Goal: turn lint failures into guided, model-friendly resolution workflows.
Gate target: G6.

---

### S32 — Guided `ferret review`

**As a** developer blocked by contract drift,
**I want** `ferret review` to guide me through accept, update, or reject,
**so that** I can resolve the event without opening docs and can hand the output to an editor agent.

**Acceptance Criteria:**

- `ferret review` shows the drifting contract, source file, and downstream impact
- Output is structured and copy-pasteable for AI/editor workflows
- Command supports three actions: accept, update, reject
- `accept` records a reconciliation decision and clears the reviewed drift event
- `update` records intent and prints downstream update context without clearing the block
- `reject` records intent and keeps the repo blocked until upstream is fixed

**Implementation Notes:**

- Interactive by default for humans
- Flag-driven path allowed for tests and automation bootstrap
- S32 terminal output should be machine-readable-by-convention; strict JSON belongs to S33

**Candidate Test Files:**

- `packages/cli/bin/commands/review.test.ts` (new)
- `packages/core/src/store/sqlite.test.ts` (new sections if needed)

**Status:** ✓ Complete
**Implemented Files:**

- `packages/cli/bin/commands/review.ts`
- `packages/cli/bin/commands/review.test.ts`
- `packages/cli/bin/ferret.ts`
- `README.md`

---

### S33 — `ferret review --json`

**As a** tool author or editor agent,
**I want** structured JSON review output,
**so that** resolution workflows can be consumed programmatically without parsing prose.

**Acceptance Criteria:**

- `ferret review --json` emits a structured resolution payload to stdout
- Output includes contract, source file, impact, recommended action, and available options
- Output is stable enough for CI/dev tooling consumption
- No ANSI output appears in `--json` mode

**Status:** ✓ Complete
**Implemented Files:**

- `packages/cli/bin/commands/review.ts`
- `packages/cli/bin/commands/review.test.ts`

---

### S34 — GA smoke harness

**As a** maintainer preparing GA,
**I want** an automated end-to-end smoke harness,
**so that** CI proves both the clean recovery path and the intentional drift block path.

**Acceptance Criteria:**

- Automated harness runs `init -> lint -> break -> block -> review -> green`
- Automated harness separately verifies intentional drift block path
- CI executes both harness modes against the compiled CLI
- Drift-block step fails deterministically with lint exit code 1

**Status:** ✓ Complete
**Implemented Files:**

- `scripts/smoke-s34.ts`
- `.github/workflows/ci.yml`
- `package.json`
- `README.md`

---

_© Laser Unicorn — MIT License_
