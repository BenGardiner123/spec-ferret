# SPRINT-7-STORIES.MD

Engineering stories for SpecFerret Sprint 7 (upward code-to-spec drift detection).
Acceptance criteria map directly to deterministic tests and validation evidence.
This sprint targets G9 from ROADMAP.MD.

---

## Status: Complete — v0.2.0

Goal: enforce bidirectional drift detection by catching implementation-code changes that invalidate declared contracts.
Gate target: G9.

---

### S50 — Code-Shape Baseline Snapshot

**As a** developer using annotated TypeScript,
**I want** deterministic code-shape snapshots,
**so that** code-origin drift can be measured reliably.

**Acceptance Criteria:**

- Snapshot model generated from annotated TypeScript symbols
- Snapshot hashing is deterministic for identical code input
- Canonical ordering rules documented and tested
- Unsupported symbols fail with actionable diagnostics

**Status:** Complete

---

### S51 — Upward Drift Classifier (Code -> Spec)

**As a** maintainer,
**I want** a classifier for code-to-spec mismatches,
**so that** contract drift is caught even when specs were not edited.

**Acceptance Criteria:**

- Diff engine compares code-derived shape with stored/declared contract shape
- Breaking and non-breaking classes are deterministic and documented
- Classifier reports contract ID, source symbol/file, and mismatch reason
- Known no-op formatting changes do not produce false positives

**Status:** Complete

---

### S52 — Lint and CI Integration for Upward Drift

**As a** CI owner,
**I want** upward drift included in `ferret lint` and `ferret lint --ci`,
**so that** code-origin contract breakage blocks merges deterministically.

**Acceptance Criteria:**

- `ferret lint` surfaces upward drift alongside existing drift diagnostics
- `ferret lint --ci` JSON includes explicit code-origin drift metadata
- Exit behavior remains deterministic and documented
- CI output includes impacted contracts and source locations

**Status:** Complete

---

### S53 — Review Flow Support for Upward Drift

**As a** reviewer,
**I want** guided resolution context for code-origin drift,
**so that** remediation is clear for humans and editor agents.

**Acceptance Criteria:**

- `ferret review` presents code-origin drift context in terminal output
- `ferret review --json` includes source symbol/file and recommended resolution actions
- Resolution options distinguish spec update vs code rollback intent
- Reconciliation log captures code-origin drift decision metadata

**Status:** Complete

---

### S54 — Validation Scenarios and Release Gate Evidence

**As a** release approver,
**I want** external validation evidence for upward drift coverage,
**so that** bidirectional enforcement is proven before candidate release.

**Acceptance Criteria:**

- Validation templates include at least one code-only drift scenario branch
- Matrix assertions verify upward drift detection and diagnostics
- Candidate release checklist requires green upward drift scenarios
- Evidence links are recorded in roadmap/runbook docs

**Status:** Complete

---

### Sprint Exit Criteria

1. Stories S50-S54 are implemented or explicitly deferred with approved rationale.
2. Upward drift can be reproduced deterministically from code-only changes.
3. Lint/CI/review flows expose code-origin drift in both human and machine outputs.
4. Validation repositories include upward drift scenario coverage.
5. Documentation updates land in the same PR set:

- `README.md`
- `spec/ROADMAP.MD`
- `spec/MASTER-STORIES.MD`
- `spec/GA-VALIDATION-REPOS.MD`
- `spec/GA-VALIDATION-RUNBOOK.MD`

### Systematic Workthrough Checklist

Use this ordered list to execute S50-S54 with deterministic evidence capture.

1. Lock upward-drift scope and data model.
   - define code-shape snapshot schema and hash strategy.
   - define classifier reason codes for breaking/non-breaking/no-change.
2. Implement S50 snapshot extraction and hashing.
   - add fixture set for annotated TypeScript symbols.
   - prove same-commit byte-identical snapshot output.
3. Implement S51 upward classifier.
   - compare code-derived shape against declared contract shape.
   - ensure no-op changes do not trigger drift.
4. Integrate S52 lint/CI output.
   - add upward drift diagnostics to terminal and JSON output.
   - verify exit code behavior remains deterministic.
5. Integrate S53 review flows.
   - include source symbol/file and action recommendations in `review` and `review --json`.
   - record reconciliation metadata for code-origin drift events.
6. Add S54 validation scenarios.
   - extend external validation templates with code-only drift branches.
   - add branch assertions for upward drift detection quality.
7. Validate required upward-drift branch taxonomy.
   - required branches must exist in both validation repos before evidence runs:
     - `main`
     - `scenario/upward-breaking-signature-change`
     - `scenario/upward-nonbreaking-optional-add`
     - `scenario/upward-review-resolution-flow`
   - if any required branch is missing or red, sprint closeout is blocked.
8. Execute end-to-end evidence runs.
   - run local fixtures and CI matrix scenarios.
   - capture run URLs, SHAs, and artifacts.
9. Reconcile docs and status markers.
   - update roadmap/runbook/policy docs with upward drift coverage.
   - move S50-S54 from Planned to Complete (or Deferred with rationale).

### Execution Evidence (Fill During Implementation)

Populate all fields before changing Sprint 7 status to Complete.

- Candidate version/tag: `TODO`
- Feature branch: `TODO`
- Baseline commit SHA for snapshot determinism: `TODO`
- Core repository commit SHA: `TODO`

S50 evidence:

- Snapshot schema reference path/link: `TODO`
- Determinism test run link/output: `TODO`
- Fixture pack path/link: `TODO`

S51 evidence:

- Classifier rule matrix link: `TODO`
- Breaking mismatch test evidence: `TODO`
- Non-breaking mismatch test evidence: `TODO`
- No-op false-positive guard evidence: `TODO`

S52 evidence:

- `ferret lint` upward-drift sample output link: `TODO`
- `ferret lint --ci` JSON sample artifact link: `TODO`
- Exit-code behavior evidence (drift/no-drift): `TODO`

S53 evidence:

- `ferret review` code-origin sample output link: `TODO`
- `ferret review --json` sample payload link: `TODO`
- Reconciliation log metadata evidence: `TODO`

S54 evidence:

- Validation template branch list update link: `TODO`
- spec-kit upward-drift run URL: `TODO`
- BMAD upward-drift run URL: `TODO`
- spec-kit commit SHA: `TODO`
- BMAD commit SHA: `TODO`
- Matrix assertion artifact links: `TODO`

Final sign-off:

- Reviewer: `TODO`
- Sign-off date (UTC): `TODO`
- Sprint 7 status set to Complete in:
  - `spec/ROADMAP.MD`: `TODO`
  - `spec/MASTER-STORIES.MD`: `TODO`
  - `spec/GA-VALIDATION-REPOS.MD`: `TODO`
  - `spec/GA-VALIDATION-RUNBOOK.MD`: `TODO`

---

_© Laser Unicorn — MIT License_
