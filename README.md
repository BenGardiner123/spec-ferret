<p align="center">
  <img src="./docs/images/hero.svg" width="780" alt="SpecFerret keeps your specs honest." />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@specferret/cli"><img src="https://img.shields.io/npm/v/@specferret/cli?label=cli&color=FF6B35" alt="npm cli"></a>
  <a href="https://www.npmjs.com/package/@specferret/core"><img src="https://img.shields.io/npm/v/@specferret/core?label=core&color=FF6B35" alt="npm core"></a>
  <a href="https://www.npmjs.com/package/@specferret/cli"><img src="https://img.shields.io/npm/dm/@specferret/cli?color=blueviolet" alt="Downloads"></a>
  <img src="https://img.shields.io/badge/bun-%3E%3D1.0-F5E642?logo=bun" alt="Bun">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://specferret.dev"><img src="https://img.shields.io/badge/website-specferret.dev-FF6B35" alt="Website"></a>
</p>

<h3 align="center">SpecFerret keeps your specs honest.</h3>

<p align="center">
  A Bun-first CLI that detects contract drift before it breaks downstream consumers.<br>
  Turns markdown contracts into a dependency graph, classifies drift, and blocks unsafe changes in local dev and CI.
</p>

---

## 📢 News

- **2026-04-14** 🎉 Released **v0.3.0** — TypeScript-native `.contract.ts` format with `defineContract()`, Zod-based schemas, `ferret status` command, and automatic `.contract.ts` discovery. See [CHANGELOG](CHANGELOG.md).
- **2026-04-14** 🎉 Released **v0.2.0** — bidirectional drift enforcement (code → spec), upward drift detection in `ferret lint --ci`, `source:` blocks, and guided resolution for code-origin drift. See [CHANGELOG](CHANGELOG.md).
- **2026-04-09** 🎉 Released **v0.1.4** — agent mode scaffolding (`--agent-targets`), default tree-sitter TypeScript extraction (no annotations required), context schema versioning, diagnostics command, and perf budget hardening. See [release notes](https://github.com/BenGardiner123/spec-ferret/releases/tag/v0.1.4).
- **2026-04-04** 🎉 Released **v0.1.3** — publish-safe Bun exports, smoke-fixture hardening, and npm packages refreshed. See [release notes](https://github.com/BenGardiner123/spec-ferret/releases/tag/v0.1.3).
- **2026-03-15** 🚀 Released **v0.1.0** — initial public release. `ferret init`, `ferret scan`, `ferret lint`, `ferret review`. Full BMAD and spec-kit validation runs passing.

---

## Table of Contents

- [Key Features](#-key-features)
- [Architecture](#️-architecture)
- [Install](#-install)
- [Quick Start](#-quick-start)
- [Your First Contract](#-your-first-contract)
- [CLI Reference](#-cli-reference)
- [TypeScript-Native Contracts](#-typescript-native-contracts-v030)
- [Contract Types](#-contract-types)
- [Changelog](#-changelog)
- [How Drift Resolution Works](#-how-drift-resolution-works)
- [CI Integration](#-ci-integration)
- [BMAD & spec-kit Integration](#-bmad--spec-kit-integration)
- [Use Cases](#-use-cases)
- [Project Structure](#-project-structure)
- [Roadmap](#️-roadmap)
- [Validation Evidence](#-validation-evidence)
- [Development](#-development)
- [Star History](#-star-history)

---

## ✨ Key Features

🔍 **Drift Detection** — Parses `.contract.md` and `.contract.ts` files and detects shape changes automatically on every `ferret lint`.

💥 **Breaking vs Non-Breaking Classification** — Missing required fields and removed properties are `BREAKING`. Optional additions are `NON-BREAKING`. You know exactly what needs review.

🕸️ **Dependency Graph** — Contracts declare dependencies with `imports` (markdown) or `consumes` (TypeScript). SpecFerret computes the full direct and transitive impact graph so you know every consumer of a drifted contract.

⚡ **Fast** — `ferret lint` on a clean project completes in under 500ms. SQLite-backed, no external service.

🔒 **Pre-commit Enforcement** — `ferret init` installs a `.git/hooks/pre-commit` hook that blocks commits when breaking drift is detected.

🤖 **CI Mode** — `ferret lint --ci` exits non-zero on drift, with JSON output for downstream tooling and agents.

🛠️ **TypeScript Extraction** — `ferret extract` infers contracts from exported TypeScript declarations by default, with `// @ferret-contract:` available as an override for explicit `id` and `type`.

📜 **TypeScript-Native Contracts** — Define contracts as `.contract.ts` files using `defineContract()` and Zod schemas. Full type safety, runtime invariants, and zero markdown.

---

## 🏗️ Architecture

SpecFerret is built in five strict layers. No layer reaches into another layer's domain.

```
┌─────────────────────────────────────────────────┐
│  CLI                                            │
│  ferret.ts · init · scan · lint · review        │
│  Reads config, calls core, prints, exits.       │
│  Max 50 lines per command file.                 │
├─────────────────────────────────────────────────┤
│  Reconciler                                     │
│  BFS traversal · flags dirty nodes · report     │
│  Never parses files. Never formats output.      │
├─────────────────────────────────────────────────┤
│  Validator                                      │
│  JSON Schema subset · breaking / non-breaking   │
│  Pure function. No side effects. No I/O.        │
├─────────────────────────────────────────────────┤
│  Extractor                                      │
│  .contract.md (gray-matter) + .contract.ts      │
│  Never talks to the store or the graph.         │
├─────────────────────────────────────────────────┤
│  Store                                          │
│  SQLite (default) · Postgres (roadmap)          │
│  Parameterised SQL only. No business logic.     │
└─────────────────────────────────────────────────┘
```

---

## 📦 Install

**Global install (recommended)**

```bash
bun install -g @specferret/cli
```

**Verify**

```bash
ferret --version
```

> [!TIP]
> Bun 1.0 or later is required. Install it at [bun.sh](https://bun.sh).

**Install `@specferret/core` as a library**

```bash
bun add @specferret/core
# or
npm install @specferret/core
```

Use `@specferret/core` directly when you want to integrate the extractor, validator, or reconciler into your own tooling or agent workflow.

---

## 🚀 Quick Start

**1. Install**

```bash
bun install -g @specferret/cli
```

**2. Initialise your project**

```bash
cd your-project
ferret init
```

This creates `.ferret/` state, `ferret.config.json`, and installs a pre-commit hook.

> [!TIP]
> Use `ferret init --no-hook` to skip the pre-commit hook.

**3. Bootstrap contracts (choose one path)**

Manual contract-first path:

```bash
mkdir -p contracts
```

Code-first TypeScript path:

```bash
ferret extract
```

`ferret extract` uses Tree-sitter to infer contracts from exported TypeScript declarations and scaffolds deterministic `.contract.md` files with no annotations required. `@ferret-contract` remains supported as a compatibility override for explicit `id` and `type`.

Example summary from inferred extraction:

```text
ferret extract  created=7  updated=0  skipped=0  failed=0  inferred=12  annotated=2  143ms
```

**4. Lint (default daily command)**

```bash
ferret lint
```

`ferret lint` runs scan/reconcile checks and reports drift. Use `ferret scan` directly for advanced/manual graph refresh workflows.

Clean output:

```text
✓ ferret  12 contracts  0 drift  9ms
```

Drift detected:

```text
  ferret  3 contracts need review

  BREAKING  auth.jwt
  ├── contracts/search.contract.md          imports this directly
  ├── contracts/recommendations.contract.md imports this directly
  └── contracts/analytics.contract.md       imports this transitively (depth 2)

  NON-BREAKING  tables.document
  └── contracts/search.contract.md          optional field added — no action needed

  2 breaking  1 non-breaking

  → Run ferret review to resolve
```

**5. Resolve**

```bash
ferret review
```

---

## 📝 Your First Contract

Create a file under `contracts/` with a `ferret:` frontmatter block:

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

Then run:

```bash
ferret lint
```

Now change `required: [id, email]` to `required: [id]` — removing `email` from required — and run lint again to see breaking drift detected.

<details>
<summary><b>Contract with imports (dependency)</b></summary>

Declare that one contract depends on another using `imports`:

```markdown
---
ferret:
  id: api.POST/search
  type: api
  imports:
    - auth.jwt
  shape:
    type: object
    properties:
      query:
        type: string
      results:
        type: array
    required: [query, results]
---

# POST /search

Authenticated search endpoint. Depends on the JWT auth contract.
```

Now if `auth.jwt` shape changes, `api.POST/search` is flagged as an impacted consumer.

</details>

<details>
<summary><b>Code-first: extract contracts from TypeScript</b></summary>

SpecFerret extracts contracts from TypeScript by default, so no annotations are required for normal workflows. Use `@ferret-contract` only when you need an explicit `id` or `type` override:

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

This scaffolds `.contract.md` files under `contracts/` using deterministic mapping. Summary output includes `created=<n>`, `updated=<n>`, `skipped=<n>`, and `failed=<n>`. The command exits non-zero for hard extraction errors, when `--perf-budget-ms` is exceeded, and with exit code `2` when `--perf-budget-ms` is invalid.

Inferred output example:

```text
ferret extract  created=5  updated=1  skipped=0  failed=0  inferred=5  annotated=1  87ms
```

Migration from annotation-first repositories:

1. Keep existing `@ferret-contract` annotations in place initially.
2. Run `ferret extract` and verify generated ids/types match expected contracts.
3. Remove annotations incrementally where inferred ids/types are already correct.
4. Retain annotations only for files that need explicit overrides.

Mixed repository mode is fully supported: inferred and annotated contracts can coexist in the same run.

</details>

---

## 💻 CLI Reference

| Command                  | Purpose                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `ferret init`            | Scaffold `.ferret/` state, config, and pre-commit hook                       |
| `ferret init --no-hook`  | Scaffold without installing the pre-commit hook                              |
| `ferret scan`            | Parse contracts and refresh `.ferret/context.json`                           |
| `ferret lint`            | Detect and classify contract drift                                           |
| `ferret lint --ci`       | CI mode — JSON output, exits non-zero on drift                               |
| `ferret review`          | Resolve blocking drift interactively                                         |
| `ferret review --json`   | Emit versioned review JSON with suggested actions and dependency context     |
| `ferret extract`         | Generate contracts from exported TypeScript (annotation override compatible) |
| `ferret status`          | Report current contract drift state (read-only)                              |
| `ferret status --json`   | Machine-readable status JSON (always exits 0)                                |
| `ferret status --export` | Write STATUS.md to the project root                                          |
| `ferret diagnostics`     | Print import graph diagnostics                                               |

<details>
<summary><b>Pre-commit hook behaviour</b></summary>

`ferret init` writes `.git/hooks/pre-commit` (when `.git/hooks/` exists).

When you `git commit`, the hook runs `ferret lint`. If breaking drift is detected, the commit is blocked:

```text
ferret  checking staged files...

  BREAKING  auth.jwt shape changed
  └── 3 downstream contracts need review

  commit blocked  →  run ferret review
```

Fix drift with `ferret review`, re-stage, and commit again.

</details>

<details>
<summary><b>ferret lint output formats</b></summary>

**Default (human-readable)**

```text
✓ ferret  12 contracts  0 drift  9ms
```

**CI mode (`--ci`)**

Exits with code `1` when drift exists. Emits a JSON summary to stdout for downstream tools:

```json
{
  "drift": true,
  "breaking": 2,
  "nonBreaking": 1,
  "diagnosticsSchemaVersion": "1.0.0",
  "diagnostics": [
    {
      "code": "FERRET_DRIFT_BREAKING",
      "severity": "error",
      "message": "auth.jwt impacts contracts/search/results.contract.md (direct, depth 1).",
      "location": {
        "contractId": "auth.jwt",
        "filePath": "contracts/search/results.contract.md",
        "depth": 1,
        "impact": "direct"
      },
      "remediation": "Run ferret review and resolve downstream drift before merge."
    }
  ],
  "contracts": [...]
}
```

Machine-readable diagnostics contract:

- `diagnosticsSchemaVersion` identifies the stable diagnostics schema version for parsers
- `diagnostics[].code` is a stable machine key (safe for switch/case routing)
- `diagnostics[].severity` is one of `error`, `warning`, or `info`
- `diagnostics[].location` carries file/contract/node/import context when available
- `diagnostics[].remediation` is human-readable guidance for safe resolution

Parsing guidance:

- Branch your parser by `diagnosticsSchemaVersion` first
- Treat unknown `code` values as forward-compatible and fall back to `message`
- Prefer `code + location` for automation and `remediation` for user-facing hints

Reference sample payloads:

- `docs/ci-templates/ferret-lint-ci-sample.json`
- `docs/ci-templates/ferret-review-json-sample.json`

End-to-end agent example (`ferret review --json`):

1. Run `ferret lint --ci` and collect diagnostics.
2. If drift is detected, run `ferret review --json`.
3. For each `reviewable[]` item:

- Use `suggestedActions[]` ordered by `confidence` to pick a default action.
- Use `dependencyContext.directDependents` and `dependencyContext.transitiveDependents` to scope impacted files.

4. Apply the selected action with `ferret review --contract <id> --action <accept|update|reject> --json`.
5. Re-run `ferret lint --ci` and confirm `consistent: true` before merge.

</details>

---

## � TypeScript-Native Contracts (v0.3.0)

Instead of markdown frontmatter, define contracts directly in TypeScript with full type safety:

```ts
// contracts/auth.contract.ts
import { z } from 'zod';
import { defineContract } from '@specferret/core';

export const jwtPayload = defineContract({
  id: 'auth.jwt',
  value: 'JWT authentication payload',
  output: {
    sub: z.string(),
    email: z.string().email(),
    role: z.enum(['admin', 'user', 'viewer']),
    iat: z.number(),
  },
  invariants: [(r) => r.role !== ''],
  status: 'active',
});
```

**Why `.contract.ts`?**

- **`tsc` enforces your contract** — shape errors are compile errors, not runtime surprises
- **Zod schemas** — converted to JSON Schema automatically via `zod-to-json-schema`
- **Runtime invariants** — typed functions, not text descriptions
- **`consumes` references** — object references, not string IDs. Upstream shape changes break downstream contracts at compile time

**Using it:**

```bash
# .contract.ts files are discovered automatically — no config needed
ferret lint

# Disable if needed:
# ferret.config.json → "contractParsers": { "typescript": false }
```

Both `.contract.md` and `.contract.ts` work in the same project. Mixed format is fully supported.

<details>
<summary><b>Contract with consumes (typed dependency)</b></summary>

```ts
// contracts/search.contract.ts
import { z } from 'zod';
import { defineContract } from '@specferret/core';
import { jwtPayload } from './auth.contract.js';

export const searchResults = defineContract({
  value: 'Search results endpoint',
  output: {
    query: z.string(),
    results: z.array(z.object({ id: z.string(), title: z.string() })),
  },
  consumes: [jwtPayload],
});
```

The `consumes` reference is resolved by object identity — no string matching. If `jwtPayload` changes shape, `searchResults` is flagged as impacted.

</details>

<details>
<summary><b>Check contract status</b></summary>

```bash
ferret status
```

```text
ferret status  12 contracts

  stable        10
  needs-review   2

  NEEDS REVIEW
  auth.jwt          breaking — 3 dependents
  tables.document   non-breaking — 1 dependent
```

Machine-readable: `ferret status --json`
Export to markdown: `ferret status --export` (writes `STATUS.md`)

</details>

---

## �📐 Contract Types

| Type     | Use for                                          |
| -------- | ------------------------------------------------ |
| `api`    | REST endpoints, GraphQL operations, RPC methods  |
| `table`  | Database tables, collections, document schemas   |
| `type`   | Shared TypeScript types, interfaces, enums       |
| `event`  | Domain events, webhooks, message queue payloads  |
| `flow`   | User flows and multi-step process contracts      |
| `config` | Configuration shapes, environment schemas, flags |

Each type uses the same frontmatter convention. The `type` field is used for grouping and reporting.

Type semantics are strict at runtime:

- `ferret.type` must be exactly one of: `api`, `table`, `type`, `event`, `flow`, `config`
- Unknown values are rejected during extraction with an error that lists allowed values
- Custom type namespaces are not currently supported as runtime extensions

Extension model:

- If a contract does not fit one of the six core types, use the closest core type and open an issue for model expansion

Migration note for legacy repos:

- Replace legacy values like `schema`, `service`, or `model` with the closest supported core type before running `ferret scan` or `ferret lint`

---

## 🗒 Changelog

See [CHANGELOG.md](CHANGELOG.md) for versioned changes and migration notes.

---

## 🔄 How Drift Resolution Works

When `ferret lint` detects drift it classifies every violation:

| Classification | Trigger                                        | Action required           |
| -------------- | ---------------------------------------------- | ------------------------- |
| `BREAKING`     | Required field removed, property type changed  | Must resolve before merge |
| `NON-BREAKING` | Optional field added, description changed only | No action required        |

The impact report shows:

- The drifting contract id and source file
- Every downstream contract that `imports` it — direct and transitive
- Depth of the transitive chain

Run `ferret review` to step through each breaking drift, choose an action (accept / update / reject), and write resolution notes back to the contract file.

<details>
<summary><b>End-to-end agent loop (`ferret review --json`)</b></summary>

1. Ask your agent to run:

```bash
ferret review --json
```

2. Agent reads each review item and prioritizes `suggestedActions` by `confidence`.
3. Agent uses `dependencyContext` and the direct/transitive `impact` lists to update downstream files in blast-radius order.
4. Agent re-runs:

```bash
ferret lint --ci
```

5. If clean, agent proceeds with commit/PR. If drift remains, it repeats the review loop with the new JSON payload.

</details>

---

## 🧪 CI Integration

**Minimal GitHub Actions step (reusable action)**

```yaml
- name: SpecFerret CI
  uses: BenGardiner123/action@v1
  with:
    baseline-mode: committed
```

**Full job example**

```yaml
jobs:
  ferret:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: SpecFerret CI
        uses: BenGardiner123/action@v1
        with:
          baseline-mode: committed
          artifact-name: ferret-lint-ci
```

Starter templates:

- `docs/ci-templates/ferret-action-single-package.yml`
- `docs/ci-templates/ferret-action-monorepo.yml`
- `docs/ci-templates/ferret-action-pr-only.yml`

> [!TIP]
> Commit `.ferret/context.json` to your repo. The default `--ci-baseline committed` mode reads from it, so CI passes on the first run without a rebuild step.

**Baseline modes**

| Mode                      | When to use                                 |
| ------------------------- | ------------------------------------------- |
| `--ci-baseline committed` | Default. Requires committed `context.json`. |
| `--ci-baseline rebuild`   | Ephemeral runners or fresh checkouts.       |

---

## 🤝 BMAD & spec-kit Integration

SpecFerret is not a planning tool. It enforces contract consistency downstream of planning tools.

If you use [BMAD](https://github.com/bmadcode/BMAD-METHOD) or [spec-kit](https://github.com/speckit):

1. Produce PRD, architecture, and stories as usual
2. Capture concrete shapes in `.contract.md` files under `contracts/`
3. Run `ferret lint` to validate and enforce consistency across the team

**Example repo layout**

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
    api/
      get-users.contract.md
  .ferret/
    context.json
  ferret.config.json
```

> [!TIP]
> Ask your AI agent to `ferret lint --ci` as a sub-step whenever it generates or edits code that might touch a contract boundary. This catches AI-introduced drift before it reaches review.

---

## 💡 Use Cases

<details>
<summary><b>API teams preventing breaking changes</b></summary>

Map every REST endpoint, GraphQL operation, or RPC method to a `.contract.md` file. Declare which other contracts import each API surface. When a shape change breaks a required field on a consumer, `ferret lint` catches it in seconds — not days.

</details>

<details>
<summary><b>Multi-team monorepos</b></summary>

Teams working in the same repo often change shared types without realising the downstream blast radius. SpecFerret's dependency graph shows every contract that transitively depends on a changed type — and blocks the commit until drift is resolved or accepted.

</details>

<details>
<summary><b>AI-assisted development</b></summary>

AI code generation accelerates implementation but outpaces documentation. Add `ferret lint --ci` to your CI pipeline so that every AI-generated PR is checked for contract drift. Use `ferret review --json` to feed the impact report back to your agent for automated resolution.

</details>

<details>
<summary><b>Schema governance</b></summary>

Long-lived product surfaces — database tables, event payloads, config shapes — drift over years. SpecFerret's SQLite graph persists the contract state so you always have a before/after diff of every shape change, not just a snapshot.

</details>

---

## 📁 Project Structure

```
specferret/
├── packages/
│   ├── core/               @specferret/core
│   │   └── src/
│   │       ├── store/      # DBStore interface · SQLite · Postgres · factory
│   │       ├── extractor/  # frontmatter.ts · validator.ts · hash.ts
│   │       ├── reconciler/ # BFS engine — dirty node flagging
│   │       ├── context/    # context.json writer
│   │       ├── config.ts   # project config loader
│   │       └── index.ts    # public re-exports
│   └── cli/                @specferret/cli
│       └── bin/
│           ├── commands/   # init · scan · lint · review · extract · status
│           └── ferret.ts   # CLI entrypoint
├── apps/
│   └── site/               specferret.dev (Astro)
├── spec/                   Architecture, stories, contract schema
├── docs/                   Quickstart, demo runbook, images
└── scripts/                Build helpers
```

---

## 🛣️ Roadmap

PRs welcome. The codebase is intentionally small and readable.

- [ ] **Postgres store** — production-grade persistence without SQLite
- [ ] **`ferret audit`** — bidirectional drift report across all contracts
- [ ] **`ferret upgrade`** — SQLite → Postgres migration command
- [ ] **`ferret place`** — AI-powered feature placement against the graph
- [ ] **`ferret benchmark`** — provider benchmarking for AI-assisted review
- [x] **GitHub Action adoption (Sprint 6)** — one-line CI enforcement via `uses: BenGardiner123/action@v1`
- [x] **Upward code-to-spec drift (Sprint 7)** — catch implementation drift when specs are not updated
- [x] **TypeScript-native contracts (Sprint 8)** — `.contract.ts` with `defineContract()`, Zod schemas, `ferret status`
- [x] **Tree-sitter extraction** — TypeScript shape extraction without annotations (shipped)
- [ ] **Multi-language support** — Go, Python, OpenAPI (post Phase 5)
- [ ] **Hosted dashboard** — team-wide contract health, analytics, SSO/RBAC
- [x] **Branch-matrix dogfooding (Sprint 5)** — scenario branches across spec-kit and BMAD validation repos

See [spec/ROADMAP.MD](spec/ROADMAP.MD) for the full plan.

---

## ✅ Validation Evidence

Latest validated evidence (post explicit S40/S41/S42 assertions):

| Validation          | Link                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| spec-kit matrix run | [actions/runs/23962649755](https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/23962649755) |
| BMAD matrix run     | [actions/runs/23962652352](https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/23962652352)      |

Release evidence (v0.1.3 publish window):

| Validation                      | Link                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| spec-kit validation run         | [actions/runs/23962649755](https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/23962649755) |
| BMAD validation run             | [actions/runs/23962652352](https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/23962652352)      |
| `@specferret/core@0.1.3` on npm | [npmjs.com/package/@specferret/core](https://www.npmjs.com/package/@specferret/core)                                   |
| `@specferret/cli@0.1.3` on npm  | [npmjs.com/package/@specferret/cli](https://www.npmjs.com/package/@specferret/cli)                                     |

Sprint 5 expands this from a single smoke path to a branch matrix.
Operational details live in [spec/GA-VALIDATION-REPOS.MD](spec/GA-VALIDATION-REPOS.MD) and [spec/GA-VALIDATION-RUNBOOK.MD](spec/GA-VALIDATION-RUNBOOK.MD).

---

## 🛠️ Development

```bash
bun install
bun test
bun run build
```

**Performance benchmark guardrails**

Use explicit performance budgets when validating contributor changes:

```bash
# Lint clean-run budget (project baseline target)
ferret lint --perf-budget-ms 500

# Extract runtime budget (tune per fixture/repo size in CI)
ferret extract --perf-budget-ms 1000
```

If a budget is exceeded, the command exits non-zero and prints an actionable diagnostic.

**Documentation safety rule**

- Never include PII or secrets in docs, contracts, runbooks, screenshots, logs, or release evidence.
- Always use synthetic placeholders (for example `user@example.test`, `REDACTED_TOKEN`).
- Redact sensitive values before commit.

**Monorepo packages**

| Package                  | Path            | npm                                                                                                     |
| ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------- |
| `@specferret/core`       | `packages/core` | [![npm](https://img.shields.io/npm/v/@specferret/core)](https://www.npmjs.com/package/@specferret/core) |
| `@specferret/cli`        | `packages/cli`  | [![npm](https://img.shields.io/npm/v/@specferret/cli)](https://www.npmjs.com/package/@specferret/cli)   |
| `specferret.dev` (Astro) | `apps/site`     | —                                                                                                       |

**Docs**

- [docs/QUICKSTART.md](docs/QUICKSTART.md)
- [spec/MASTER-ARCHITECTURE.MD](spec/MASTER-ARCHITECTURE.MD)
- [spec/CONTRACT-SCHEMA.MD](spec/CONTRACT-SCHEMA.MD)
- [spec/ROADMAP.MD](spec/ROADMAP.MD)

---

## ⭐ Star History

<div align="center">
  <a href="https://star-history.com/#BenGardiner123/spec-ferret&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=BenGardiner123/spec-ferret&type=Date&theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=BenGardiner123/spec-ferret&type=Date" />
      <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=BenGardiner123/spec-ferret&type=Date" style="border-radius: 12px;" />
    </picture>
  </a>
</div>

---

<p align="center">
  <sub>MIT License · <a href="https://specferret.dev">specferret.dev</a> · "SpecFerret keeps your specs honest."</sub>
</p>
