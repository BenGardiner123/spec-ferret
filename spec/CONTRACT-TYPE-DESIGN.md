# Contract Type Design

For `@specferret/core` — v0.3.0

---

## Context — why this document exists

This came out of an ideas workshop on 2026-04-12. The full context is
captured here so that any agent or developer picking this up doesn't
need to reconstruct it.

---

## Where SpecFerret is right now

SpecFerret v0.2.0, Sprint 7 complete, gate G9.

What is built and shipped:

- `ferret init` — scaffolds contracts/, .ferret/graph.db, pre-commit hook, agent rules
- `ferret scan` — gray-matter extraction, breaking/non-breaking classification
- `ferret lint` — scan + reconcile, Boris output, --ci JSON, --perf-budget-ms
- `ferret extract` — Tree-sitter TypeScript extraction, no annotations required, inferred IDs
- `ferret review` — interactive resolution, upward drift context, --json mode
- `ferret diagnostics` — import graph diagnostics
- Bidirectional drift enforcement — spec→code AND code→spec both live
- `source:` blocks — links code artifacts to contracts
- `context.json` — auto-generated on every scan, versioned, auto-migrating

What is NOT built:

- `ferret status` command (Sprint 3 roadmap — needed for v0.3.0)
- `ferret graph` command
- `ferret place` command
- Postgres store implementation
- `.contract.ts` format support (this document)

Contract format today: `.contract.md` with YAML frontmatter.
No users exist yet. Zero migration cost.

---

## The ideas workshop — what was decided

### Value Driven Development (VDD)

The core insight: every spec methodology ever built was designed around
human cognitive limits. ADRs exist because humans forget decisions.
Stories exist because humans need to negotiate shared understanding.
LLMs don't have those problems.

VDD flips the model. Instead of writing a spec that describes what the
system should do, you declare the output — what the system must produce
for the user. Everything between that declaration and a passing build is
the machine's problem.

The human's total input is a sentence. There are only two failure modes:

1. Build failure — ferret catches it, agent fixes it, loop continues.
   No human needed.
2. Contract failure — the meat stick described the wrong value. Human
   amends the contract. Agent rebuilds.

The meat stick is a commissioning client, not a participant in the build.

### The Warren — the VDD toolchain

Four tools in a mustelid family:

```
kit     — intake: sentence → .contract.ts
           LLM call, runs once per feature
           The prompt template IS the product

otter   — inference: contract → inferred spec
           Static analysis first, LLM as fallback only
           Walks the codebase to infer inputs, deps, invariants

ferret  — enforcement: deterministic, zero LLM, blocks commits
           This is SpecFerret. Warren consumes it as a peer dep.
           Warren does not own or reimplement ferret.

badger  — production drift: watches live output against contract
           Zero tokens. Pure code. Runs continuously.
           Uses Zod .safeParse() against live output.
```

The full agentic loop:

```
meat stick: "I want X"
    ↓
kit     → generates .contract.ts
    ↓
otter   → infers inputs, deps, invariants from contract
    ↓
agent   → builds toward contract
    ↓
tsc     → structural enforcement (free, runs on save)
    ↓
ferret scan → invariant + value coverage enforcement
    ↓
PASS → ship
FAIL → agent reads structured violation, rebuilds (no human)
    ↓
badger  → watches production output continuously
```

### Architecture principle: server ticks, not tokens

Every loop iteration that can be resolved by running code must be.
Tokens are expensive, slow, and non-deterministic. Code is cheap, fast,
and deterministic.

The token budget for a full feature:

```
kit intake:               ~1,000 tokens (once, at commission time)
otter inference:          ~500 tokens   (once, novel deps only)
build loop violations:    0 tokens      (deterministic patch library)
                       or ~200 tokens   (novel violation, LLM fallback)
ferret scan:              0 tokens      (always)
badger drift detection:   0 tokens      (always)
```

The patch library — deterministic violation-to-fix mappings — grows
across projects. The system gets cheaper every time it runs.

### Why .contract.ts instead of .contract.md

The existing `.contract.md` format (YAML frontmatter in markdown) was
designed for human readability and spec-kit compatibility. Neither of
those constraints apply to Warren.

Why TypeScript is the right lingua franca:

- LLMs generate TypeScript more reliably than YAML
- tsc enforces structural drift for free — the compiler is an enforcer
- Zod schemas are executable validators, not declarative strings
- Invariants are functions, not text — they run, they don't just describe
- A .contract.ts file can import other .contract.ts files — if an
  upstream contract changes shape, tsc breaks the downstream contract
  before ferret even runs
- It's documentation that bites

TypeScript as a foreign contract format in non-TypeScript repos is not
a concession. An OpenAPI spec in a Python repo is YAML. Nobody complains.
The contract is not the implementation. It's the spec. TypeScript is the
best language for specs that machines can check.

`.contract.md` is not deprecated. It stays supported. New contracts —
especially Warren-generated contracts — are `.contract.ts` from this
point forward. The ecosystem converges over time without a migration cliff.

### Warren repo structure

SpecFerret stays as its own npm package and repo. Warren is a separate
monorepo. Warren consumes `@specferret/core` and the ferret CLI as
peer dependencies. Warren owns kit, otter, and badger. Warren does not
own or fork ferret.

Published surface: single `@warren/cli` package. Kit, otter, and badger
are subcommands, not separate packages.

### Build order (agreed)

```
1. SpecFerret v0.3.0
   - Define Contract type + defineContract helper (this document)
   - Build extractFromContractFile (this document)
   - Build ferret status command
   - Support .contract.ts in ferret.config.json

2. Warren launchpad repo
   - Monorepo scaffold
   - CLAUDE.md
   - .spec/ gates as .contract.ts files
   - CI: tsc → ferret scan → bun test
   - STATUS.md generated by ferret status --export

3. Hand-write real contracts
   - Tiller, SecondStay, directory sites
   - 20-30 contracts minimum
   - Pattern-match: what questions always need asking,
     what invariants LLMs miss, what value statements are ambiguous

4. Build kit FROM the corpus
   - The prompt template is the product
   - The code around it is trivial
   - Do not build kit before the patterns are clear

5. otter, then badger
```

### Why kit is last, not first

Kit's job is to turn a sentence into a correct, enforceable contract.
If kit generates a bad contract, everything downstream is wrong — otter
infers incorrectly, the agent builds the wrong thing, ferret enforces
the wrong shape, badger watches the wrong output.

Every other tool in the stack has a hard quality signal: tsc fails,
ferret scan fails, tests fail, badger flags drift. Kit's quality signal
is fuzzy: "did the meat stick get what they meant?" That's a product
design problem, not a code problem.

The corpus of hand-written contracts is what makes kit possible. The
prompt template emerges from the patterns. Never guess at it from first
principles.

---

## What v0.3.0 needs (full checklist)

- [ ] Define `Contract` interface in `packages/core/src/contract.ts`
- [ ] Define `defineContract` helper in same file
- [ ] Define `isContract` type guard in same file
- [ ] Build `extractFromContractFile` in `packages/core/src/extractor/typescript-contract.ts`
- [ ] Add `zod-to-json-schema` dependency
- [ ] Add `'typescript'` to `extractedBy` union in `frontmatter.ts`
- [ ] Export new files from `packages/core/src/index.ts`
- [ ] Wire `.contract.ts` detection into `ferret scan` file discovery
- [ ] Add `"parser": "typescript"` option to `ferret.config.json` schema
- [ ] Thread `.contract.ts` parser through `source:` blocks
- [ ] Thread `.contract.ts` parser through upward-classifier
- [ ] Thread `.contract.ts` parser through inferred IDs
- [ ] Build `ferret status` command (needed by Warren CI pipeline)
- [ ] All existing `.contract.md` tests still pass
- [ ] New `.contract.ts` tests added
- [ ] Publish as v0.3.0

---

## Implementation

### New file: `packages/core/src/contract.ts`

```typescript
import { z } from 'zod';

export interface Contract<T extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>> {
  value: string;
  output: T;
  invariants?: Array<(r: z.infer<z.ZodObject<T>>) => boolean>;
  consumes?: Contract[];
  forbids?: string[];
  // optional — warren gate lifecycle, not enforced by ferret
  status?: 'complete' | 'active' | 'pending';
  closedBy?: string;
  closedWhen?: string;
  dependsOn?: Contract[];
}

export function defineContract<T extends Record<string, z.ZodTypeAny>>(contract: {
  value: string;
  output: T;
  invariants?: Array<(r: z.infer<z.ZodObject<T>>) => boolean>;
  consumes?: Contract[];
  forbids?: string[];
  status?: 'complete' | 'active' | 'pending';
  closedBy?: string;
  closedWhen?: string;
  dependsOn?: Contract[];
}): Contract<T> {
  return contract;
}

export function isContract(value: unknown): value is Contract {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof (value as Record<string, unknown>).value === 'string' &&
    'output' in value &&
    typeof (value as Record<string, unknown>).output === 'object'
  );
}
```

---

### New file: `packages/core/src/extractor/typescript-contract.ts`

```typescript
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { isContract } from '../contract.js';
import { hashSchema } from './hash.js';
import type { ExtractionResult } from './frontmatter.js';

export async function extractFromContractFile(filePath: string): Promise<ExtractionResult> {
  const module = await import(filePath);
  const contracts: ExtractionResult['contracts'] = [];

  for (const [exportName, value] of Object.entries(module)) {
    if (!isContract(value)) continue;

    const shape = zodToJsonSchema(z.object(value.output), {
      $refStrategy: 'none',
    }) as object;

    contracts.push({
      id: exportName,
      type: 'type', // .contract.ts files default to 'type' — overridable
      shape,
      shape_hash: hashSchema(shape),
      imports: (value.consumes ?? []).map((c) => String(c)),
    });
  }

  return {
    filePath,
    fileType: 'spec',
    contracts,
    extractedBy: 'typescript',
    extractedAt: Date.now(),
    ...(contracts.length === 0 && { warning: 'no-frontmatter' }),
  };
}
```

---

### Changes to existing files

### `packages/core/src/extractor/frontmatter.ts`

Add `'typescript'` to `extractedBy` union:

```typescript
extractedBy: 'gray-matter' | 'tree-sitter' | 'typescript';
```

### `packages/core/src/index.ts`

Add exports:

```typescript
export * from './contract.js';
export * from './extractor/typescript-contract.js';
```

### `packages/core/package.json`

Add dependency:

```json
"dependencies": {
  "zod-to-json-schema": "^3.23.0"
}
```

---

### Usage in a `.contract.ts` file

```typescript
import { z } from 'zod';
import { defineContract } from '@specferret/core';

export const hearingTracker = defineContract({
  value: 'NGOs track when their issues appear in Queensland parliament',

  output: {
    hearingId: z.string(),
    committeeName: z.string(),
    matchConfidence: z.number().min(0).max(1),
  },

  invariants: [
    (r) => r.hearingId.length > 0, // r is typed: { hearingId: string, ... }
    (r) => r.matchConfidence >= 0,
    (r) => r.matchConfidence <= 1,
  ],

  forbids: ['unauthenticated-access'],
});
```

---

### What ferret does at scan time

```
1. Detect .contract.ts file
2. Dynamic import (Bun native — no ts-morph)
3. Walk exports, filter via isContract()
4. zod-to-json-schema converts output → JSON Schema
5. hashSchema() hashes it (same as .contract.md path)
6. Returns ExtractionResult — identical shape to gray-matter path
7. Rest of pipeline (store, reconciler, CLI) unchanged
```

---

### New dependency

`zod-to-json-schema` — converts Zod schemas to JSON Schema for SQLite storage.
Ferret stores `shape_schema TEXT` in SQLite. Zod objects are not serializable.
This is the only new dependency required for `.contract.ts` support.
