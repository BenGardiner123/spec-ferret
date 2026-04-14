# SpecFerret Quickstart

Single onboarding path for a new developer.
Target: complete first setup, first clean lint, first blocked drift, and first resolution in under 30 minutes.

---

## 1. Install

Prerequisite:

- Bun 1.0 or later in `PATH`

Install the CLI and initialize a repo:

```bash
bun install -g @specferret/cli
ferret init
```

Expected result:

- `.ferret/graph.db` exists
- `contracts/example.contract.md` exists
- `ferret.config.json` exists
- `.git/hooks/pre-commit` is installed if `.git/hooks` exists

If you do not want the hook installed:

```bash
ferret init --no-hook
```

---

## 2. Register A Contract

Replace `contracts/example.contract.md` with a real contract or start with this example:

```markdown
---
ferret:
  id: api.GET/users
  type: api
  shape:
    type: object
    properties:
      users:
        type: array
        items:
          type: object
          properties:
            id:
              type: string
            email:
              type: string
          required: [id, email]
    required: [users]
---

# GET /users

Returns the registered users.
```

Run:

```bash
ferret lint
```

Expected result:

```text
✓ ferret  1 contracts  0 drift  12ms
```

---

## 3. Trigger A Real Drift Block

Make a breaking change. For example, remove `email` from the required list:

```yaml
required: [id]
```

Run:

```bash
ferret lint
```

Expected result:

- non-zero exit
- blocking drift output
- guidance to run `ferret review`

---

## 4. Resolve The Block

Run the guided review flow:

```bash
ferret review
```

Available actions:

- `accept`: record review and clear reviewed drift
- `update`: keep repo blocked and print downstream update context
- `reject`: keep repo blocked until upstream is fixed

Non-interactive examples:

```bash
ferret review --contract api.GET/users --action accept
ferret review --json
```

Finish by re-running lint:

```bash
ferret lint
```

Expected result after resolution:

```text
✓ ferret  1 contracts  0 drift  12ms
```

---

## 5. Agent Mode (Optional)

If you use Claude, GitHub Copilot, or Gemini in your repo, scaffold the canonical agent rules:

```bash
ferret init --agent-targets claude,copilot,gemini
```

This writes:

- `.github/specferret/canonical-agent-rules.md` — the authoritative contract lifecycle rules for agents
- `.github/instructions/specferret-agent.instructions.md` — VS Code Copilot instruction pack
- `.github/specferret/adapters/claude.adapter.md`
- `.github/specferret/adapters/copilot.adapter.md`
- `.github/specferret/adapters/gemini.adapter.md`

Skip agent rules entirely with `--no-agent-rules`. Run specific targets only with:

```bash
ferret init --agent-targets claude
```

---

## 6. Daily Workflow

Normal workflow:

```bash
ferret lint
```

Use these when needed:

- `ferret review` for drift resolution
- `ferret extract` to scaffold contracts from exported TypeScript with inferred ids/types by default
- `ferret scan` only for manual graph/debug workflows

Migration note for annotation-first repositories:

- existing `@ferret-contract` annotations remain valid as explicit overrides
- inferred and annotated contracts can run together during migration
- remove annotations gradually after confirming inferred ids/types are stable

---

## 7. CI Workflow

Recommended when `.ferret/context.json` is committed:

```bash
ferret lint --ci
```

Use rebuild mode for ephemeral runners:

```bash
ferret lint --ci --ci-baseline rebuild
```

Smoke harness checks in this repo:

```bash
bun run smoke:s34
bun run smoke:s34:drift
```

---

## Troubleshooting

### `ferret` command not found

Cause:

- global Bun install not in `PATH`

Fix:

```bash
bun install -g @specferret/cli
ferret --help
```

If that still fails, ensure Bun's global bin directory is on `PATH`.

### `ferret lint --ci` fails because baseline is missing

Cause:

- default CI mode expects committed `.ferret/context.json`

Fix:

- commit `.ferret/context.json`
- or run `ferret lint --ci --ci-baseline rebuild`

### `ferret review` says import integrity must be fixed first

Cause:

- unresolved, self, or circular imports exist

Fix:

- run `ferret lint`
- fix the import integrity violation shown in output
- re-run `ferret review`

### `ferret init` did not install a pre-commit hook

Cause:

- `.git/hooks` did not exist
- or a pre-existing hook was preserved

Fix:

- confirm you are inside a Git repo
- inspect `.git/hooks/pre-commit`
- re-run `ferret init` in the repo root if needed

### `ferret lint` stays green after a file edit you expected to fail

Cause:

- the edit was non-breaking
- or the contract graph was not the dependency you expected

Fix:

- run `ferret review --json` to inspect current reviewable items
- inspect `.ferret/context.json`
- verify the edited contract imports and downstream dependents

### CI and local runs disagree

Cause:

- different baseline strategy
- stale committed `.ferret/context.json`

Fix:

- make CI baseline mode explicit
- re-run `ferret lint`
- commit the updated `.ferret/context.json` if using committed baseline mode

---

## 8. TypeScript-Native Contracts (v0.3.0)

Instead of markdown frontmatter, you can define contracts in TypeScript:

```bash
bun add @specferret/core zod
```

Create `contracts/auth.contract.ts`:

```ts
import { z } from 'zod';
import { defineContract } from '@specferret/core';

export const jwtPayload = defineContract({
  id: 'auth.jwt',
  value: 'JWT authentication payload',
  output: {
    sub: z.string(),
    email: z.string().email(),
    role: z.enum(['admin', 'user', 'viewer']),
  },
});
```

SpecFerret discovers `.contract.ts` files automatically:

```bash
ferret lint
```

Both `.contract.md` and `.contract.ts` work in the same project.

---

## 9. Check Contract Status

View current drift state without modifying anything:

```bash
ferret status
```

```text
ferret status  3 contracts

  stable        2
  needs-review  1

  NEEDS REVIEW
  auth.jwt          breaking — 2 dependents
```

Machine-readable: `ferret status --json`
Export to file: `ferret status --export` (writes `STATUS.md`)

---

## What To Read Next

- `README.md` for install, workflow summary, and integration overview
- `spec/CONTRACT-SCHEMA.MD` for frontmatter and schema rules
- `spec/SPEC-CONVENTIONS.MD` for contract folder conventions
- `spec/GA-VALIDATION-REPOS.MD` and `spec/GA-VALIDATION-RUNBOOK.MD` for external GA proof

---

MIT License
