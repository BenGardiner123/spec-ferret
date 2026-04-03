# Spec Folder Conventions

The definitive reference for how to organise spec files in a SpecFerret project.
Covers native SpecFerret projects, BMAD/spec-kit integration, and naming rules.

---

## Privacy Rule (Non-Negotiable)

Do not put personally identifiable information (PII) or secrets in any project documentation.

This applies to `contracts/`, `docs/`, `spec/`, examples, screenshots, runbooks,
release notes, and CI evidence links.

Never commit real:

- names, emails, phone numbers, addresses, government IDs
- API keys, tokens, passwords, cookies, session IDs, JWTs
- customer IDs or account IDs that can be traced to a real person

Use synthetic placeholders only, for example:

- `user@example.test`
- `USER_ID_PLACEHOLDER`
- `REDACTED_TOKEN`

If a log or screenshot includes sensitive data, redact it before commit. If redaction
is not possible, do not include it.

---

## Part 1 — Folder Structure

### The Rule

SpecFerret owns `contracts/`. Planning docs live elsewhere.

```
contracts/       ← live contracts — SpecFerret reads this
docs/            ← planning docs, architecture, roadmap — SpecFerret ignores this
```

`contracts/` is the contract tree. Every `.contract.md` file under it must have valid
`ferret:` frontmatter or SpecFerret will warn on scan. Do not put prose-only
documents, meeting notes, or ADRs in `contracts/`.

### Domain-First, Not Sprint-First

Organise by domain, not by sprint or ticket number. Sprints are temporal —
they stop making sense three weeks after they close. Domains are structural —
they match how your system actually works.

**Good — domain-first:**

```
contracts/
  auth/
    jwt.contract.md
    login.contract.md
    refresh.contract.md
  users/
    profile.contract.md
    preferences.contract.md
  search/
    query.contract.md
    index.contract.md
  tables/
    user.contract.md
    document.contract.md
    session.contract.md
```

**Bad — sprint-first:**

```
contracts/
  sprint-1/
    auth-jwt.contract.md
    user-table.contract.md
  sprint-2/
    search-query.contract.md
    user-preferences.contract.md
```

Sprint folders create three problems:

1. You can never find a contract without knowing when it was built
2. Related contracts are scattered across time-based siblings
3. Moving contracts between folders breaks file paths in version control

### Flat Is Fine

If your project has fewer than ~15 contracts, a flat `contracts/` directory is
perfectly valid. Don't create folders for the sake of folders:

```
contracts/
  jwt.contract.md
  login.contract.md
  user-table.contract.md
  search-query.contract.md
  example.contract.md
```

Add domain folders when a flat list becomes hard to scan visually — typically
around 15–20 files.

### Nesting Depth

One level of domain folders is the recommendation. Two levels is the maximum.
Three levels means your spec tree is modelling your org chart, not your system.

```
# Good — one level
contracts/auth/jwt.contract.md

# Acceptable — two levels
contracts/api/auth/login.contract.md

# Too deep — stop
contracts/api/v2/auth/internal/jwt.contract.md
```

### The `specDir` Config

`ferret.config.json` controls where SpecFerret looks:

```json
{
  "specDir": "contracts/",
  "filePattern": "**/*.contract.md"
}
```

SpecFerret recursively scans all `.contract.md` files under `specDir`. Subdirectories
are automatically included — no extra configuration needed.

---

## Part 2 — Naming Rules

### File Names

| Rule                     | Example                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| Lowercase only           | `jwt.contract.md` not `JWT.contract.md`                            |
| Hyphens for multi-word   | `user-profile.contract.md` not `user_profile.contract.md`          |
| Match the contract name  | `id: auth.jwt` → file: `auth/jwt.contract.md` or `jwt.contract.md` |
| No spaces                | `rate-limits.contract.md` not `rate limits.contract.md`            |
| `.contract.md` extension | Always — this is what SpecFerret scans for                         |

File names do not need to match contract IDs exactly, but a predictable mapping
makes the project navigable. The recommended convention:

```
Contract ID        File path
─────────────      ─────────────────────────────
auth.jwt           contracts/auth/jwt.contract.md
tables.user        contracts/tables/user.contract.md
api.GET/users      contracts/api/get-users.contract.md
flows.onboarding   contracts/flows/onboarding.contract.md
```

The namespace portion of the ID maps to the folder. The name portion maps to
the file. Forward slashes in REST paths become hyphens in file names.

### Contract IDs

Contract IDs are defined in CONTRACT-SCHEMA.MD. The short version:

```yaml
id: <namespace>.<name>
```

- Lowercase only
- Dot-separated namespace
- Hyphens for multi-word names
- Forward slash for REST paths: `api.GET/users`
- Unique across the entire graph

### One Contract Per File

Each `.contract.md` file exports exactly one contract. If you need two contracts for the
same endpoint (request and response as separate shapes), use two files or combine
them into a single shape with `request:` and `response:` keys.

---

## Part 3 — Using SpecFerret with BMAD / spec-kit

### What SpecFerret Is Not

SpecFerret is not a planning tool. It does not generate PRDs, user stories,
architecture documents, or implementation plans. It does not know about sprints,
epics, or backlogs.

SpecFerret is a **contract graph engine**. It tracks the shapes your system
promises to provide, detects when those shapes drift, and tells you what
downstream dependencies are affected.

### The Integration Pattern

If you use BMAD, spec-kit, or any structured planning workflow, the integration
is straightforward: **your planning tools generate the documents, SpecFerret
guards the contracts.**

```
Planning layer (BMAD / spec-kit / your process)
  ↓ writes
docs/                    ← PRDs, architecture, stories, ADRs
  ↓ informs
contracts/               ← live contracts with ferret: frontmatter
  ↑ guards
SpecFerret               ← detects drift, flags dependencies
```

The handoff point is the frontmatter block. When a planning document defines a
contract shape, a developer (or an AI agent) creates a corresponding `.contract.md` file
in `contracts/` with the `ferret:` frontmatter. From that point forward, SpecFerret
owns the shape.

### Parallel Directory Convention

```
your-project/
  docs/                        ← planning docs (BMAD, spec-kit, ADRs)
    architecture.md
    prd-search-feature.md
    stories/
      sprint-2-stories.md
  contracts/                   ← live contracts (SpecFerret)
    auth/
      jwt.contract.md
      login.contract.md
    search/
      query.contract.md
      index.contract.md
    tables/
      user.contract.md
      document.contract.md
  src/                         ← source code
  ferret.config.json
```

`docs/` is for humans and planning tools.
`contracts/` is for SpecFerret.

This is a convention, not a requirement. SpecFerret only reads `specDir`.
You can name your planning folder anything — `docs/`, `planning/`, `.bmad/` —
as long as it is not inside `specDir`.

### Workflow: BMAD/spec-kit → SpecFerret

1. **Plan**: Use BMAD or spec-kit to produce a PRD, architecture doc, or story
2. **Extract contracts**: Identify the data shapes in the planning doc
3. **Create spec files**: Write `.contract.md` files in `contracts/` with `ferret:` frontmatter
4. **Lint**: Run `ferret lint` to register and validate contracts in the graph
5. **Build**: Implement the feature
6. **Guard**: `ferret lint` runs on commit — catches drift before it ships

Steps 2–3 are the manual bridge today. Sprint 3 will add `@ferret-contract`
annotations that link code directly to spec contracts, tightening the loop.

### What SpecFerret Will Never Do

- Parse or understand BMAD templates
- Read spec-kit output formats
- Generate planning documents
- Replace your planning workflow

SpecFerret operates downstream of planning. It turns your decisions into
enforceable contracts. That's the boundary.

---

## Part 4 — Starter Tree

### For Native SpecFerret Projects

Run `ferret init` to get started:

```
your-project/
  .ferret/
    graph.db                   ← contract database (auto-created)
    context.json               ← live graph snapshot (auto-generated on scan)
  contracts/
    example.contract.md        ← starter template (delete when you have real contracts)
  ferret.config.json           ← config (auto-created)
  CLAUDE.md                    ← AI agent instructions (auto-created)
```

Then build out your contract tree by domain:

```
contracts/
  auth/
    jwt.contract.md            ← id: auth.jwt
    login.contract.md          ← id: api.POST/auth/login
    refresh.contract.md        ← id: api.POST/auth/refresh
  users/
    profile.contract.md        ← id: api.GET/users/profile
    table.contract.md          ← id: tables.user
  config/
    rate-limits.contract.md    ← id: config.rate-limits
    feature-flags.contract.md  ← id: config.feature-flags
```

### For BMAD/spec-kit Projects

Same as above, plus your planning directory:

```
your-project/
  .ferret/
    graph.db
    context.json
  docs/                        ← your planning docs (SpecFerret ignores)
    architecture.md
    prd-v2.md
    stories/
      sprint-3.md
  contracts/                   ← live contracts (SpecFerret reads)
    auth/
      jwt.contract.md
      login.contract.md
    search/
      query.contract.md
  src/
    ...
  ferret.config.json
  CLAUDE.md
```

### Minimal Viable Contract

The smallest valid spec file:

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

That's it. Three required fields in the frontmatter — `id`, `type`, `shape` —
plus a valid JSON Schema shape. Everything below the closing `---` is
free-form prose that SpecFerret never reads.

---

## Summary — The Opinions

| Topic                     | SpecFerret's position                                      |
| ------------------------- | ---------------------------------------------------------- |
| Contract tree location    | `contracts/` — completely separate from planning docs      |
| File extension            | `.contract.md` — SpecFerret scans only these files         |
| Folder structure          | Domain-first, never sprint-first                           |
| Nesting depth             | 1 level recommended, 2 max                                 |
| File naming               | Lowercase, hyphens, `.contract.md` extension               |
| One contract per file     | Yes, always                                                |
| Planning doc separation   | Keep planning docs outside `specDir`                       |
| Flat vs nested            | Flat is fine under ~15 files                               |
| BMAD/spec-kit integration | Parallel directories, manual bridge, SpecFerret downstream |

---

_© Laser Unicorn — MIT License_
