# SPRINT-6-STORIES.MD

Engineering stories for SpecFerret Sprint 6 (GitHub Action adoption distribution).
Acceptance criteria map directly to implementation tests and workflow evidence.
This sprint targets G8 from ROADMAP.MD.

---

## Status: Complete

Goal: make CI adoption one-line and deterministic through a reusable GitHub Action.
Gate target: G8.

---

### S46 — Reusable GitHub Action (`BenGardiner123/action@v1`)

**As a** repository maintainer,
**I want** a reusable GitHub Action for `ferret lint --ci`,
**so that** I can adopt SpecFerret in CI without custom shell orchestration.

**Acceptance Criteria:**

- Public action published and versioned (`v1` tag)
- Action runs `ferret lint --ci` with deterministic baseline behavior
- Action supports baseline strategy inputs (`committed` / `rebuild`)
- Action exits non-zero on drift exactly as CLI does
- Action docs include minimal copy-paste workflow

**Status:** Complete

---

### S47 — Action Outputs and Workflow UX

**As a** reviewer,
**I want** Action runs to produce clear summary and machine output,
**so that** I can triage drift quickly in PRs and automation.

**Acceptance Criteria:**

- Action emits stable output fields for `consistent`, `breaking`, `nonBreaking`, and flagged contracts
- Workflow summary includes compact drift diagnostics and artifact links
- JSON artifact is preserved for every run
- Output contract is documented for tooling/agent consumption

**Status:** Complete

---

### S48 — Starter Workflow Templates

**As a** new adopter,
**I want** starter templates for common repo layouts,
**so that** I can enable enforcement quickly with low setup risk.

**Acceptance Criteria:**

- Templates exist for at least: single package repo, monorepo workspace, and PR-only lint mode
- Templates include baseline strategy guidance and troubleshooting notes
- Templates are validated by test repositories or fixture workflows
- Docs include exact copy-paste examples

**Status:** Complete

---

### S49 — Action Versioning and Support Policy

**As a** maintainer,
**I want** explicit Action versioning and compatibility policy,
**so that** adopters can upgrade safely without surprise breakage.

**Acceptance Criteria:**

- `v1` maintenance policy documented (non-breaking updates only)
- Breaking changes require new major tag and migration notes
- Release checklist includes Action smoke validation before publish
- Action docs state supported runtimes and deprecation policy

**Status:** Complete

---

### Sprint Exit Criteria

1. Stories S46-S49 are implemented or explicitly deferred with approved rationale.
2. `uses: BenGardiner123/action@v1` works in a fresh repository without custom shell scripts.
3. Action outputs are stable and documented for human and machine consumers.
4. Starter templates are validated and linked from README/docs.
5. Documentation updates land in the same PR set:

- `README.md`
- `spec/ROADMAP.MD`
- `spec/DOCUMENTATION-INDEX.MD`
- `spec/MASTER-STORIES.MD`

### Systematic Workthrough Checklist

Use this ordered list to execute S46-S49 with no ambiguity.

1. Define Action contract and repository layout.
   - confirm action type (`composite` or Docker) and default inputs.
   - freeze output field names (`consistent`, `breaking`, `nonBreaking`, `flagged`).
2. Implement S46 reusable Action.
   - add action metadata file and runtime steps.
   - wire baseline strategy input (`committed`/`rebuild`) to `ferret lint --ci` behavior.
3. Build S47 outputs and summary behavior.
   - write workflow summary content.
   - persist JSON output as artifact with deterministic naming.
4. Implement S48 starter templates.
   - add single-package and monorepo workflow examples.
   - add PR-only workflow variant with minimal permissions.
5. Implement S49 release/version policy.
   - define `v1` update rules.
   - document breaking-change path (`v2` major tag migration).
6. Execute validation runs.
   - run all starter templates (`single-package`, `monorepo`, `PR-only`) across at least two fixture repositories.
   - confirm Action pass/fail behavior matches direct CLI behavior.
7. Reconcile docs and status markers.
   - update README and docs index references.
   - move S46-S49 status from Planned to Complete (or Deferred with rationale).
8. Record evidence in this document and ROADMAP.
   - do not mark sprint complete until all required evidence fields are populated.

### Execution Evidence (Fill During Implementation)

Populate all fields before changing Sprint 6 status to Complete.

- Candidate version/tag: `0.1.3`
- Candidate commit SHA: `ec977d93adc1b6d76d5a271a5d60f104a2314f57`
- Action release tag: `v1.0.1`
- Action major tag alias update (`v1`): `yes -> 4cc9769089b30eb3569e4662d919278b8b3cbd88`
- Action repository URL: `https://github.com/BenGardiner123/action`
- Action repository commit SHA: `4cc9769089b30eb3569e4662d919278b8b3cbd88`

S46 evidence:

- Action metadata file path: `.github/actions/ferret-lint/action.yml`
- Smoke workflow run URL (single-package): `https://github.com/BenGardiner123/spec-ferret/actions/runs/23965790753/job/69905345954`
- Smoke workflow run URL (monorepo): `https://github.com/BenGardiner123/spec-ferret/actions/runs/23965790753/job/69905345965`
- Smoke workflow run URL (PR-only): `https://github.com/BenGardiner123/spec-ferret/actions/runs/23965790753/job/69905346043`
- Fixture repository 1 commit SHA: `BenGardiner123/spec-ferret-validation-spec-kit@bbe4cac9554902f93a6cca791bec8585d004f3b6`
- Fixture repository 2 commit SHA: `BenGardiner123/specferret-validation-bmad@6ea519f0a978414e0dc57fd01c399637fb8b2fcb`

S47 evidence:

- Workflow summary screenshot/artifact link: `https://github.com/BenGardiner123/spec-ferret/actions/runs/23965790753` (artifacts: `/artifacts/6266826762`, `/artifacts/6266826119`, `/artifacts/6266826727`)
- JSON artifact example link: `docs/ci-templates/ferret-lint-ci-sample.json`
- Output schema doc link: `docs/ci-templates/specferret-action-output-contract.md`

S48 evidence:

- Starter template (single-package) path/link: `docs/ci-templates/ferret-action-single-package.yml`
- Starter template (monorepo) path/link: `docs/ci-templates/ferret-action-monorepo.yml`
- Starter template (PR-only) path/link: `docs/ci-templates/ferret-action-pr-only.yml`
- Template validation matrix summary link: `.github/workflows/ferret-action-smoke.yml`

S49 evidence:

- Versioning/support policy doc link: `docs/ci-templates/specferret-action-versioning-policy.md`
- Breaking-change migration template link: `docs/ci-templates/specferret-action-versioning-policy.md`
- Release checklist update link: `docs/ci-templates/specferret-action-release-checklist.md`

Final sign-off:

- Reviewer: `BenGardiner123`
- Sign-off date (UTC): `2026-04-04`
- Sprint 6 status set to Complete in:
  - `spec/ROADMAP.MD`: `Complete`
  - `spec/MASTER-STORIES.MD`: `Complete`

---

_© Laser Unicorn — MIT License_
