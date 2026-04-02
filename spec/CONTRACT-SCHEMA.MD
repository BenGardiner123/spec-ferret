# CONTRACT-SCHEMA.md

The definitive reference for how SpecFerret identifies, parses, and tracks contracts.
If something is not in this document, it is not supported behaviour.

---

## What is a Contract?

A contract is a named, typed, versioned shape that one part of your system
promises to provide and another part promises to consume.

Contracts are the edges of the graph. Everything SpecFerret does — extraction,
reconciliation, drift detection — operates on contracts, not on files.

A file is just the container. The contract is what matters.

---

## Part 1 — Spec Contracts

Spec contracts live in Markdown files inside your `specDir` (default: `contracts/`).
They are defined using YAML frontmatter at the top of the file.

### The Frontmatter Block

Every spec file that SpecFerret tracks must begin with a frontmatter block.
The block must be the very first thing in the file — no blank lines, no headings above it.

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
          format: uuid
        email:
          type: string
          format: email
      required: [id, email]
  imports:
    - auth.jwt
    - tables.user
---

# GET /users

Returns the list of registered users.

Everything below the closing --- is free-form prose.
Write whatever you want down here.
SpecFerret never reads it.
```

---

### Field Reference

#### `id` — required

The globally unique identifier for the contract this file exports.

**Format:** `<namespace>.<name>`

The namespace describes the kind of contract. The name describes what it is.
Use dot notation for nesting. Use forward slash for REST paths.

```yaml
id: api.GET/users             # a REST endpoint
id: tables.user               # a database table
id: types.UserProfile         # a shared type
id: flows.user-onboarding     # a user flow
id: events.user.created       # a domain event
id: config.rate-limits        # a configuration shape
```

**Rules:**
- Lowercase only
- No spaces — use hyphens for multi-word names
- The namespace must match the `type` field value
- IDs must be unique across the entire graph — SpecFerret will error on duplicates
- IDs are permanent — changing an ID is the same as deleting one contract and
  creating another, which triggers full downstream reconciliation

---

#### `type` — required

The category of contract this file defines.
Used for graph filtering and reporting.

| Type | Use for |
|---|---|
| `api` | REST endpoints, GraphQL operations, RPC methods |
| `table` | Database tables, collections, schemas |
| `type` | Shared TypeScript types, interfaces, enums |
| `flow` | User flows, multi-step processes, state machines |
| `event` | Domain events, webhooks, message queue payloads |
| `config` | Configuration shapes, feature flags, environment contracts |

**Rules:**
- Must be exactly one of the six values above
- If your contract does not fit any of these, use the closest one and open an issue

---

#### `shape` — required

A JSON Schema object describing the contract's data shape.
This is what SpecFerret hashes to detect drift.
If the shape changes, downstream nodes are flagged.

Shape must follow the supported JSON Schema subset defined in Part 3.
Free-form strings are not supported. Shape is always a structured object.

```yaml
shape:
  type: object
  properties:
    id:
      type: string
      format: uuid
    email:
      type: string
      format: email
  required: [id, email]
```

See Part 3 for the full list of supported keywords, types, and formats.

**Rules:**
- Shape is a JSON Schema object — not a string, not prose
- Only the supported subset is valid — unsupported keywords produce a warning
- Property order does not affect the hash — SpecFerret sorts keys before hashing
- Required array order does not affect the hash

---

#### `imports` — optional

The list of contract IDs that this spec file depends on.
These become the directed edges in the dependency graph.

```yaml
imports:
  - auth.jwt
  - tables.user
```

If this spec has no dependencies, omit the field entirely.
Do not write `imports: []`.

**Rules:**
- Every ID listed must exist in the graph — either already scanned or in the same scan batch
- SpecFerret warns on unresolved imports but does not fail the scan
- Self-imports are an error — a file cannot import its own contract ID
- Circular imports are detected and reported as errors — the graph must be acyclic

---

### Complete Spec File Examples

**Minimal — a standalone contract with no dependencies:**

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
        format: uuid
      email:
        type: string
        format: email
      created_at:
        type: string
        format: date-time
    required: [id, email, created_at]
---

# User Table

Stores registered users. One row per user account.
```

---

**Standard — a contract that depends on others:**

```markdown
---
ferret:
  id: api.POST/auth/login
  type: api
  shape:
    request:
      type: object
      properties:
        email:
          type: string
          format: email
        password:
          type: string
      required: [email, password]
    response:
      type: object
      properties:
        token:
          type: string
      required: [token]
  imports:
    - tables.user
---

# POST /auth/login

Authenticates a user and returns a signed JWT.
```

---

**Roadmap — a planned contract not yet built:**

```markdown
---
ferret:
  id: api.GET/recommendations
  type: api
  shape:
    response:
      type: array
      items:
        type: object
        properties:
          id:
            type: string
            format: uuid
          score:
            type: number
          documentId:
            type: string
            format: uuid
        required: [id, score, documentId]
  imports:
    - tables.document
  status: roadmap
---

# Recommendations Endpoint

Planned feature. Returns personalised document recommendations.
```

---

## Part 2 — Code Contracts

**Sprint 3 — Not Yet Built.**

Code contracts link implementation files to the spec graph via annotation comments.
This feature is on the roadmap and will be implemented in Sprint 3.

When built, developers will annotate their TypeScript functions, interfaces,
and schemas with `// @ferret-contract: <id>` to link them to a spec contract.
SpecFerret will then extract the structural shape using Tree-sitter and compare
it against the stored contract shape on every scan.

Do not use `@ferret-contract` annotations yet — they will be silently ignored
until Sprint 3 ships.

---

## Part 3 — Supported JSON Schema Subset

SpecFerret supports a deliberate subset of JSON Schema.
This subset covers the overwhelming majority of real API and data contract shapes.

---

### Primitive Types

```yaml
shape:
  type: string

shape:
  type: number

shape:
  type: integer

shape:
  type: boolean
```

---

### String Formats

```yaml
shape:
  type: string
  format: uuid        # UUID v4

shape:
  type: string
  format: date        # YYYY-MM-DD

shape:
  type: string
  format: date-time   # ISO 8601

shape:
  type: string
  format: email

shape:
  type: string
  format: uri
```

---

### Enums

```yaml
shape:
  type: string
  enum: [pending, active, cancelled]
```

---

### Objects

```yaml
shape:
  type: object
  properties:
    id:
      type: string
      format: uuid
    name:
      type: string
    score:
      type: number
  required: [id, name]
  additionalProperties: false
```

---

### Arrays

```yaml
shape:
  type: array
  items:
    type: string

shape:
  type: array
  items:
    type: object
    properties:
      id:
        type: string
      value:
        type: number
    required: [id]
```

---

### API Request/Response

A SpecFerret extension for describing API contracts with both
a request shape and a response shape at the top level.

```yaml
shape:
  request:
    type: object
    properties:
      query:
        type: string
      filters:
        type: array
        items:
          type: string
    required: [query]
  response:
    type: array
    items:
      type: object
      properties:
        id:
          type: string
        content:
          type: string
      required: [id, content]
```

---

### Unsupported Keywords

The following JSON Schema keywords are not supported.
If SpecFerret encounters them it prints a warning to stderr and continues.
It does not crash. It does not fail the scan.

```
$ref                    — no cross-schema references
allOf / anyOf / oneOf   — no schema composition
not                     — no negation
if / then / else        — no conditional schemas
$defs / definitions     — no reusable definitions
patternProperties       — no regex property keys
dependencies            — deprecated in JSON Schema draft 2019
```

Warning format:
```
⚠ Unsupported JSON Schema keyword: $ref in contracts/search.contract.md
  SpecFerret supports a subset of JSON Schema.
  See: spec/CONTRACT-SCHEMA.md — Part 3
```

---

### Breaking vs Non-Breaking Changes

**Breaking — triggers downstream reconciliation, exit 1 in CI:**

| Change | Example |
|---|---|
| Required field removed | `required: [id, email]` → `required: [id]` |
| Required field added | `required: [id]` → `required: [id, email]` |
| Field type changed | `type: string` → `type: integer` |
| Property removed | `properties: { id, email }` → `properties: { id }` |
| Enum value removed | `enum: [a, b, c]` → `enum: [a, b]` |
| Array items type changed | `items: { type: string }` → `items: { type: integer }` |
| Response type changed | `type: array` → `type: object` |

**Non-breaking — hash updated, no downstream flags:**

| Change | Example |
|---|---|
| Optional field added | New property not in `required` array |
| Enum value added | `enum: [a, b]` → `enum: [a, b, c]` |

**No-change — complete no-op, nothing happens:**

| Change | Example |
|---|---|
| Property order changed | `{ id, email }` → `{ email, id }` |
| Required array reordered | `required: [id, email]` → `required: [email, id]` |
| Whitespace differences | Indentation, spacing in YAML |

---

## Part 4 — The Contract Lifecycle

```
created     Contract appears in a spec file frontmatter for the first time.
            Registered in the store. Status: stable.

changed     Contract shape is edited in the spec file.
            Shape hash changes. Downstream nodes are flagged needs-review.
            Classification: breaking or non-breaking.

resolved    Developer addresses the drift and reruns ferret scan.
            Contract returns to stable status.

deleted     Sprint 3 — not yet implemented.
            Planned: spec file removed → downstream nodes flagged needs-review.
            Contract soft-deleted in store — audit trail preserved.
```

---

## Part 5 — Naming Conventions

These are conventions, not hard rules. Consistency within your project matters
more than following these exactly. Pick a style and encode it in your CLAUDE.md.

```
api.GET/resource
api.GET/resource/:id
api.POST/resource
api.PUT/resource/:id
api.DELETE/resource/:id

tables.users
tables.documents

types.Document
types.UserProfile
types.ApiResponse

events.user.created
events.document.published

flows.user-onboarding
flows.payment-checkout

config.rate-limits
config.feature-flags
```

---

## Part 6 — What SpecFerret Does Not Track

- **File contents below the frontmatter** — SpecFerret never reads your prose
- **Git history** — SpecFerret does not know who changed what or when
- **Runtime behaviour** — SpecFerret does not run or test your code
- **Type correctness** — SpecFerret tracks shape drift, not TypeScript type safety
- **Test coverage** — SpecFerret does not know if your contracts are tested
- **Code implementation** — Sprint 3. Not yet built.

SpecFerret does one thing: **it tells you when the graph is inconsistent.**
Everything else is your job.

---

*© Laser Unicorn — MIT License*