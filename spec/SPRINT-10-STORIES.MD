# SpecFerret — Sprint 10 Stories

Generated: May 2026
Status: Planning
Target: v0.5.0

---

## Context

Discovered during Tiller dogfooding. `ferret audit` provides no real cross-file upward drift
for `.contract.ts` projects. `code_source_file` in the store points at the `.contract.ts`
file itself — not the handler. The upward drift loop in `audit/index.ts` re-extracts from
the contract file and compares against its own stored baseline. That is the same thing
downward drift already catches. It is not implementation-to-contract conformance checking.

The only escape today is Path 2: `.contract.md` + `source: { file, symbol }` YAML frontmatter
pointing at a named TypeScript type in `src/`. But that forces three representations per
endpoint:

1. Zod schema in `.contract.ts` — runtime shape
2. Named TypeScript type in `src/` — implementation
3. YAML shape in `.contract.md` — declared spec for ferret to compare against

SpecFerret only validates one pair at a time. Maintaining all three is worse than the
status quo.

### Root cause

`defineContract()` has no `source` field. Verified against
`packages/core/src/contract.ts`. There is no path from a `.contract.ts` contract
to a `src/` implementation type.

### Solution

Add `source?: { file: string; symbol: string }` to the `Contract` interface. Wire it
through the extractor to `code_source_file` / `code_source_symbol` in the store,
pointing at the **src implementation file**, not the contract file. The existing upward
drift loop in `audit/index.ts` already handles everything else — Gate 1 passes, Gate 2
validates the src file exists, tree-sitter extracts the named type, comparison runs.

This is fully additive. Contracts without `source` are unchanged.

### Decisions locked

- `source` is optional — no breaking change to existing contracts
- `source.file` is stored as a project-relative path (same normalisation as existing `code_source_file`)
- `source.symbol` must be a named exported TypeScript type or interface — not a value
- The `audit/index.ts` upward drift loop is **not changed** — the fix is purely in the
  extractor and store population
- `.contract.md` `source:` frontmatter path remains available and unchanged
- Tree-sitter is already the extractor for non-`.contract.ts` source files in the audit
  loop — this is correct behaviour for `src/` TypeScript types

---

## S63 — `source` field on `defineContract()`

**Summary:** Add `source?: { file: string; symbol: string }` to the `Contract` interface.
Wire `extractFromContractFile` to read it and populate `sourceFile`/`sourceSymbol` with
the src path. When `source` is set, `code_source_file` in the store points at the
implementation file, not the contract file. `ferret audit` then checks conformance
between the Zod contract schema and the live TypeScript type — two representations,
one pair enforced.

---

### Phase 1 — Type layer

**Task 1** — `packages/core/src/contract.ts`

Add `source` to the `Contract<T>` interface and `ContractRef`:

```typescript
export interface Contract<
  T extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
> {
  id?: string;
  value: string;
  output: T;
  schema?: z.ZodObject<T>;
  invariants?: Array<(r: z.infer<z.ZodObject<T>>) => boolean>;
  consumes?: ContractRef[];
  forbids?: string[];
  status?: 'complete' | 'active' | 'pending';
  closedBy?: string;
  closedWhen?: string;
  dependsOn?: ContractRef[];
  /** Points to the src implementation type this contract describes.
   *  When set, `ferret audit` compares the live TypeScript type against the
   *  Zod output shape and reports upward drift if they diverge. */
  source?: { file: string; symbol: string };
}
```

`ContractRef` uses `Omit<Contract<any>, ...>` — `source` is included automatically.
No change needed to `ContractRef`.

No change to `defineContract()` function body — `source` is passed through as-is.

---

### Phase 2 — Extractor layer

**Task 2** — `packages/core/src/extractor/typescript-contract.ts`

In the `contracts.push({...})` block, read `exportValue.source` and use it to populate
`sourceFile` and `sourceSymbol` **instead of** the contract file path when present:

```typescript
// BEFORE (always points at the contract file)
contracts.push({
  id: exportValue.id ?? exportName,
  type: 'type',
  shape,
  shape_hash,
  imports,
  sourceFile: filePath,
  sourceSymbol: exportName,
});

// AFTER (points at src/ when source is declared, falls back to contract file)
const srcFile =
  typeof (exportValue as any).source?.file === 'string'
    ? (exportValue as any).source.file
    : undefined;
const srcSymbol =
  typeof (exportValue as any).source?.symbol === 'string'
    ? (exportValue as any).source.symbol
    : undefined;

contracts.push({
  id: exportValue.id ?? exportName,
  type: 'type',
  shape,
  shape_hash,
  imports,
  sourceFile: srcFile ?? filePath,
  sourceSymbol: srcSymbol ?? exportName,
});
```

No other changes to the extractor. `scan.ts` already normalises `sourceFile` to a
project-relative path before calling `upsertContract` (lines 183–187 of `scan.ts`).

---

### Phase 3 — Audit loop (no changes required)

**Task 3** — `packages/core/src/audit/index.ts` — **read-only verification**

The existing upward drift loop already branches correctly:

```typescript
if (sourceAbsPath.endsWith('.contract.ts')) {
  // re-extracts from the contract file itself — NOT used when source is set
} else {
  // tree-sitter extracts named type from src/ — THIS path runs when source is set
  const fileContent = fs.readFileSync(sourceAbsPath, 'utf-8');
  const extraction = extractContractsFromTypeScript(sourceAbsPath, fileContent);
  const found = extraction.contracts.find((c) => c.sourceSymbol === contract.code_source_symbol);
  ...
}
```

When `source` is set, `code_source_file` is now a `src/` path (not ending in
`.contract.ts`), so the tree-sitter branch runs automatically. No code change needed.

Verify only: confirm the branch condition uses `endsWith('.contract.ts')` and the
tree-sitter branch uses `c.sourceSymbol` for matching. Both already true.

---

### Phase 4 — Tests

**Task 4** — `packages/core/src/extractor/typescript-contract.test.ts`

Add tests:

- Contract with no `source` field → `sourceFile` is the contract file path, `sourceSymbol`
  is the export name (existing behaviour, regression test)
- Contract with `source: { file: 'src/routes/keywords.ts', symbol: 'KeywordsResponse' }` →
  `sourceFile` is `'src/routes/keywords.ts'`, `sourceSymbol` is `'KeywordsResponse'`

**Task 5** — `packages/core/src/audit/audit.test.ts` (or nearest audit test file)

Add integration test:

- Contract with `source` pointing at a fixture `src/` file containing a named TypeScript
  type that matches the Zod schema → `upwardDrift` is empty
- Contract with `source` pointing at a fixture `src/` file where the named type has
  diverged (extra field, missing field, changed type) → `upwardDrift` contains an entry
  with the correct `breaking` / `non-breaking` classification

---

## Relevant files

| File | What changes |
| ---- | ------------ |
| `packages/core/src/contract.ts` | Add `source?: { file: string; symbol: string }` to `Contract<T>` interface |
| `packages/core/src/extractor/typescript-contract.ts` | Read `exportValue.source`, use as `sourceFile`/`sourceSymbol` when present |
| `packages/core/src/audit/index.ts` | No change — verify branch condition only |
| `packages/core/src/extractor/typescript-contract.test.ts` | Add `source` field coverage |
| `packages/core/src/audit/audit.test.ts` | Add integration tests for cross-file upward drift |

---

## Acceptance criteria

1. `bun test` — all green
2. Contract with no `source` → `code_source_file` still points at the contract file (no regression)
3. Contract with `source: { file, symbol }` → `code_source_file` in store points at the `src/` path
4. `ferret audit` on a project with `source`-wired contracts + matching src types → no upward drift reported
5. `ferret audit` on a project with `source`-wired contracts + diverged src type → upward drift reported with correct severity
6. `ferret audit` on a project with no `source` fields → behaviour identical to today

---

## Out of scope

- Any change to the `.contract.md` / `source:` YAML frontmatter path — unchanged
- Any change to `ferret lint` output format
- Any change to `scan.ts` beyond what falls naturally from the extractor change
- Postgres store — mirrors interface changes only
- `ferret extract` command — not affected
- `context.json` — not affected (stores `code_source_file` as written by scan)

---

## What this enables for Tiller

After Sprint 10 ships, Tiller contracts can wire their src types in one field:

```typescript
export const apiGetApiKeywords = defineContract({
  id: 'api.getApiKeywords',
  source: { file: 'src/routes/keywords.ts', symbol: 'KeywordsResponse' },
  output: { keywords: z.array(...), limit: z.number(), remaining: z.number() },
  consumes: [tablesOrgKeyword],
});
```

And `src/routes/keywords.ts` exports:

```typescript
export type KeywordsResponse = {
  keywords: Array<{ keyword: string; created_at: string }>;
  limit: number;
  remaining: number;
};
```

Two representations. One pair. `ferret audit` enforces them. No YAML spec. No
`.contract.md`. No three-representation trap.

`requirements.yaml` `contracts:` inline blocks can be dropped entirely — they duplicate
the `.contract.ts` files and are never read by ferret.

---

_© Laser Unicorn — MIT License_