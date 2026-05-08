# SpecFerret — Current Spec Conventions

This document describes the conventions that exist in the current codebase.
It is derived from `packages/core` and `packages/cli`, not from older planning docs.
If this document and the code disagree, the code wins.

---

## Scope

These conventions are based on what SpecFerret actually reads, writes, and enforces today.

The runtime currently cares about:

- the configured spec directory
- `.contract.md` files under that directory
- `.contract.ts` files under that directory
- TypeScript source files used by `ferret extract` or linked via `source`
- `.ferret/context.json`
- `ferret.config.json`

The runtime does not parse planning documents, sprint stories, PRDs, or ADRs.

---

## 1. Discovery Rules

### Project root

SpecFerret resolves a project root, then loads configuration and graph state relative to that root.

### Default spec directory

The default config in code is:

```json
{
  "specDir": "contracts/",
  "filePattern": "**/*.contract.md",
  "includes": ["**/*.contract.md"],
  "store": "sqlite"
}
```

So by default SpecFerret scans `contracts/`.

### What `scan` discovers

`ferret scan` currently discovers files in two ways:

1. It globs `filePattern` inside `specDir` for markdown contracts.
2. It also auto-discovers `**/*.contract.ts` inside `specDir` unless `contractParsers.typescript` is explicitly set to `false`.

That means mixed-format projects are supported in the same `specDir`.

### What `watch` watches

`ferret watch` watches `specDir` recursively and reacts only to:

- `.contract.md`
- `.contract.ts`

### What `extract` reads

`ferret extract` reads TypeScript source files from `codeContracts.include`.

If that config is absent, it defaults to:

```json
{
  "codeContracts": {
    "include": ["src/**/*.ts"]
  }
}
```

---

## 2. Supported Contract File Types

SpecFerret currently supports two contract authoring formats.

### `.contract.md`

Markdown contracts are read with `gray-matter`.

Required frontmatter fields:

- `ferret.id`
- `ferret.type`
- `ferret.shape`

Optional frontmatter fields used by the runtime:

- `ferret.imports`
- `ferret.status`
- `ferret.source.file`
- `ferret.source.symbol`

If a markdown file has no `ferret:` block, extraction returns `warning: 'no-frontmatter'` and the file is skipped.

### `.contract.ts`

TypeScript-native contracts are read by dynamically importing the file and selecting exported values that satisfy `isContract()`.

Current contract shape fields used by code:

- `id`
- `value`
- `output`
- `invariants`
- `consumes`
- `forbids`
- `status`
- `source`
- `closedBy`
- `closedWhen`
- `dependsOn`

Important current runtime details:

- a single `.contract.ts` file may export multiple contracts
- if `id` is omitted, the export name becomes the contract ID
- `consumes` is converted into dependency imports
- `source.file` and `source.symbol` are used for code linkage
- if `source` is omitted, the extractor defaults to the contract file path and export name

`defineContract()` adds `schema: z.object(output)` to the returned object.

---

## 3. Markdown Contract Rules

### One markdown contract per file

The markdown extractor returns exactly one contract per `.contract.md` file.

That is true for markdown only.
It is not a universal rule for `.contract.ts`.

### Allowed contract types

The current code enforces this closed set of types:

- `api`
- `table`
- `type`
- `event`
- `flow`
- `config`

Any other `ferret.type` value fails extraction.

### Supported status values

Markdown status is normalized like this:

- `active` -> `stable`
- `complete` -> `stable`
- anything else, including missing status -> `pending`

### Imports

If `ferret.imports` is present and is an array, each value becomes a dependency edge from the current file to a target contract ID.

### Source linkage

If present, this frontmatter is read and stored:

```yaml
source:
  file: src/example.ts
  symbol: ExampleType
```

This is used by upward drift checks in `lint`, `review`, and `audit`.

---

## 4. TypeScript Contract Rules

### Type classification

`.contract.ts` extraction currently persists all TypeScript-native contracts with type:

```text
type
```

There is no separate runtime field today for setting `.contract.ts` contracts to `api`, `table`, `event`, `flow`, or `config`.

### Status values

The current TypeScript contract interface allows:

- `complete`
- `active`
- `pending`

These are normalized the same way as markdown:

- `complete` or `active` -> `stable`
- `pending` or omitted -> `pending`

### Dependencies

Dependencies are declared through `consumes`.

Resolution rules:

- same-file contract references resolve to either `consumed.id` or the same-file export name
- external references use `consumed.id` when present
- unresolved references are kept as `"[unresolved]"` and emit a warning

### Source linkage

If you want a `.contract.ts` contract linked to an external implementation type, set:

```ts
source: { file: 'src/example.ts', symbol: 'ExampleType' }
```

If `source` is omitted, the runtime defaults to the contract file itself and the export name.

---

## 5. File Path Conventions

### Default layout created by `init`

`ferret init` creates this starter layout:

```text
your-project/
  .ferret/
    graph.db
    context.json
  contracts/
    example.contract.md
  ferret.config.json
  CLAUDE.md
```

That is the only scaffold the code creates by default.

### Contract file placement

The code does not enforce domain-first folders, flat folders, or nesting depth.

It only enforces discovery through `specDir`.

So these are both valid from the runtime's perspective if they live under `specDir`:

- `contracts/auth/jwt.contract.md`
- `contracts/nested/any/depth/example.contract.ts`

Whether deeper nesting is a good idea is a team choice, not a code-enforced rule.

### Path mapping used by `ferret extract`

When `ferret extract` generates markdown contracts from TypeScript source, it maps IDs to file paths like this:

1. Split the ID on the first dot.
2. Use the first segment as the folder under `specDir`.
3. Join the remaining segments.
4. Normalize the file name to lowercase hyphenated text.
5. Write `<name>.contract.md`.

Examples derived from the mapping code:

```text
auth.jwt         -> contracts/auth/jwt.contract.md
tables.user      -> contracts/tables/user.contract.md
api.GET/users    -> contracts/api/get-users.contract.md
```

This is the generator's path convention.
The scanner itself does not require paths to follow that mapping.

---

## 6. ID Conventions and Current Enforcement

### Current runtime rules

The code does not enforce one global ID format everywhere.

What is currently true:

- markdown extraction requires `id` to be present
- `.contract.ts` extraction uses `id` if present, else the export name
- `ferret extract` validates generated IDs with this pattern:

```text
^[A-Za-z0-9_.\/-]+$
```

- `ferret extract` also requires generated IDs to contain at least one dot

### Collision rules

`ferret scan` currently detects conflicting IDs across files during the same run and prints:

```text
ferret: CONFLICT <id> — defined in both <file-a> and <file-b>
```

This is advisory output during scan.
It does not hard-fail scan by itself.

`ferret extract` is stricter about output-path collisions:

- two IDs that map to the same generated markdown path are treated as an error
- updating an existing markdown file with a different frontmatter ID is treated as an error

### Practical convention

The code-generated path mapping and starter content both assume dot-scoped IDs such as:

- `api.GET/example`
- `auth.jwt`
- `tables.user`

That is the current house style implied by the code, even though scan does not fully validate it for every authoring path.

---

## 7. Shape Conventions

### Supported JSON Schema subset

The validator warns, but does not fail, when markdown contracts include unsupported keywords.

Keywords that currently warn:

- `$ref`
- `allOf`
- `anyOf`
- `oneOf`
- `not`
- `if`
- `then`
- `else`
- `$defs`
- `definitions`
- `patternProperties`
- `dependencies`

### Comparison rules

The current schema comparison logic understands and classifies changes across:

- `type`
- `properties`
- `required`
- `enum`
- `items`
- top-level `request`
- top-level `response`

Breaking changes in current code include:

- required field removed
- required field added
- field type changed
- property removed
- enumerated value removed
- array item type changed

Non-breaking changes in current code include:

- optional field added
- enumerated value added

### Required arrays

The comparison logic treats `required` as an array of strings.
Ordering differences are normalized semantically during comparison.

`ferret extract` also sorts and deduplicates generated `required` arrays when it writes markdown.

---

## 8. Dependencies and Graph Edges

Dependency edges are always stored as:

- source node file path
- target contract ID

Current authoring paths to create those edges:

- markdown `imports`
- TypeScript `consumes`

The reconciler later uses those edges to:

- detect unresolved imports
- detect self imports
- detect circular imports
- detect orphaned contracts
- walk downstream impact via BFS

---

## 9. Source Links and Upward Drift

SpecFerret currently supports linking a contract to a code symbol.

For markdown contracts, that comes from:

```yaml
source:
  file: src/example.ts
  symbol: ExampleType
```

For `.contract.ts` contracts, that comes from either:

- explicit `source`
- or the default fallback to the current file and export name

Current runtime rules:

- `scan` stores `code_source_file` and `code_source_symbol`
- `lint`, `review`, and `audit` re-extract the live code shape
- non-`.contract.ts` source files are re-extracted with tree-sitter
- `.contract.ts` source files are re-extracted via dynamic import

`scan` also auto-promotes a pending contract to `stable` when:

- it has a source file and symbol
- the source file is external to the current contract file
- upward drift compares as `NOOP`

---

## 10. Status Conventions

The persisted contract status values are:

- `stable`
- `pending`
- `needs-review`

The persisted node status values are:

- `stable`
- `pending`
- `needs-review`
- `blocked`

`blocked` exists in the store model for nodes.
It is not an author-facing frontmatter or `.contract.ts` status value.

The runtime also migrates legacy `roadmap` statuses to `pending`.

---

## 11. What Is Not Enforced By Code

The following ideas may still be useful team conventions, but they are not enforced by the current runtime:

- privacy and redaction policy
- domain-first folder structure
- sprint-first folders being forbidden
- maximum nesting depth
- keeping planning docs in `docs/`
- BMAD or spec-kit specific directory structure
- one contract per file across all formats
- strict namespace-to-type matching for every authoring path

What the code actually enforces is much narrower:

- file discovery under `specDir`
- required markdown fields
- allowed markdown contract types
- dependency extraction from `imports` and `consumes`
- drift classification
- graph persistence and reporting

---

## 12. Minimal Examples

### Minimal markdown contract

This is the smallest markdown contract that the extractor will accept:

```markdown
---
ferret:
  id: tables.user
  type: table
  shape:
    type: object
    properties:
      id:
        type: string
    required: [id]
---

# User Table
```

### Minimal `.contract.ts` contract

This is the smallest TypeScript-native contract shape implied by the runtime interface:

```ts
import { z } from 'zod';
import { defineContract } from '@specferret/core';

export const user = defineContract({
  id: 'types.user',
  value: 'User type',
  output: {
    id: z.string(),
  },
});
```

In the current implementation, this will be extracted as a contract of type `type`.

---

## Canonical Summary

The current codebase assumes:

- `specDir` is the only contract discovery boundary
- `.contract.md` and `.contract.ts` are both first-class inputs
- `ferret extract` generates markdown contracts from TypeScript source
- markdown contracts carry one contract per file
- `.contract.ts` files may carry multiple contracts
- dependencies come from `imports` and `consumes`
- source links drive upward drift detection
- path style is mostly conventional, but discovery is what matters

Those are the spec conventions that exist in the code today.
