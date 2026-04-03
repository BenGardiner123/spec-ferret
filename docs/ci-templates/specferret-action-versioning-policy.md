# SpecFerret Action Versioning Policy (`BenGardiner123/action`)

This policy governs release and compatibility behavior for the reusable GitHub Action.

## Supported Major Tag

- Current stable major: `v1`
- Consumers should pin to `BenGardiner123/action@v1` for non-breaking updates.

## Non-Breaking Changes (Allowed under `v1`)

- Bug fixes in action internals
- Workflow summary formatting improvements
- Additional non-breaking outputs
- Artifact naming improvements that preserve existing defaults

## Breaking Changes (Require New Major)

Changes below must ship under a new major tag (for example `v2`):

- Removing or renaming existing outputs
- Changing default behavior of baseline semantics
- Changing error/exit behavior in a way that can alter pass/fail outcomes
- Removing support for previously documented runner/runtime assumptions

## Release Cadence and Support

- `v1` receives compatibility and bug-fix updates.
- Major upgrades require migration guidance and explicit rollout notes.
- Deprecated majors remain documented until a published EOL notice date.

## Consumer Guidance

- Preferred: `uses: BenGardiner123/action@v1`
- Strict pin option: `uses: BenGardiner123/action@v1.x.y`
- Security-sensitive repos may pin to commit SHA after each release validation.

## Change Management Requirements

Every release must include:

1. changelog summary of behavior changes
2. smoke validation evidence
3. compatibility statement for `v1` consumers
