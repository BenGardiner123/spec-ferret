# SpecFerret — Sprint 9 Stories

Generated: May 2026
Status: Planning
Target: v0.4.0

---

## Context

Discovered during Tiller dogfooding. A brand-new contract with no prior baseline returns `stable` — indistinguishable from a verified, implemented contract. This is a false green. Agents using `ferret lint --ci` as a progress signal cannot tell "contract written" from "contract implemented and verified."

The fix: replace the existing `roadmap` status (which existed in the store but was never wired to any automatic path) with `pending`, and make it the default for any contract that has not been explicitly promoted to `stable` by the author.

### Decisions locked

- `undefined` → `pending` (aggressive default — fixes the dogfooding gap)
- Hard cut — `context.json` bumps to v3.0, no dual-write compatibility shim
- `pending` is not a blocking state — exit 0, but visually distinct from clean (`✓`)

---

## S62 — `pending` status lifecycle

**Summary:** Replace `roadmap` → `pending` across the store layer, wire `defineContract.status` into the scan engine, make first-scan default `pending` not `stable`. Version bump `context.json` to 3.0.

---

### Phase 1 — Type layer

**Task 1** — `packages/core/src/store/types.ts`

Rename `'roadmap'` → `'pending'` in both `NodeStatus` and `ContractStatus`:

```typescript
// BEFORE
export type NodeStatus = 'stable' | 'needs-review' | 'roadmap' | 'blocked';
export type ContractStatus = 'stable' | 'roadmap' | 'needs-review';

// AFTER
export type NodeStatus = 'stable' | 'needs-review' | 'pending' | 'blocked';
export type ContractStatus = 'stable' | 'pending' | 'needs-review';
```

**Task 2** — `packages/core/src/extractor/frontmatter.ts` (`ExtractionResult` interface)

Add `contractStatus` to the per-contract shape in `ExtractionResult`:

```typescript
contracts: Array<{
  id: string;
  type: ContractType;
  shape: object;
  shape_hash: string;
  imports: string[];
  contractStatus?: ContractStatus;  // new
  sourceFile?: string;
  sourceSymbol?: string;
}>
```

---

### Phase 2 — Extractor layer (read author intent)

**Task 3** — `packages/core/src/extractor/frontmatter.ts` (extractor function)

Read `ferret.status` from YAML frontmatter. Map to store status:

```
active | complete  →  'stable'
pending | undefined  →  'pending'
```

Return as `contractStatus` on the extracted contract object.

**Task 4** — `packages/core/src/extractor/typescript-contract.ts`

Read `exportValue.status` from the `defineContract()` call. Same mapping:

```typescript
const contractStatus: ContractStatus =
  exportValue.status === 'active' || exportValue.status === 'complete'
    ? 'stable'
    : 'pending'; // undefined OR 'pending' → pending
```

Return as `contractStatus` on each contract pushed to the result array.

---

### Phase 3 — Scan engine

**Task 5** — `packages/cli/bin/commands/scan.ts` (line 146)

This is the key behaviour change. Single line:

```typescript
// BEFORE
let nodeStatus: 'stable' | 'needs-review' = 'stable';

// AFTER
let nodeStatus: ContractStatus = contract.contractStatus ?? 'pending';
```

The `compareSchemas` block only runs when `prevContract` exists — unchanged. When `prevContract` is null (first scan), `nodeStatus` stays as the author-declared value, defaulting to `pending`. `nodeStatus` feeds both `upsertNode` (line 169) and `upsertContract` (line 173) — one change covers both.

Note: unchanged files that are skipped via the `fileChanged` guard still get their DB rows migrated by the `sqlite.ts init()` SQL migration, which runs on every `store.init()` call.

---

### Phase 4 — Store migration

**Task 6** — `packages/core/src/store/sqlite.ts`

Add alongside the existing `try/catch` `ALTER TABLE` migration blocks in `init()`:

```typescript
try {
  this.db.exec(`UPDATE ferret_contracts SET status = 'pending' WHERE status = 'roadmap';`);
  this.db.exec(`UPDATE ferret_nodes SET status = 'pending' WHERE status = 'roadmap';`);
} catch {}
```

---

### Phase 5 — Reconciler

**Task 7** — `packages/core/src/reconciler/index.ts`

Two string literals only:

```typescript
// Skip-flagging check
dependentNode.status === "pending"   // was "roadmap"

// Consistency check
nodes.every((n) => n.status === "stable" || n.status === "pending"),  // was "roadmap"
```

`consistent` stays `true` when all nodes are `stable` or `pending`. `pending` is not a drift state — it is an unverified state.

---

### Phase 6 — Report layer

**Task 8** — `packages/core/src/status/index.ts`

- `StatusReport.roadmap: number` → `pending: number`
- `driftClass: 'breaking' | 'stable' | 'roadmap'` → `'breaking' | 'stable' | 'pending'`
- Filter: `contracts.filter((c) => c.status === 'roadmap')` → `'pending'`
- `StatusContractEntry.driftClass` ternary: `'roadmap'` → `'pending'`

**Task 9** — `packages/core/src/audit/index.ts`

- `AuditSummary.roadmap: number` → `pending: number`
- Summary builder: `roadmap: statusReport.roadmap` → `pending: statusReport.pending`

---

### Phase 7 — context.json v3.0

**Task 10** — `packages/core/src/context/index.ts`

1. `CONTEXT_VERSION = "3.0"` (was `"2.0"`)
2. In `normalizeContext()`, insert the v2.0 migration branch **before** the `if (contextVersion !== CONTEXT_VERSION) throw` check. Bumping to `"3.0"` makes any existing `"2.0"` file hit the hard error immediately — the branch must precede it:

```typescript
// Migration: v2.0 → v3.0
if (contextVersion === "2.0") {
  const legacy = candidate as Partial<LegacyFerretContextV2>;
  const migratedContracts = (Array.isArray(legacy.contracts) ? legacy.contracts : []).map(
    (c: ContextContract) => ({ ...c, status: c.status === 'roadmap' ? 'pending' : c.status })
  );
  return {
    version: CONTEXT_VERSION,
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    generated: typeof legacy.generated === 'string' ? legacy.generated : new Date(0).toISOString(),
    contracts: migratedContracts,
    edges: Array.isArray(legacy.edges) ? legacy.edges : [],
    needsReview: Array.isArray(legacy.needsReview) ? legacy.needsReview : [],
  };
}
// Hard error on anything else (including pre-2.0 or unknown)
if (contextVersion !== CONTEXT_VERSION) {
  throw new Error(...)
}
```

`LegacyFerretContextV2` type is already defined at line 8 — available for reuse.

---

### Phase 8 — CLI output

**Task 11** — `packages/cli/bin/commands/lint.ts`

Derive `pendingCount` from loaded contracts before the output block:

```typescript
const pendingCount = contracts.filter((c) => c.status === 'pending').length;
```

Update clean-state output:

```typescript
if (report.consistent && !hasUpwardDrift && pendingCount === 0) {
  // Boris clean — unchanged
  process.stdout.write(pc.green('✓ ferret') + `  ${contractCount} contracts  0 drift  ${ms}ms\n`);
} else if (report.consistent && !hasUpwardDrift && pendingCount > 0) {
  // Clean but unverified — no check, no green
  process.stdout.write(`  ferret  ${contractCount} contracts  ${pendingCount} pending  0 drift  ${ms}ms\n`);
}
```

`--ci` JSON output gains `pending` count in the output object. Exit codes unchanged — `pending` is exit 0.

---

### Phase 9 — Tests

**Task 12** — All affected test files

- Replace all `'roadmap'` string literals → `'pending'`
- Add test: first scan of a contract with no `status` field → stored as `pending`
- Add test: first scan of `status: 'active'` → stored as `stable`
- Add test: `normalizeContext()` with v2.0 input + `roadmap` entries → output is v3.0 with `pending`

---

## Relevant files

| File | What changes |
| ---- | ------------ |
| `packages/core/src/store/types.ts` | Type rename |
| `packages/core/src/extractor/frontmatter.ts` | `ExtractionResult` interface + YAML status read |
| `packages/core/src/extractor/typescript-contract.ts` | `defineContract.status` read + mapping |
| `packages/cli/bin/commands/scan.ts` | Line 146 default + `ContractStatus` import |
| `packages/core/src/store/sqlite.ts` | DB migration in `init()` |
| `packages/core/src/reconciler/index.ts` | 2 string literals |
| `packages/core/src/status/index.ts` | `StatusReport` shape + filter + `driftClass` |
| `packages/core/src/audit/index.ts` | `AuditSummary` shape + builder |
| `packages/core/src/context/index.ts` | Version bump + v2→v3 migration in `normalizeContext()` |
| `packages/cli/bin/commands/lint.ts` | Clean-state output + `--ci` JSON |

---

## Acceptance criteria

1. `bun test` — all green
2. Fresh scan of a `.contract.ts` with no `status` field → `ferret status` shows `pending`
3. `.contract.ts` with `status: 'active'` → `ferret status` shows `stable`
4. Existing DB with `roadmap` rows → shows `pending` after any `store.init()`
5. Old `context.json` v2.0 with `roadmap` entries → `ferret lint` reads it, migrates to v3.0, no error
6. `ferret lint` with pending contracts → no `✓`, pending count in output, exit 0
7. `ferret lint` with no pending and no drift → `✓` clean output, exit 0
8. `ferret lint --ci` JSON output includes `pending` count

---

## Out of scope

- `defineContract` `status` field type in `contract.ts` — unchanged (`'complete' | 'active' | 'pending'`)
- Exit codes — no changes
- New commands
- Postgres store (stub only — mirrors SQLite interface changes)

---

_© Laser Unicorn — MIT License_