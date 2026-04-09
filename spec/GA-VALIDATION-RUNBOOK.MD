# GA-VALIDATION-RUNBOOK.MD

Step-by-step execution guide for GA validation repositories.
Use this to run external validation scenarios with no interpretation.

---

## Scope

This runbook verifies SpecFerret behavior in two real external workflows:

1. spec-kit repository validation
2. BMAD repository validation

Both must complete mandatory branch-matrix validation before GA approval.

Release enforcement and agent-UX gates are defined in:

- `spec/RELEASE-GATE-CHECKLIST.MD`

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

### Required Branch Matrix

Execute these branches in both repositories:

- `main`
- `scenario/breaking-required-field`
- `scenario/breaking-type-change`
- `scenario/nonbreaking-optional-add`
- `scenario/transitive-impact-depth`
- `scenario/review-resolution-flow`
- `scenario/code-first-extract`
- `scenario/specferret-opinionated-layout`

Each branch must have expected outcomes declared in a scenario manifest.

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

Run the matrix in each validation repository.

1. For each required branch, checkout the branch and run:

```bash
ferret init --no-hook
ferret lint --ci
```

2. Compare observed outcome with scenario manifest expectation:

- exit code
- drift class
- review requirement
- downstream context/depth expectation (if declared)

If using a local unpublished candidate, replace `ferret` with:

```bash
bun ../specferret/packages/cli/dist/bin/ferret.js
```

---

## CI Workflow Execution

Each template includes:

- `.github/workflows/specferret-validation.yml`

This workflow must execute all required scenario branches and assert branch outcomes.

Expected overall workflow result: PASS only when every mandatory branch matches expected outcomes.

---

## Evidence Collection Checklist

For each repository, capture:

1. Workflow run URL
2. Candidate version tested
3. Per-branch commit SHA tested
4. Per-branch `ferret lint --ci` JSON artifact
5. Scenario manifest revision
6. Outcome assertion report (expected vs observed)

Store links in release notes and GA decision record.

### Recorded Execution Evidence (2026-04-03)

This record captures a completed branch-matrix run for both canonical validation repositories.
This execution includes explicit S40 depth assertions, S41 proof-artifact assertions, and S42 extract determinism assertions.

Candidate under test:

- vendored CLI bundle in validation repos (`bun vendor/ferret.bundle.js`)
- **Note:** this run predates npm-install validation. The workflows now install `@specferret/cli` directly from npm via `bun add --global @specferret/cli@<version>`. The vendor bundle evidence is retained for historical record only.

spec-kit validation repo:

- Workflow run: https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/23962649755
- Head SHA: `6817ba632156474cd918a5a97be0f7ef3826f48a`
- Result: `success`
- Matrix jobs: 8/8 successful

BMAD validation repo:

- Workflow run: https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/23962652352
- Head SHA: `bb263c0c617a0a4176954b6cb461ee26e485ae13`
- Result: `success`
- Matrix jobs: 8/8 successful

Notes:

- This satisfies the matrix-green evidence requirement for the recorded candidate state.
- For release sign-off, keep evidence links and SHAs aligned to the exact tag/version being announced.

---

### Recorded Execution Evidence (2026-04-09 — 0.1.4 npm install, 12-scenario matrix)

Candidate under test:

- `@specferret/cli@0.1.4` installed from npm (`bun add --global @specferret/cli@0.1.4`)
- Matrix expanded from 9 → 12 scenarios (added: `breaking-required-field-added`, `noop-no-drift`, `depth-3-chain`)
- New `assert-scenario.sh` supports `expectedTriggerContracts` — verifies WHICH contract triggered drift, not just counts
- `depth-3-chain` proves BFS traversal reaches at least depth 3 (`maxDepthAtLeast: 3`)
- `noop-no-drift` proves S03 hash stability (property reorder = no drift)
- `breaking-required-field-added` covers S04 breaking class: required field added

spec-kit validation repo:

- Workflow run (12-scenario): https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/24218377049
- Result: `success`
- Matrix jobs: 12/12 successful

BMAD validation repo:

- Workflow run (12-scenario): https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/24218378124
- Result: `success`
- Matrix jobs: 12/12 successful

### Previous Evidence (2026-04-09 — 0.1.4 npm install, 9-scenario matrix)

spec-kit:
- Workflow run: https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/24217228972
- Head SHA: `9dfdee94132590bdbf0fc3b2ce3ca9cdebb3b164` · 9/9 successful

BMAD:
- Workflow run: https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/24217230401
- Head SHA: `b87a5dc1edb1ed6b68f2d7c327416b182b89705b` · 9/9 successful

Notes:

- The 12-scenario run is the authoritative GA evidence for `@specferret/cli@0.1.4`.
- All scenarios validated against the live npm package, not a vendor bundle.
- `agent-mode-init` confirms `ferret init --agent-targets` scaffolding works end-to-end in CI.

---

## Pass/Fail Decision Table

| Check               | Expected                                 | Fail Condition              |
| ------------------- | ---------------------------------------- | --------------------------- |
| Branch matrix CI    | All mandatory branches executed          | Any required branch missing |
| Branch assertions   | Expected outcome matches observed        | Outcome mismatch            |
| Breaking scenarios  | Non-zero with actionable diagnostics     | Exit 0 or unusable output   |
| Resolution scenario | Expected post-review state is achieved   | State mismatch              |
| Diagnostics quality | Contract ID + downstream context visible | Generic/unactionable output |
| Reproducibility     | Same result on two clean runners         | Inconsistent outcomes       |

Any fail condition blocks GA.

---

## Common Failure Modes and Fixes

### Failure: breaking scenario branch exits 0

Cause:

- Scenario branch fixture does not represent the intended breaking case

Fix:

- Validate branch fixture and scenario manifest expectations are aligned
- Re-run branch assertion job for that scenario

### Failure: branch missing from matrix

Cause:

- Required branch was not created or not included in workflow matrix

Fix:

- Add missing branch and scenario manifest entry
- Re-run matrix workflow

### Failure: Workflow cannot find `ferret`

Cause:

- Global bun install not available in PATH in job shell

Fix:

- Ensure `oven-sh/setup-bun@v2` runs before install
- Keep install step: `bun install -g @specferret/cli`

### Failure: `bun install -g @specferret/cli` returns 404

Cause:

- candidate has not been published to npm yet, or npm auth/scope permissions are invalid for `@specferret`

Fix:

- verify auth first: `npm whoami`
- if scope publish/install access is missing, restore `@specferret` org/team permissions and retry
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

0. Complete every required item in `spec/RELEASE-GATE-CHECKLIST.MD`.
1. Run both validation repositories against the final GA candidate tag.
2. Verify all mandatory scenario branches are green in both repositories.
3. Verify evidence checklist complete for both.
4. Confirm G7 marked green in roadmap status review.
5. Attach matrix evidence links to release notes and GA announcement checklist.

No evidence, no GA.

---

_© Laser Unicorn — MIT License_
