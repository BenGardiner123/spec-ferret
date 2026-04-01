### SpecFerret

## What This Project Is

SpecFerret is a spec drift detection CLI tool.
Tagline: "SpecFerret keeps your specs honest."
npm: `@specferret/cli` and `@specferret/core`
CLI command: `ferret` (short, fast, what developers type every day)
Domain: specferret.dev

---

## Read These First — Every Time

Before writing any code, read these documents in order:

```
spec/ferret-master-architecture.md     — system design, layer rules, interfaces
spec/ferret-master-implementation-plan.md — task order, code snippets, test requirements
spec/CONTRACT-SCHEMA.md                — the contract convention, JSON Schema subset
spec/ferret-master-stories.md          — acceptance criteria for every story
```

If the answer to your question is not in those four documents, the spec has a gap.
Flag it. Do not invent an answer.

---

## Live Contract Graph

`.ferret/context.json` is the live contract graph for this repo.
Read it before generating any code that touches contracts.
Treat it as ground truth over any spec file.

---

## Architecture — The Non-Negotiables

Five layers. No layer reaches into another layer's domain. Ever.

```
Store       — insert, update, query, delete. Parameterised SQL only.
              Never contains business logic or graph traversal.

Extractor   — turns a file into an ExtractionResult.
              Never talks to the store. Never knows about the graph.

Validator   — validates JSON Schema subset. Classifies breaking vs non-breaking.
              Pure function. No side effects. No I/O.

Reconciler  — BFS traversal, flags dirty nodes, returns a report.
              Never parses files. Never formats output.

CLI         — reads config, calls core, prints result, exits.
              Never contains business logic. Never does parsing or traversal.
              If a command file exceeds 50 lines, logic is in the wrong layer.
```

---

## Technology Decisions — Final

These are not open for discussion or reconsideration.

| Job                         | Tool                                      |
| --------------------------- | ----------------------------------------- |
| Spec frontmatter parsing    | `gray-matter` — synchronous, zero deps    |
| JSON Schema validation      | `ajv` + `ajv-formats`                     |
| Annotation detection        | Regex only                                |
| TypeScript shape extraction | Tree-sitter TypeScript — Phase 5 only     |
| Storage                     | SQLite default (silent), Postgres roadmap |

**Do not reach for WASM before Phase 5. If you find yourself doing this, stop.**

---

## What To Build — Right Now

Four files are ported from V1. Everything else is net new.

**Ported from V1 (with noted changes):**

```
packages/core/src/store/types.ts       + add shape_schema field to FerretContract
packages/core/src/store/sqlite.ts      + add shape_schema column and migration
packages/core/src/store/factory.ts     unchanged
packages/core/src/reconciler/index.ts  unchanged
```

**Net new — build against the spec, no other reference:**

```
packages/core/src/extractor/frontmatter.ts
packages/core/src/extractor/validator.ts
packages/core/src/context/index.ts
packages/cli/bin/commands/init.ts
packages/cli/bin/commands/scan.ts
packages/cli/bin/commands/lint.ts
packages/cli/bin/commands/reconcile.ts
packages/cli/bin/commands/status.ts
packages/cli/bin/commands/review.ts
packages/cli/bin/ferret.ts
```

---

## Build Order — Strict

Do not start a task until the previous task has passing tests.
`npm test` must be green before moving forward. Every time.

```
Task 1   store/types.ts + sqlite.ts    shape_schema field + migration
Task 2   extractor/validator.ts        JSON Schema validation + classification
Task 3   extractor/frontmatter.ts      gray-matter extraction
Task 4   config.ts                     add codeContracts field
Task 5   context/index.ts              context.json writer
Task 6   cli/commands/init.ts          V2 scaffolding
Task 7   cli/commands/scan.ts          gray-matter wired, --changed flag, context.json
Task 8   cli/commands/lint.ts          Boris output format
Task 9   index.ts                      re-exports updated
```

---

## The Performance Bar

`ferret lint` on a clean project must complete in under 500ms.

This is not a suggestion. If it fails this bar, stop and fix it before anything else ships.

---

## CLI Output Format — Required

Clean state:

```
✓ ferret  12 contracts  0 drift  9ms
```

Drift detected:

```
  ferret  3 contracts need review

  BREAKING  auth.jwt
  ├── specs/search.md          imports this directly
  ├── specs/recommendations.md imports this directly
  └── specs/analytics.md       imports this transitively (depth 2)

  NON-BREAKING  tables.document
  └── specs/search.md          optional field added — no action needed

  2 breaking  1 non-breaking

  → Run ferret review to resolve
```

Pre-commit hook:

```
ferret  checking staged files...

  BREAKING  auth.jwt shape changed
  └── 3 downstream specs need review

  commit blocked  →  run ferret review
```

---

## What Is Not Being Built Yet

Do not build these. They are roadmap.

```
ferret place          — feature placement
ferret upgrade        — SQLite to Postgres migration
ferret benchmark      — provider benchmarking
ferret audit          — bidirectional drift report
Postgres init         — Neon provisioning
Tree-sitter TypeScript — Phase 5 only
Multiple languages    — post Phase 5
```

---

## Repo Structure

```
packages/
  core/                  @specferret/core
    src/
      store/             DBStore interface + SQLite + Postgres + factory
      extractor/         frontmatter.ts, validator.ts
      reconciler/        BFS engine
      context/           context.json writer
      config.ts
      index.ts
  cli/                   @specferret/cli
    bin/
      commands/          init, scan, lint, reconcile, status, review, graph
      ferret.ts
spec/
  ferret-master-architecture.md
  ferret-master-implementation-plan.md
  ferret-master-stories.md
  CONTRACT-SCHEMA.md
CLAUDE.md
README.md
MARKETING.md
```

---

## Naming

| Context      | Name                                  |
| ------------ | ------------------------------------- |
| npm packages | `@specferret/cli`, `@specferret/core` |
| CLI command  | `ferret`                              |
| Domain       | `specferret.dev`                      |
| GitHub org   | `specferret`                          |
| Tagline      | "SpecFerret keeps your specs honest." |

---

## Testing Rules

- One test file per source module
- Tests live next to the file they test: `validator.ts` → `validator.test.ts`
- Both SQLite and Postgres implementations must pass all store tests
- The validator is a pure function — test every edge case in isolation
- `npm test` is the required test command

---

## Before You Commit

```bash
npm test          # all green
ferret lint       # exits 0, under 500ms
```

If either fails, do not commit.
