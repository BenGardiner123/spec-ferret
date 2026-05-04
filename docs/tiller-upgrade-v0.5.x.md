# SpecFerret v0.5.x — Tiller upgrade briefing

**For:** Tiller IDE agent  
**Date:** May 2026  
**Versions:** v0.4.x → v0.5.0 → v0.5.1  
**Packages:** `@specferret/core`, `@specferret/cli`

---

## What shipped and why it matters to Tiller

### v0.5.0 — Sprint 9: `pending` status + Sprint 10: `source` field

#### 1. `roadmap` is gone, `pending` is the new default

The `roadmap` status has been removed everywhere. Any contract that does not
explicitly set `status: 'active'` (or `'complete'`) is now stored and displayed
as `pending`.

**Why this matters:** Previously a brand-new contract showed as `stable` — a
false green. Now first-scan defaults to `pending`. `ferret lint` only shows the
`✓` clean line when `pendingCount === 0`. With pending contracts it shows:

```
  ferret  4 contracts  2 pending  0 drift  12ms
```

**Migration:** If Tiller has any `.contract.md` files with `status: roadmap` in
the frontmatter, change them to `status: pending` (or remove the field — the
default is now `pending` anyway).

For `.contract.ts` files using `defineContract()`, set `status: 'active'` on
contracts that are fully implemented and verified:

```typescript
export const getUser = defineContract({
  id: 'user.getUser',
  value: 'GET /user/:id response',
  status: 'active',   // ← promotes to stable after scan
  output: { ... },
});
```

Contracts without `status` or with `status: 'pending'` will show as pending —
that is correct and intentional for work in progress.

**There are two paths to stable — manual declaration and source-based auto-promotion.**

`status: 'active'` is the manual path: you are asserting "this is implemented and
correct". `ferret scan` reads that assertion and stores `stable` immediately.

The automatic path: if a contract declares `source` pointing to an external
implementation file, `ferret scan` now runs an upward drift check inline. If the
source resolves and the shapes match (NOOP), the contract is auto-promoted from
`pending` → `stable` — no manual declaration needed. If the source file doesn't
exist yet, the contract stays `pending` safely.

`ferret audit` + `source` holds both paths accountable going forward.

#### 2. `context.json` is now v3.0

`context.json` schema bumped from v2.0 to v3.0. Running `ferret scan` after
upgrading regenerates it automatically. If Tiller's CI or tooling reads
`context.json` directly, the `version` field is now `"3.0"` and contract
entries may have `"status": "pending"` where they previously had `"roadmap"`.

`ferret lint` auto-migrates the old file on first run — no manual step needed
for the file itself.

---

#### 3. `source` field on `defineContract()` — the key new capability

**This is the main reason to upgrade.** `.contract.ts` files can now point
directly at their implementation type in `src/`:

```typescript
// contracts/get-keywords.contract.ts
import { z } from 'zod';
import { defineContract } from '@specferret/core';

export const getKeywords = defineContract({
  id: 'api.getKeywords',
  value: 'GET /keywords response',
  status: 'active',
  output: {
    keywords: z.array(z.string()),
  },
  source: {
    file: 'src/routes/keywords.ts', // path relative to project root
    symbol: 'KeywordsResponse', // exported TypeScript type/interface
  },
});
```

```typescript
// src/routes/keywords.ts
export interface KeywordsResponse {
  keywords: string[];
}
```

With `source` set, `ferret audit` compares the Zod schema in the contract
against the live TypeScript type extracted from `src/`. If the implementation
drifts (e.g. a field is added to the interface but not the Zod schema), it
surfaces as upward drift.

**Without `source`**, the contract behaves exactly as before — no change in
behaviour, no breaking change.

---

### v0.5.1 — Bug fix: `context.json` shape was always empty

`zod-to-json-schema@3` is incompatible with zod@4. It was silently emitting
only `{ "$schema": "http://json-schema.org/draft-07/schema#" }` instead of the
full schema. This meant `context.json` looked like:

```json
{
  "id": "api.getKeywords",
  "shape": { "$schema": "http://json-schema.org/draft-07/schema#" }
}
```

Fixed in v0.5.1 using zod's built-in `z.toJSONSchema()`. After running
`ferret scan` with v0.5.1+, shapes in `context.json` will be fully populated:

```json
{
  "id": "api.getKeywords",
  "shape": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
      "keywords": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["keywords"],
    "additionalProperties": false
  }
}
```

Note: the `$schema` URL changes from draft-07 to draft/2020-12. If any Tiller
code reads and validates `shape` against a hardcoded draft-07 schema URL,
update that check.

---

## What to update in Tiller's contracts

### What matters (do this)

1. **Add `status: 'active'`** to any `.contract.ts` contract that is fully
   implemented. Without it, the contract stays `pending` after every scan and
   `ferret lint` will not show the clean `✓`.

2. **Add `source: { file, symbol }`** to every `.contract.ts` contract that
   has a corresponding implementation in `src/`. This is not optional polish —
   it is the mechanism that makes `ferret audit` honest. Without `source`,
   audit is comparing the contract against itself. That is useless.

   For contracts that are not yet implemented, leave them as `pending` — that
   is correct and intentional. When you write the implementation, wire `source`
   at the same time. Not after. Same commit.

   The existing implemented handlers (officials, saved-resources, ingest) are
   the immediate retrofit candidates. Do those now.

3. **Remove `status: roadmap`** from any `.contract.md` frontmatter if present.
   Change to `status: pending` or remove the field entirely.

4. **Re-run `ferret scan`** after upgrading. This migrates `graph.db` and
   regenerates `context.json` v3.0 with correct full shapes.

### What does not matter (ignore)

- `.contract.md` files **without** a `status` field — no change needed. They
  will default to `pending` on the first scan with the new version, which is
  correct.
- The `context.json` file itself — `ferret scan` regenerates it. Do not edit
  it by hand.
- `zod-to-json-schema` — it is removed from `@specferret/core`'s dependencies.
  If Tiller's own code imports it directly, that is unrelated and unaffected.
- Contracts for unimplemented routes — leave them pending. Do not invent a
  `src/` type just to satisfy `source`. Pending is honest. Hollow source is
  not.

---

## Upgrade steps

```bash
# 1. Update the packages
npm install @specferret/core@0.5.1 @specferret/cli@0.5.1

# 2. Delete the old DB so the migration runs clean (optional but safe)
rm .ferret/graph.db

# 3. Re-scan to populate with correct shapes and pending statuses
ferret scan

# 4. Verify
ferret lint
ferret status
```

After step 4:

- Contracts without `status: 'active'` will show as `pending` — that is correct.
- Shapes in `context.json` will be fully populated.
- `ferret lint` will show the clean `✓` only when all contracts are `stable` and
  there is no drift.

---

## Contract authoring quick reference (v0.5.1)

```typescript
import { z } from 'zod';
import { defineContract } from '@specferret/core';

export const myContract = defineContract({
  id: 'domain.contractName', // required — kebab or dot notation
  value: 'human description', // required — plain english
  status: 'active', // optional — omit for pending (WIP)
  output: {
    // required — the response shape as Zod
    field: z.string(),
    count: z.number(),
  },
  source: {
    // optional — enables upward drift checking
    file: 'src/path/to/handler.ts',
    symbol: 'HandlerResponseType',
  },
  consumes: [otherContract], // optional — dependency edges
});
```

| Field      | Required | Purpose                                                                                                                                          |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`       | yes      | Unique contract identifier                                                                                                                       |
| `value`    | yes      | Human-readable description                                                                                                                       |
| `output`   | yes      | Zod shape — the actual contract                                                                                                                  |
| `status`   | no       | `'active'` or `'complete'` → `stable`; else `pending`                                                                                            |
| `source`   | no\*     | Points to the src TypeScript type to compare against. \*Required when the contract is implemented — omitting it means audit does nothing useful. |
| `consumes` | no       | Contracts this one depends on (drift graph edges)                                                                                                |
