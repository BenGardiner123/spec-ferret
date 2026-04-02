# GA-VALIDATION-RUNBOOK.MD

Step-by-step execution guide for GA validation repositories.
Use this to run S36 and S37 without interpretation.

---

## Scope

This runbook verifies SpecFerret behavior in two real external workflows:

1. spec-kit repository validation
2. BMAD repository validation

Both must complete PASS/PASS/FAIL/PASS evidence flow before GA approval.

---

## Prerequisites

- Bun installed and available in PATH
- GitHub repository access for creating two validation repos
- SpecFerret candidate version/tag identified
- CI system capable of running GitHub Actions workflows

---

## Canonical Validation Repositories

Use two repositories (names are suggestions):

- `specferret-validation-spec-kit`
- `specferret-validation-bmad`

These repos are throwaway validation harnesses; they are not production apps.

---

## Bootstrap Commands

From this monorepo root:

```bash
bun run bootstrap:validation --type spec-kit --out ../specferret-validation-spec-kit
bun run bootstrap:validation --type bmad --out ../specferret-validation-bmad
```

Optional replace:

```bash
bun run bootstrap:validation --type spec-kit --out ../specferret-validation-spec-kit --force
bun run bootstrap:validation --type bmad --out ../specferret-validation-bmad --force
```

---

## Populate Planning Artifacts

### spec-kit repo

- Initialize with spec-kit (`specify init ...`)
- Add or copy planning artifacts (`spec.md`, `plan.md`, `tasks.md`)
- Keep generated contracts under `contracts/`

### BMAD repo

- Initialize BMAD workflow
- Place planning artifacts under `_bmad-output/planning-artifacts/`
- Keep generated contracts under `contracts/`

---

## Candidate Version Pinning

In both repos, pin the candidate under test:

```bash
bun install -g @specferret/cli@<candidate-version>
```

If validating a local candidate build before npm publication, use the compiled CLI artifact from this monorepo instead of `bun install -g`.

Example from a bootstrapped validation repo:

```bash
bun ../specferret/packages/cli/dist/bin/ferret.js init --no-hook
bun ../specferret/packages/cli/dist/bin/ferret.js lint
bun ../specferret/packages/cli/dist/bin/ferret.js lint --ci
```

Document the exact path used in the evidence log.

---

## Local Dry Run (Before CI)

Run this sequence in each validation repo:

1. Baseline pass

```bash
ferret init --no-hook
ferret lint
ferret lint --ci
```

Expected: pass

If using a local unpublished candidate, replace `ferret` with:

```bash
bun ../specferret/packages/cli/dist/bin/ferret.js
```

2. Seed breaking drift

```bash
chmod +x scripts/seed-breaking-drift.sh
./scripts/seed-breaking-drift.sh
ferret lint --ci
```

Expected: fail (non-zero)

3. Resolve drift

```bash
chmod +x scripts/resolve-drift.sh
./scripts/resolve-drift.sh
ferret lint --ci
```

Expected: pass

---

## CI Workflow Execution

Each template includes:

- `.github/workflows/specferret-validation.yml`

This workflow runs three jobs:

1. `baseline-pass`
2. `seeded-fail`
3. `resolution-pass`

Expected overall workflow result: PASS (because seeded-fail expects non-zero drift result and treats zero as failure).

---

## Evidence Collection Checklist

For each repository, capture:

1. Workflow run URL
2. Commit SHA tested
3. Candidate version tested
4. `baseline-pass` logs and `ferret lint --ci` JSON
5. `seeded-fail` logs proving drift non-zero exit
6. `resolution-pass` logs and final `ferret lint --ci` JSON

Store links in release notes and GA decision record.

---

## Pass/Fail Decision Table

| Check               | Expected                                 | Fail Condition              |
| ------------------- | ---------------------------------------- | --------------------------- |
| Baseline CI         | Pass                                     | Any non-zero exit           |
| Seeded drift CI     | Controlled fail path                     | `ferret lint --ci` exits 0  |
| Resolution CI       | Pass                                     | Non-zero after resolution   |
| Diagnostics quality | Contract ID + downstream context visible | Generic/unactionable output |
| Reproducibility     | Same result on two clean runners         | Inconsistent outcomes       |

Any fail condition blocks GA.

---

## Common Failure Modes and Fixes

### Failure: `ferret lint --ci` passes on seeded drift

Cause:

- Seed script did not modify required field as expected

Fix:

- Open `contracts/auth/jwt.contract.md`
- Confirm `required` list changed from `[id, email, token, expiresAt]` to `[id, email, token]`
- Re-run seeded-fail job

### Failure: Workflow cannot find `ferret`

Cause:

- Global bun install not available in PATH in job shell

Fix:

- Ensure `oven-sh/setup-bun@v2` runs before install
- Keep install step: `bun install -g @specferret/cli`

### Failure: `bun install -g @specferret/cli` returns 404

Cause:

- candidate has not been published to npm yet

Fix:

- for local dry runs, invoke the compiled artifact directly:
  - `bun ../specferret/packages/cli/dist/bin/ferret.js ...`
- for CI proof, publish the candidate or document an equivalent install mechanism before collecting final GA evidence

### Failure: Drift diagnostics too weak

Cause:

- Lint output missing contract reference context

Fix:

- Treat as product bug; do not waive
- File issue against G5 or G6 depending on symptom

---

## GA Sign-off Procedure

1. Run both validation repositories against the final GA candidate tag.
2. Verify evidence checklist complete for both.
3. Confirm G7 marked green in roadmap status review.
4. Attach evidence links to release notes and GA announcement checklist.

No evidence, no GA.

---

_© Laser Unicorn — MIT License_
