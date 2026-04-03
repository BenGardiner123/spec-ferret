<p align="center">
  <img src="./docs/images/hero.svg" width="780" alt="SpecFerret keeps your specs honest." />
</p>

# SpecFerret keeps your specs honest.

SpecFerret is a Bun-first CLI that detects contract drift before it breaks downstream consumers.

[![npm cli](https://img.shields.io/npm/v/@specferret/cli)](https://www.npmjs.com/package/@specferret/cli)
[![npm core](https://img.shields.io/npm/v/@specferret/core)](https://www.npmjs.com/package/@specferret/core)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

AI-assisted coding accelerates implementation. Specs drift just as fast. SpecFerret turns markdown contracts into a dependency graph, classifies drift (breaking vs non-breaking), and blocks unsafe changes in local dev and CI.

Website: [specferret.dev](https://specferret.dev)

## Why teams use it

- Deterministic drift detection with fast feedback (`ferret lint`)
- Direct and transitive impact reporting (`ferret review`)
- Pre-commit enforcement so breaking changes do not slip through
- CI mode with machine-readable output
- Bun-native local store (`bun:sqlite`) with no extra service setup

## Install

```bash
bun install -g @specferret/cli
```

Requirements:

- Bun 1.0 or later

Install Bun at [bun.sh](https://bun.sh).

## Quickstart (5 minutes)

```bash
ferret init
ferret scan
ferret lint
```

If clean:

```text
✓ ferret  1 contracts  0 drift  12ms
```

If drift exists:

```text
ferret  1 contracts need review
```

Then run:

```bash
ferret review
```

Note: `ferret init` installs a pre-commit hook by default (when `.git/hooks` exists). Use `ferret init --no-hook` to opt out.

For the fastest onboarding path, see [docs/QUICKSTART.md](docs/QUICKSTART.md).

## Your first contract

Create or edit a file in `contracts/` with frontmatter:

```markdown
---
ferret:
  id: api.GET/users
  type: api
  shape:
    type: array
    items:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
      required: [id, email]
---

# GET /users

Returns the list of registered users.
```

Run:

```bash
ferret lint
```

Change a required field and run lint again to see drift detection and review guidance.

## Command reference

| Command                | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `ferret init`          | Scaffold `.ferret/` state and default config |
| `ferret scan`          | Parse contracts and refresh graph state      |
| `ferret lint`          | Detect and classify contract drift           |
| `ferret lint --ci`     | CI mode, JSON output, non-zero on drift      |
| `ferret review`        | Resolve blocking drift interactively         |
| `ferret review --json` | Emit review context for tooling/agents       |
| `ferret extract`       | Generate contracts from annotated TypeScript |

## CI integration

Use in pipelines:

```bash
ferret lint --ci
```

Baseline modes:

- Default: `--ci-baseline committed` (requires committed `.ferret/context.json`)
- Optional: `--ci-baseline rebuild` (useful for ephemeral runners)

Examples:

```bash
# Recommended when context.json is committed
ferret lint --ci

# Ephemeral runner mode
ferret lint --ci --ci-baseline rebuild
```

GitHub Actions step:

```yaml
- run: ferret lint --ci
```

## How drift resolution works

When drift is detected, `ferret review` shows:

- Drifting contract id
- Source contract file
- Direct and transitive downstream impact
- Resolution actions (accept, update, reject)

Typical flow:

```bash
ferret lint
ferret review
ferret lint
```

## Contract types

| Type     | Use for                                         |
| -------- | ----------------------------------------------- |
| `api`    | REST endpoints, GraphQL operations, RPC methods |
| `table`  | Database tables, collections, schemas           |
| `type`   | Shared TypeScript types, interfaces, enums      |
| `event`  | Domain events, webhooks, message payloads       |
| `flow`   | User flows and multi-step processes             |
| `config` | Configuration shapes and feature flags          |

## Use cases

- API teams preventing consumer-breaking contract changes
- Multi-team repos where one change affects many downstream specs
- AI-assisted workflows where generated code can outpace docs
- Type/schema governance for long-lived product surfaces

## BMAD and spec-kit integration

SpecFerret is not a planning tool. It enforces contract consistency downstream of planning tools.

If you use BMAD or spec-kit:

1. Produce PRD/architecture/stories as usual
2. Capture concrete shapes in `.contract.md` files under `contracts/`
3. Run `ferret lint` to validate and enforce consistency

Example structure:

```text
your-project/
  _bmad-output/
    PRD.md
    architecture.md
  contracts/
    auth/
      jwt.contract.md
    tables/
      user.contract.md
  ferret.config.json
```

### Code-first extract

Annotate TypeScript declarations:

```ts
// @ferret-contract: api.GET/users api
export interface GetUsersResponse {
  id: string;
  email: string;
}
```

Then run:

```bash
ferret extract
```

This scaffolds `.contract.md` files under `contracts/` using deterministic mapping and exits non-zero if extraction fails.

## Validation evidence

Released evidence (2026-04-03):

- spec-kit validation run: https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/23926425357
- BMAD validation run: https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/23926426128
- npm package `@specferret/core@0.1.1`: https://www.npmjs.com/package/@specferret/core
- npm package `@specferret/cli@0.1.1`: https://www.npmjs.com/package/@specferret/cli

## Documentation map

- [docs/QUICKSTART.md](docs/QUICKSTART.md)
- [spec/DOCUMENTATION-INDEX.MD](spec/DOCUMENTATION-INDEX.MD)
- [spec/ROADMAP.MD](spec/ROADMAP.MD)
- [spec/GA-VALIDATION-REPOS.MD](spec/GA-VALIDATION-REPOS.MD)
- [spec/GA-VALIDATION-RUNBOOK.MD](spec/GA-VALIDATION-RUNBOOK.MD)
- [spec/MASTER-ARCHITECTURE.MD](spec/MASTER-ARCHITECTURE.MD)
- [spec/CONTRACT-SCHEMA.MD](spec/CONTRACT-SCHEMA.MD)

## Development

```bash
bun install
bun test
bun run build
```

Monorepo packages:

- `packages/core` -> `@specferret/core`
- `packages/cli` -> `@specferret/cli`
- `apps/site` -> specferret.dev

---

MIT License
