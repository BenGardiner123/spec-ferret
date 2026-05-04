---
description: "SpecFerret agent guardrails for contract lifecycle and drift enforcement."
applyTo: "**"
---

# SpecFerret Agent Instruction Pack

When working in this repository:

- Respect contract lifecycle states: `stable`, `needs-review`, `pending`, `blocked`.
- Run `ferret lint` before and after contract-affecting edits.
- If drift appears, use `ferret review` and document whether action is `accept`, `update`, or `reject`.
- For automated flows, prefer machine output from `ferret lint --ci` and `ferret review --json`.
- Keep contract changes deterministic and aligned with canonical type semantics.
