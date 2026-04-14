# GA-VALIDATION-REPOS.MD

Hard-truth validation plan for GA.
SpecFerret must prove end-to-end behavior inside real spec-driven workflows.

Detailed execution steps live in `spec/GA-VALIDATION-RUNBOOK.MD`.

---

## Purpose

This document defines the two mandatory external validation repositories required for GA:

1. spec-kit validation repository
2. BMAD validation repository

GA is blocked until both repositories are green on the same SpecFerret release candidate.

---

## Repository Requirements

Each validation repository must:

- Be a clean project initialized with its respective workflow tool (`specify` or BMAD)
- Install SpecFerret via `bun install -g @specferret/cli`
- Run `ferret init` with default enforcement behavior
- Include at least 3 real contracts:
  - one API contract
  - one table/type/event contract
  - one contract importing another contract
- Include the mandatory branch-matrix scenario set below

For unpublished release candidates, local dry runs may invoke the compiled CLI artifact directly from this monorepo, but final CI evidence still requires a documented install path for the exact candidate under test.

Starter templates are provided in this repo:

- `spec/validation-repo-templates/spec-kit/`
- `spec/validation-repo-templates/bmad/`

Bootstrap command:

```bash
bun run bootstrap:validation --type spec-kit --out ../specferret-validation-spec-kit
bun run bootstrap:validation --type bmad --out ../specferret-validation-bmad
```

---

## Mandatory Branch Matrix (Sprint 5)

Both validation repositories must expose the same branch families:

- `main`
- `scenario/breaking-required-field`
- `scenario/breaking-type-change`
- `scenario/nonbreaking-optional-add`
- `scenario/transitive-impact-depth`
- `scenario/review-resolution-flow`
- `scenario/code-first-extract`
- `scenario/specferret-opinionated-layout`

### Sprint 7 Scenario Branches (Upward Drift)

- `scenario/upward-breaking-signature-change`
- `scenario/upward-nonbreaking-optional-add`
- `scenario/upward-review-resolution-flow`

### Sprint 8 Scenario Branches (TypeScript-Native Contracts)

- `scenario/ts-contract-basic`
- `scenario/ts-contract-breaking-drift`
- `scenario/ts-contract-mixed-format`
- `scenario/ts-contract-id-collision`

Each scenario branch must include a small scenario manifest documenting:

- expected `ferret lint --ci` exit code
- expected drift class (`breaking`, `non-breaking`, or clean)
- expected need for `ferret review`
- expected downstream impact behavior (when applicable)

---

## Validation Repo A — spec-kit

### Setup

- Initialize project with spec-kit
- Produce planning artifacts (`spec.md`, `plan.md`, `tasks.md`)
- Create contracts from planned shapes
- Apply baseline template from `spec/validation-repo-templates/spec-kit/`

### Required CI Workflow

1. Install Bun and SpecFerret
2. Restore or generate baseline state per CI policy
3. Execute matrix across all mandatory scenario branches
4. Compare observed outcomes to scenario manifest expectations
5. Fail workflow if any branch outcome diverges from expectation

### Required Evidence

- Matrix workflow run URL
- Per-branch `ferret lint --ci` JSON artifacts
- Commit SHA tested for each branch
- Scenario manifest revision used for validation

---

## Validation Repo B — BMAD

### Setup

- Initialize project with BMAD workflow
- Produce planning artifacts in BMAD output structure
- Create contracts from planned shapes
- Apply baseline template from `spec/validation-repo-templates/bmad/`

### Required CI Workflow

1. Install Bun and SpecFerret
2. Restore or generate baseline state per CI policy
3. Execute matrix across all mandatory scenario branches
4. Compare observed outcomes to scenario manifest expectations
5. Fail workflow if any branch outcome diverges from expectation

### Required Evidence

- Matrix workflow run URL
- Per-branch `ferret lint --ci` JSON artifacts
- Commit SHA tested for each branch
- Scenario manifest revision used for validation

---

## Pass/Fail Criteria

GA validation is PASS only if all are true:

1. Both repositories run all mandatory scenario branches.
2. Every scenario branch outcome matches expected manifest assertions.
3. Breaking scenarios fail with actionable diagnostics (contract ID + downstream context).
4. Resolution scenario proves expected post-action state.
5. Results are reproducible on two clean CI runners.

Any unmet item is a GA FAIL.

---

## Release Candidate Policy

For every GA candidate tag:

1. Re-run both validation repositories against that exact tag.
2. Execute all mandatory scenario branches in both repositories.
3. Publish matrix evidence links in release notes.
4. Confirm gate G7 in ROADMAP is green.

---

## Executed Evidence (2026-04-03)

The following candidate validation runs are complete and green.
This execution includes explicit S40 depth assertions, S41 proof-artifact assertions, and S42 extract determinism assertions.

### spec-kit

- Repository: `BenGardiner123/spec-ferret-validation-spec-kit`
- Workflow run (success):
  https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/23962649755
- Commit SHA tested: `6817ba632156474cd918a5a97be0f7ef3826f48a`

### BMAD

- Repository: `BenGardiner123/specferret-validation-bmad`
- Workflow run (success):
  https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/23962652352
- Commit SHA tested: `bb263c0c617a0a4176954b6cb461ee26e485ae13`

### Candidate Install Strategy Used

At execution time, `@specferret/cli` was not yet published to npm.
To keep validation deterministic, workflows used a pinned repo-local candidate bundle (`vendor/ferret.bundle.js`) instead of global npm install.
Once npm publication is live, future candidate validations should pin and install `@specferret/cli@<candidate-version>` directly.

---

_© Laser Unicorn — MIT License_
