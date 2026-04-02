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
- Include one intentional breaking-change scenario used by CI smoke tests

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

## Validation Repo A — spec-kit

### Setup

- Initialize project with spec-kit
- Produce planning artifacts (`spec.md`, `plan.md`, `tasks.md`)
- Create contracts from planned shapes
- Apply baseline template from `spec/validation-repo-templates/spec-kit/`

### Required CI Workflow

1. Install Bun and SpecFerret
2. Restore or generate baseline state per CI policy
3. Run `ferret lint --ci` on no-drift commit (must pass)
4. Run drift-seed commit job (must fail with breaking drift)
5. Run resolution commit job (must pass)

### Required Evidence

- CI links for pass/fail/pass sequence
- `ferret lint --ci` JSON artifacts for each step
- Commit references for drift-seed and resolution

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
3. Run `ferret lint --ci` on no-drift commit (must pass)
4. Run drift-seed commit job (must fail with breaking drift)
5. Run resolution commit job (must pass)

### Required Evidence

- CI links for pass/fail/pass sequence
- `ferret lint --ci` JSON artifacts for each step
- Commit references for drift-seed and resolution

---

## Pass/Fail Criteria

GA validation is PASS only if all are true:

1. Both repositories pass no-drift CI checks.
2. Both repositories fail intentionally seeded breaking drift.
3. Both repositories pass after contract/code resolution.
4. Drift diagnostics identify contract ID and affected downstream contract(s).
5. Results are reproducible on two clean CI runners.

Any unmet item is a GA FAIL.

---

## Release Candidate Policy

For every GA candidate tag:

1. Re-run both validation repositories against that exact tag.
2. Publish links to evidence in release notes.
3. Confirm gate G7 in ROADMAP is green.

---

_© Laser Unicorn — MIT License_
