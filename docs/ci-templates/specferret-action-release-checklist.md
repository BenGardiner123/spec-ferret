# SpecFerret Action Release Checklist

Use this checklist before tagging a new `BenGardiner123/action` release.

## Pre-Release

1. Verify action metadata and docs are in sync:
   - `.github/actions/ferret-lint/action.yml`
   - `.github/actions/ferret-lint/README.md`
2. Confirm no breaking output/input changes unless planning a major bump.
3. Confirm baseline mode semantics (`committed` / `rebuild`) match docs.

## Smoke Validation (Required)

1. Run in-repo action smoke workflow (all modes):
   - single-package equivalent
   - monorepo equivalent
   - PR-only equivalent
2. Confirm summary section is emitted.
3. Confirm JSON artifact upload succeeds.
4. Confirm stderr artifact upload succeeds.
5. Confirm exit-code gating behavior is deterministic.

## Release Tagging

1. Tag patch/minor release (`v1.x.y`) for non-breaking changes.
2. Update `v1` major tag to latest compatible release.
3. Record release commit SHA and workflow run links.

## Post-Release Evidence

1. Publish run links and SHAs in Sprint 6 evidence section.
2. Update roadmap/master status markers when sprint criteria are met.
3. Add migration notes if any consumer-impacting behavior changed.
