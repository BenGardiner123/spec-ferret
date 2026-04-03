# DOCUMENTATION-INDEX.MD

Single entry point for SpecFerret planning and GA validation documentation.

---

## Core Product Docs

- `README.md` — install, daily workflow, BMAD/spec-kit integration, GA validation pointers
- `docs/QUICKSTART.md` — single onboarding path, first drift block, troubleshooting
- `docs/ci-templates/` — starter GitHub Actions templates (single-package, monorepo, PR-only)
- `docs/ci-templates/ferret-lint-ci-sample.json` — sample `ferret lint --ci` JSON artifact
- `docs/ci-templates/specferret-action-versioning-policy.md` — Sprint 6 action version/support policy
- `docs/ci-templates/specferret-action-output-contract.md` — Sprint 6 stable action output schema contract
- `docs/ci-templates/specferret-action-release-checklist.md` — Sprint 6 action release checklist
- `spec/CONTRACT-SCHEMA.MD` — contract frontmatter and JSON Schema subset
- `spec/SPEC-CONVENTIONS.MD` — contract tree conventions and workflow integration
- `spec/MASTER-ARCHITECTURE.MD` — architecture rules and layer boundaries
- `spec/MASTER-IMPLEMENTATION-PLAN.MD` — implementation sequence and standards
- `spec/MASTER-STORIES.MD` — story-level acceptance criteria

---

## Planning and Delivery Docs

- `spec/ROADMAP.MD` — sprint roadmap, GA gates, execution breakdown
- `spec/SPRINT-1-STORIES.MD` — completed sprint stories and acceptance criteria
- `spec/SPRINT-2-STORIES.MD` — completed stories for G1-G3
- `spec/SPRINT-3-STORIES.MD` — completed stories for G4-G5
- `spec/SPRINT-4-STORIES.MD` — completed resolution UX and GA hardening stories
- `spec/SPRINT-5-STORIES.MD` — branch-matrix dogfooding coverage stories (S38-S45)
- `spec/SPRINT-6-STORIES.MD` — GitHub Action adoption distribution stories (S46-S49)
- `spec/SPRINT-7-STORIES.MD` — upward code-to-spec drift stories (S50-S54)

---

## GA Validation Docs

- `spec/GA-VALIDATION-REPOS.MD` — branch-matrix GA policy for external proof repos
- `spec/GA-VALIDATION-RUNBOOK.MD` — branch-matrix execution and evidence capture runbook
- `.github/workflows/ferret-action-smoke.yml` — local reusable-action smoke validation workflow
- `.github/actions/ferret-lint/README.md` — reusable action contract, inputs/outputs, usage
- `spec/validation-repo-templates/spec-kit/` — spec-kit validation template and CI workflow
- `spec/validation-repo-templates/bmad/` — BMAD validation template and CI workflow

---

## Documentation Rules (Non-Optional)

1. Any change to workflow behavior must update `README.md` in the same PR.
2. Any change to GA gates or acceptance logic must update `spec/ROADMAP.MD`.
3. Any change to validation mechanics must update both:
   - `spec/GA-VALIDATION-REPOS.MD`
   - `spec/GA-VALIDATION-RUNBOOK.MD`
4. Any sprint story marked complete must include corresponding doc updates in its PR description.
5. No story is done until docs and tests are both updated.

---

_© Laser Unicorn — MIT License_
