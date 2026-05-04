<!-- specferret:generated-adapter target=gemini version=1 -->
# Gemini Adapter

This adapter is generated from canonical SpecFerret rules.

# SpecFerret Canonical Agent Rules

## Contract Lifecycle

- `stable` means no active drift and no pending review action.
- `needs-review` means drift exists and downstream impact must be reviewed.
- `roadmap` means planned but not yet active for enforcement.
- `pending` means unverified — written but not yet confirmed as implemented.
- `blocked` means merge must not proceed until review or remediation is complete.

## Enforcement Gates

- Run `ferret lint` before proposing or merging contract-affecting changes.
- Treat breaking drift as a merge blocker until resolved through `ferret review`.
- Use `ferret review --json` for machine workflows and audit-safe automation.
- Re-run `ferret lint` after review actions to confirm the repo returns to stable.

## Agent Workflow Expectations

- Read `.ferret/context.json` before making contract-sensitive changes.
- Preserve deterministic contract IDs and avoid ad-hoc type categories.
- Keep drift resolution explicit: `accept`, `update`, or `reject`.
