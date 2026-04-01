# SpecFerret — Sprint 1 Implementation Plan

Generated: March 2026
Status: Sprint 1 complete.
See ROADMAP.MD for Sprint 2 and beyond. See SPRINT-1-STORIES.MD for engineering stories.

Runtime: Bun 1.0+
Test runner: `bun test`
Install: `bun install -g @specferret/cli`

---

## Technology Decisions — Final

Boris and Todd approved. Not open for reconsideration.

| Job | Tool | Reason |
|---|---|---|
| Runtime | Bun 1.0+ | Performance, native SQLite, TypeScript native, Claude Code alignment |
| Spec frontmatter parsing | `gray-matter` | Synchronous, proven, zero deps, no WASM, no build step |
| JSON Schema validation | `ajv` + `ajv-formats` | Proven. 50M weekly downloads. |
| Schema hashing | `node:crypto` SHA-256 | Built-in, deterministic, fast |
| Storage — default | `bun:sqlite` | Built-in to Bun, synchronous, zero deps |
| Storage — roadmap | Postgres via `DBStore` interface | Sprint 2 |
| Annotation detection | Regex | Sprint 3. Predictable pattern. No parser needed. |
| Code shape extraction | Tree-sitter TypeScript | Sprint 3. The one job needing a real AST parser. |
| Test runner | `bun test` | Native to runtime, fast, no config |

**SpecFerret is a CLI. It runs natively on Bun. Never use the WASM build of Tree-sitter — that is for browsers. Use the native binding in Sprint 3.**
**No LLM in the default path. Ever.**

---

## Monorepo Structure

```
packages/
  core/                        @specferret/core
    src/
      store/                   DBStore interface, bun:sqlite, Postgres stub, factory
      extractor/               frontmatter.ts, validator.ts, hash.ts
      reconciler/              BFS engine
      context/                 context.json writer
      config.ts
      index.ts
    package.json
    tsconfig.json
    tsconfig.build.json
  cli/                         @specferret/cli
    bin/
      commands/                init.ts, scan.ts, lint.ts
      ferret.ts
    package.json
    tsconfig.json
    tsconfig.build.json
package.json                   workspace root
bun.lock
README.md
LICENSE
.github/
  workflows/
    ci.yml
    publish.yml
```

---

## Sprint 1 — Complete

All tasks built, tested, and committed.
62 tests passing. `ferret lint` at 11ms wall clock on a clean project.
Performance gate cleared. npm publish pipeline in place.

---

### Task 1 — Store Layer ✓

`packages/core/src/store/types.ts` — `FerretContract` interface with `shape_schema` field.
`packages/core/src/store/sqlite.ts` — `bun:sqlite` implementation, `shape_schema` column, migration.
`packages/core/src/store/factory.ts` — returns correct store based on environment.
`packages/core/src/store/postgres.ts` — Sprint 2 stub. Throws on any call.

**Key interface:**
```typescript
export interface FerretContract {
  id: string;
  node_id: string;
  shape_hash: string;    // SHA-256 of key-sorted schema — quick diff
  shape_schema: string;  // JSON.stringify of schema object — comparison
  type: string;
  status: ContractStatus;
}
```

**SQLite schema:**
```sql
CREATE TABLE IF NOT EXISTS ferret_contracts (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  shape_hash TEXT NOT NULL,
  shape_schema TEXT NOT NULL DEFAULT '{}',
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES ferret_nodes(id)
);
```

Tests: `packages/core/src/store/sqlite.test.ts`

---

### Task 2 — Validator ✓

`packages/core/src/extractor/validator.ts`

Pure function. No I/O. No side effects. Ever.

- `validateFerretSchema(shape, filePath)` — warns on unsupported keywords, never throws
- `compareSchemas(previous, current)` — returns `breaking | non-breaking | no-change` with reason
- Nested schemas (`response:`, `items:`) compared recursively
- Non-breaking results bubble up correctly from nested comparisons
- Property order changes are no-ops — keys sorted before comparison

Tests: `packages/core/src/extractor/validator.test.ts`

---

### Task 3 — Frontmatter Extractor ✓

`packages/core/src/extractor/frontmatter.ts`

Synchronous only. No async. No await. Anywhere in this file.

- Extracts `id`, `type`, `shape`, `imports` from YAML frontmatter via `gray-matter`
- No frontmatter → returns `warning: 'no-frontmatter'`, empty contracts, does not throw
- Missing required field → throws with field name(s) in message
- Unsupported schema keyword → warns to stderr, continues
- Returns `ExtractionResult` — same interface as Tree-sitter will return in Sprint 3
- Extractor never calls the store

`packages/core/src/extractor/hash.ts` — `hashSchema(schema)` — SHA-256 of key-sorted JSON.

Tests: `packages/core/src/extractor/frontmatter.test.ts`

---

### Task 4 — Config ✓

`packages/core/src/config.ts`

```typescript
export interface FerretConfig {
  specDir: string;
  filePattern: string;
  includes?: string[];
  store: 'sqlite' | 'postgres';
  codeContracts?: {
    include: string[];
    watchNodes?: string[];
  };
}

export const DEFAULT_CONFIG: FerretConfig = {
  specDir: 'specs/',
  filePattern: '**/*.md',
  includes: ['**/*.md'],
  store: 'sqlite',
};
```

---

### Task 5 — Context Writer ✓

`packages/core/src/context/index.ts`

Auto-generates `.ferret/context.json` at the end of every `ferret scan`.
No separate command. Silent. If write fails, logs to stderr and continues.

```typescript
export interface FerretContext {
  version: '2.0';
  generated: string;       // ISO timestamp
  contracts: ContextContract[];
  edges: ContextEdge[];
  needsReview: string[];   // contract IDs currently flagged
}
```

Tests: `packages/core/src/context/index.test.ts`

---

### Task 6 — ferret init ✓

`packages/cli/bin/commands/init.ts`

- Creates `.ferret/graph.db` silently — no prompt
- Creates `specs/` directory
- Writes `specs/example.md` with valid frontmatter template
- Writes `ferret.config.json` with correct defaults
- Writes `CLAUDE.md` with `context.json` instruction
- Pre-commit hook prompt — opt-in, defaults to no
- Idempotent — running twice does not overwrite existing files

---

### Task 7 — ferret scan ✓

`packages/cli/bin/commands/scan.ts`

- Reads all `.md` files under `specDir` matching `filePattern`
- Skips files with unchanged hash (no `--force`)
- `--force` bypasses file-hash gate, forces schema comparison
- Classifies changes: `breaking | non-breaking | no-change`
- Prints `BREAKING` or `NON-BREAKING` lines for changed contracts
- Files with no frontmatter print warning to stderr and are skipped cleanly
- Writes `.ferret/context.json` automatically after every scan

---

### Task 8 — ferret lint ✓

`packages/cli/bin/commands/lint.ts`

- Runs scan, then reconcile, then reports drift status
- Clean project: `✓ ferret  N contracts  0 drift  Xms` — exits 0
- Drifting project: drift tree output — exits 1
- `--ci`: JSON to stdout, zero ANSI codes, exits 1 on drift
- Performance gate: under 500ms on clean project. Hard gate, not a target.

**CI JSON output shape:**
```json
{
  "version": "2.0",
  "consistent": true,
  "breaking": 0,
  "nonBreaking": 0,
  "flagged": [],
  "timestamp": "2026-03-01T00:00:00.000Z"
}
```

---

### Task 9 — Public API ✓

`packages/core/src/index.ts`

```typescript
export * from './extractor/frontmatter.js';
export * from './extractor/validator.js';
export * from './extractor/hash.js';
export * from './context/index.js';
export * from './store/types.js';
export * from './store/sqlite.js';
export * from './store/factory.js';
export * from './reconciler/index.js';
export * from './config.js';
export * from './utils/paths.js';
```

---

## Verification — All 8 Steps Passed

```
1. bun test
   ✓ 62 tests passing across all layers

2. ferret init in a fresh directory
   ✓ specs/example.md created with correct frontmatter
   ✓ ferret.config.json created
   ✓ CLAUDE.md created
   ✓ .ferret/graph.db created silently

3. ferret scan on specs/example.md
   ✓ Extracts contracts correctly via gray-matter
   ✓ .ferret/context.json written automatically

4. Edit specs/example.md — remove a required field
   ✓ ferret scan classifies as breaking
   ✓ BREAKING printed to stdout

5. Edit specs/example.md — add an optional field
   ✓ ferret scan classifies as non-breaking
   ✓ NON-BREAKING printed to stdout

6. ferret lint — clean project
   ✓ exits 0
   ✓ ✓ ferret  N contracts  0 drift  11ms
   ✓ Under 500ms gate

7. ferret scan — file with no frontmatter
   ✓ Warning to stderr
   ✓ Scan completes, exits 0
   ✓ Does not crash

8. ferret lint --ci — with breaking drift
   ✓ exits 1
   ✓ JSON to stdout
   ✓ Zero ANSI codes
```

---

## Sprint 2 — Roadmap

Do not build these in Sprint 1.

| Task | Description |
|---|---|
| S09 | Postgres store implementation — `FERRET_DATABASE_URL` wiring |
| S10 | SQLite → Postgres migration |
| S11 | `ferret upgrade` command |

---

## Sprint 3 — Roadmap

| Task | Description |
|---|---|
| S12 | Tree-sitter TypeScript shape extraction |
| S13 | `@ferret-contract` annotation scanning via regex |
| S14 | Code-to-spec contract linking, upward BFS drift detection |
| S15 | `ferret place` command |
| S16 | `ferret status` command |
| S17 | `ferret graph` command |
| S18 | Full import integrity enforcement (unresolved, self-import, circular) |

---

## Sprint 4 — Roadmap

| Task | Description |
|---|---|
| S19 | `ferret audit` — bidirectional drift report |
| S20 | `ferret review` — interactive resolution flow |
| S21 | Deleted contract lifecycle handling |
| S22 | Extended lifecycle: roadmap status propagation |

---

## V3 — Sebastian's Vision

Built on the JSON Schema foundation from Sprint 1.
Revisit when there are real users and real data.

- Rust transpiler
- Additional language grammars
- Full JSON Schema support (`$ref`, `allOf`, composition)

---

## Marketing Decisions — Final

Maria approved.

| Decision | Value |
|---|---|
| **Tagline** | "SpecFerret keeps your specs honest." |
| **Domain** | `specferret.dev` ✓ `ferretout.dev` ✓ |
| **npm packages** | `@specferret/cli` and `@specferret/core` |
| **CLI command** | `ferret` |
| **Install** | `bun install -g @specferret/cli` |
| **HN Post title** | "I built a tool that stops AI coding assistants from confidently building the wrong thing" |
| **HN timing** | Tuesday 9am Eastern. Ben posts personally. Answers every comment. |
| **Badge** | `[![SpecFerret](https://img.shields.io/badge/spec--drift-protected-green)](https://specferret.dev)` |
| **Distribution** | Claude Code + Cursor starter templates. One integration > 1000 blog posts. |
| **We do not** | Run ads. Describe ourselves as AI-powered. We are the thing that keeps AI honest. |

---

*© Laser Unicorn — MIT License*