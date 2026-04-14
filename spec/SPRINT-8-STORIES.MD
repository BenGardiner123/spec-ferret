# Sprint 8 — TypeScript-Native Contract Format (v0.3.0)

Status: Complete (v0.3.0, shipped 2026-04-14)
Target: v0.3.0

Context and design rationale: `spec/CONTRACT-TYPE-DESIGN.md`

---

## Sprint Goal

Ship `.contract.ts` support in `@specferret/core`. Existing `.contract.md` tests pass
unchanged. New format is detected, extracted, and flows through the full pipeline
— scan, lint, review, upward-classifier, source: blocks — identically to the
gray-matter path.

Build order is strict: do not start a task until the previous task has passing tests.

---

## S55 — Contract Type Definition

**As a** developer or machine agent writing contract files in TypeScript,
**I want** a `Contract<T>` interface and `defineContract()` helper exported from `@specferret/core`,
**so that** tsc enforces structural correctness for free and invariants are real functions, not text.

**Acceptance Criteria:**

- `Contract<T extends Record<string, z.ZodTypeAny>>` interface is defined in `packages/core/src/contract.ts`
- `Contract` has the following required field: `value: string`
- `Contract` has the following required field: `output: T`
- `Contract` has the following optional field: `id?: string` — canonical ID; defaults to export name at extraction time; must be non-empty if explicitly provided
- `Contract` has the following optional fields: `invariants`, `consumes`, `forbids`, `status`, `closedBy`, `closedWhen`, `dependsOn`
- `invariants` is typed as `Array<(r: z.infer<z.ZodObject<T>>) => boolean>` — functions, not text
- `consumes` is typed as `Contract[]` — object references, not string IDs; tsc enforces the reference so upstream shape changes fail the downstream contract at compile time
- `forbids` is typed as `string[]` — tag-based prohibition list
- `status` is typed as `'complete' | 'active' | 'pending'` — warren gate lifecycle, not enforced by ferret
- `defineContract<T>()` validates and returns `Contract<T>` — if `id` is present and trims to an empty string, throws `Error('defineContract: id must be a non-empty string if provided')` immediately; otherwise returns the contract unchanged
- `isContract(value: unknown): value is Contract` type guard returns `true` when value has `value: string` and `output: object`; `id` presence is not checked — it is optional
- All three exports are re-exported from `packages/core/src/index.ts`
- A valid `.contract.ts` file using `defineContract` compiles without errors under `tsc --strict`
- Tests: `packages/core/src/contract.test.ts`

**Tests must cover:**

- `isContract` returns `true` for a minimal valid object `{ value: 'x', output: {} }`
- `isContract` returns `true` for an object with `id` set
- `isContract` returns `true` for an object without `id` — `id` is optional and not checked by the guard
- `isContract` returns `false` for `null`, `undefined`, `42`, `'string'`
- `isContract` returns `false` for an object missing `value`
- `isContract` returns `false` for an object missing `output`
- `defineContract({ id: '', value: 'x', output: {} })` throws with message containing `'id must be a non-empty string'`
- `defineContract({ id: '   ', value: 'x', output: {} })` throws (whitespace-only is also invalid)
- `defineContract({ id: 'auth.jwt', value: 'x', output: {} })` does not throw
- `defineContract({ value: 'x', output: {} })` does not throw — omitting `id` is valid
- `defineContract()` returns the exact object passed to it when valid
- TypeScript: invariant function receives typed argument `r` (compile-time check via fixture)

**New dependency:**

```json
"zod": "^3.x"
```

Add to `packages/core/package.json` `dependencies`. Required for `z.ZodTypeAny` in the `Contract<T>` interface.

---

## S56 — TypeScript Contract Extractor

**As a** `ferret scan` run processing a `.contract.ts` file,
**I want** an `extractFromContractFile(filePath)` function that returns an `ExtractionResult`,
**so that** the downstream pipeline handles `.contract.ts` identically to `.contract.md`.

**Acceptance Criteria:**

- `extractFromContractFile` is defined in `packages/core/src/extractor/typescript-contract.ts`
- Function signature: `async function extractFromContractFile(filePath: string): Promise<ExtractionResult>`
- Implementation uses `await import(filePath)` — no ts-morph, no AST reflection, no compile step
- Walks all named exports of the imported module; skips any export where `isContract()` returns `false`
- For each valid contract export: uses the export name as the contract `id`
- For each valid contract export: converts `value.output` to JSON Schema using `zod-to-json-schema` with `$refStrategy: 'none'`
- For each valid contract export: hashes the schema using the existing `hashSchema()` from `extractor/hash.ts`
- For each valid contract export: maps `value.consumes` to `imports: string[]` using a two-pass resolver:
  - **Pass 1:** walk all named exports and build `Map<object, string>` mapping each valid contract object to its export name
  - **Pass 2:** for each entry in `consumes`, resolve by: (1) reference equality lookup in the pass-1 map; (2) `c.id` if explicitly set; (3) emit one `process.stderr.write()` warning and return `'[unresolved]'`
  - One warning per unresolvable reference — not batched, not suppressed; warning count must be testable
- For each valid contract export: `type` defaults to `'type'` (overridable — see S57)
- `extractedBy` is `'typescript'` in the returned `ExtractionResult`
- A file with no valid contract exports returns `ExtractionResult` with empty `contracts[]` and `warning: 'no-frontmatter'`
- A file that throws on `import()` propagates the error — no silent swallowing
- Updates `packages/core/src/extractor/frontmatter.ts`: adds `'typescript'` to the `extractedBy` union type
- `extractFromContractFile` is re-exported from `packages/core/src/index.ts`
- Tests: `packages/core/src/extractor/typescript-contract.test.ts`

**Tests must cover:**

- File with one valid `defineContract` export → single contract in result with correct id, shape, shape_hash, imports
- File with multiple exports (some valid, some not) → only valid contracts extracted
- File with no ferret contracts → empty contracts + `warning: 'no-frontmatter'`
- `extractedBy` is always `'typescript'`
- `extractedAt` is a unix ms timestamp (within 1s of `Date.now()`)
- Shape hash is deterministic — running twice on same file produces identical hash
- `zod` schema with optional fields (`z.string().optional()`) extracts without throwing
- **Same-file `consumes` reference resolves to the correct export name** (not `'[object Object]'`)
- **Cross-file reference with explicit `id` set resolves to `c.id`**
- **Cross-file reference without `id` emits exactly one warning to stderr and returns `'[unresolved]'`**
- Three contracts in the same file each with their own unresolvable cross-file reference → three warnings emitted (not one, not zero)
- All existing `.contract.md` extractor tests pass unchanged

**New dependency:**

```json
"zod-to-json-schema": "^3.23.0"
```

Add to `packages/core/package.json` `dependencies`.

---

## S57 — Wire `.contract.ts` into File Discovery and Config

**As a** developer running `ferret scan` on a project that uses `.contract.ts` files,
**I want** SpecFerret to automatically discover and process `.contract.ts` files,
**so that** no manual config is needed for the common case.

**Acceptance Criteria:**

- `ferret scan` discovers files matching `**/*.contract.ts` under `specDir` in addition to `filePattern`
- `.contract.ts` detection is automatic — no config required for the common case
- `ferret.config.json` accepts an optional `"parser": "typescript"` field on `codeContracts` or a top-level `contractParsers` option (exact schema: see below)
- Both `.contract.md` and `.contract.ts` files discovered in the same run are processed correctly — they do not interfere
- `ferret lint` processes `.contract.ts` files and includes them in drift reporting
- `ferret lint --ci` JSON output includes contracts extracted from `.contract.ts`
- `.contract.ts` files with no valid exports emit a warning to stderr and are skipped without crashing
- Context.json includes contracts from `.contract.ts` files after scan

**Config schema addition (`ferret.config.json`):**

```json
{
  "contractParsers": {
    "typescript": true
  }
}
```

When `contractParsers.typescript` is `true`, `.contract.ts` discovery is enabled.
When the key is absent, `.contract.ts` discovery is still enabled by default (opt-out model).

- Tests: integration test in `packages/cli/` that scans a fixture directory with both `.contract.md` and `.contract.ts` files and verifies both are included in the result

---

## S58 — Thread `.contract.ts` Through Upward-Classifier, Source Blocks, and Inferred IDs

**As a** developer using `.contract.ts` files with `source:` blocks and code-first extraction,
**I want** the full bidirectional drift pipeline to treat `.contract.ts` the same as `.contract.md`,
**so that** upward drift detection works regardless of contract format.

**Acceptance Criteria:**

**Source blocks:**
- A `.contract.ts` file can link to a code file via the Contract `consumes` field (upstream) — this is already covered by S56 `imports` mapping
- The upward-classifier reads contracts from `.contract.ts` files identically to `.contract.md`
- `ferret diagnostics` includes contracts from `.contract.ts` files in the import graph output

**Upward-classifier:**
- When a code file changes and its extracted shape drifts against a contract that came from a `.contract.ts` file, the drift is flagged with the same breaking/non-breaking classification
- `ferret review` provides resolution context for upward drift flagged against `.contract.ts` contracts

**Inferred IDs:**
- Export names from `.contract.ts` files are used as contract IDs (same as S56 default)
- ID collision between a `.contract.ts` export and a `.contract.md` id is detected and surfaced as a lint error: `CONFLICT <id> — defined in both <file1> and <file2>`

**Tests must cover:**
- Upward drift against a `.contract.ts` contract is classified as breaking when a required output field is removed from the matching code shape
- ID collision between `.contract.md` and `.contract.ts` is surfaced as a lint error
- `ferret diagnostics` output includes contracts from `.contract.ts`

---

## S59 — `ferret status` Command

**As** the Warren CI pipeline (or a developer),
**I want** to run `ferret status` and get the current drift state of all contracts,
**so that** STATUS.md can be generated automatically and CI can gate on it.

**Acceptance Criteria:**

- `ferret status` reads the store (no scan — does not modify state) and prints current contract status
- Default output format (human-readable):

  ```
  ferret status  12 contracts

    stable        10
    needs-review   2

    NEEDS REVIEW
    auth.jwt          breaking — shape changed, 3 dependents
    tables.document   non-breaking — optional field added
  ```

- `ferret status --json` outputs JSON to stdout, zero ANSI codes, exits 0 (even when contracts need review)
- JSON output shape:

  ```json
  {
    "version": "2.0",
    "timestamp": "2026-04-12T00:00:00.000Z",
    "total": 12,
    "stable": 10,
    "needsReview": 2,
    "contracts": [
      {
        "id": "auth.jwt",
        "status": "needs-review",
        "driftClass": "breaking",
        "dependents": ["search.contract.md", "analytics.contract.md"]
      }
    ]
  }
  ```

- `ferret status --export` writes output to `STATUS.md` in the project root (Warren CI use-case)
- `STATUS.md` format: markdown table of all contracts with id, status, drift class, and dependent count
- `ferret status` never runs a scan — it only reads the current store state
- `ferret status` exits 0 in all cases (it is a report command, not an enforcement command)
- `ferret status` handles an empty store (no contracts) gracefully: prints `ferret status  0 contracts` and exits 0
- CLI command file: `packages/cli/bin/commands/status.ts` — maximum 50 lines; reporting logic lives in core
- Tests: `packages/cli/bin/commands/status.test.ts`

---

## Sprint 8 — Definition of Done

- [ ] All five stories (S55-S59) merged with passing tests
- [ ] All existing `.contract.md` tests pass unchanged
- [ ] `bun test` green across all packages
- [ ] `ferret lint` under 500ms gate still passes
- [ ] `packages/core/src/index.ts` exports `Contract`, `defineContract`, `isContract`, `extractFromContractFile`
- [ ] `packages/core/package.json` includes `zod-to-json-schema`
- [ ] `packages/core/src/extractor/frontmatter.ts` `extractedBy` union includes `'typescript'`
- [ ] Published as v0.3.0 to npm

---

_© Laser Unicorn — MIT License_
