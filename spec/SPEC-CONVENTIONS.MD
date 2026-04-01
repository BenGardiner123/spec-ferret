# Spec Folder Conventions

The definitive reference for how to organise spec files in a SpecFerret project.
Covers native SpecFerret projects, BMAD/spec-kit integration, and naming rules.

---

## Part 1 — Folder Structure

### The Rule

SpecFerret owns `specs/`. Planning docs live elsewhere.

```
specs/           ← live contracts — SpecFerret reads this
spec/            ← planning docs, architecture, roadmap — SpecFerret ignores this
docs/            ← user-facing docs — SpecFerret ignores this
```

`specs/` is the contract tree. Every `.md` file under it must have valid
`ferret:` frontmatter or SpecFerret will warn on scan. Do not put prose-only
documents, meeting notes, or ADRs in `specs/`.

### Domain-First, Not Sprint-First

Organise by domain, not by sprint or ticket number. Sprints are temporal —
they stop making sense three weeks after they close. Domains are structural —
they match how your system actually works.

**Good — domain-first:**

```
specs/
  auth/
    jwt.md
    login.md
    refresh.md
  users/
    profile.md
    preferences.md
  search/
    query.md
    index.md
  tables/
    user.md
    document.md
    session.md
```

**Bad — sprint-first:**

```
specs/
  sprint-1/
    auth-jwt.md
    user-table.md
  sprint-2/
    search-query.md
    user-preferences.md
```

Sprint folders create three problems:

1. You can never find a contract without knowing when it was built
2. Related contracts are scattered across time-based siblings
3. Moving contracts between folders breaks file paths in version control

### Flat Is Fine

If your project has fewer than ~15 contracts, a flat `specs/` directory is
perfectly valid. Don't create folders for the sake of folders:

```
specs/
  jwt.md
  login.md
  user-table.md
  search-query.md
  example.md
```

Add domain folders when a flat list becomes hard to scan visually — typically
around 15–20 files.

### Nesting Depth

One level of domain folders is the recommendation. Two levels is the maximum.
Three levels means your spec tree is modelling your org chart, not your system.

```
# Good — one level
specs/auth/jwt.md

# Acceptable — two levels
specs/api/auth/login.md

# Too deep — stop
specs/api/v2/auth/internal/jwt.md
```

### The `specDir` Config

`ferret.config.json` controls where SpecFerret looks:

```json
{
  "specDir": "specs/",
  "filePattern": "**/*.md"
}
```

SpecFerret recursively scans all `.md` files under `specDir`. Subdirectories
are automatically included — no extra configuration needed.

---

## Part 2 — Naming Rules

### File Names

| Rule                    | Example                                                     |
| ----------------------- | ----------------------------------------------------------- |
| Lowercase only          | `jwt.md` not `JWT.md`                                       |
| Hyphens for multi-word  | `user-profile.md` not `user_profile.md` or `userProfile.md` |
| Match the contract name | `id: auth.jwt` → file: `auth/jwt.md` or `jwt.md`            |
| No spaces               | `rate-limits.md` not `rate limits.md`                       |
| `.md` extension         | Always Markdown                                             |

File names do not need to match contract IDs exactly, but a predictable mapping
makes the project navigable. The recommended convention:

```
Contract ID        File path
─────────────      ─────────────────
auth.jwt           specs/auth/jwt.md
tables.user        specs/tables/user.md
api.GET/users      specs/api/get-users.md
flows.onboarding   specs/flows/onboarding.md
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

Each `.md` file exports exactly one contract. If you need two contracts for the
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
spec/                    ← PRDs, architecture, stories, ADRs
  ↓ informs
specs/                   ← live contracts with ferret: frontmatter
  ↑ guards
SpecFerret               ← detects drift, flags dependencies
```

The handoff point is the frontmatter block. When a planning document defines a
contract shape, a developer (or an AI agent) creates a corresponding `.md` file
in `specs/` with the `ferret:` frontmatter. From that point forward, SpecFerret
owns the shape.

### Parallel Directory Convention

```
your-project/
  spec/                        ← planning docs (BMAD, spec-kit, ADRs)
    architecture.md
    prd-search-feature.md
    stories/
      sprint-2-stories.md
  specs/                       ← live contracts (SpecFerret)
    auth/
      jwt.md
      login.md
    search/
      query.md
      index.md
    tables/
      user.md
      document.md
  src/                         ← source code
  ferret.config.json
```

`spec/` (singular) is for humans and planning tools.
`specs/` (plural) is for SpecFerret.

This is a convention, not a requirement. SpecFerret only reads `specDir`.
You can name your planning folder anything — `docs/`, `planning/`, `.bmad/` —
as long as it is not inside `specDir`.

### Workflow: BMAD/spec-kit → SpecFerret

1. **Plan**: Use BMAD or spec-kit to produce a PRD, architecture doc, or story
2. **Extract contracts**: Identify the data shapes in the planning doc
3. **Create spec files**: Write `.md` files in `specs/` with `ferret:` frontmatter
4. **Scan**: Run `ferret scan` to register contracts in the graph
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
  specs/
    example.md                 ← starter template (delete when you have real specs)
  ferret.config.json           ← config (auto-created)
  CLAUDE.md                    ← AI agent instructions (auto-created)
```

Then build out your contract tree by domain:

```
specs/
  auth/
    jwt.md                     ← id: auth.jwt
    login.md                   ← id: api.POST/auth/login
    refresh.md                 ← id: api.POST/auth/refresh
  users/
    profile.md                 ← id: api.GET/users/profile
    table.md                   ← id: tables.user
  config/
    rate-limits.md             ← id: config.rate-limits
    feature-flags.md           ← id: config.feature-flags
```

### For BMAD/spec-kit Projects

Same as above, plus your planning directory:

```
your-project/
  .ferret/
    graph.db
    context.json
  spec/                        ← your planning docs (SpecFerret ignores)
    architecture.md
    prd-v2.md
    stories/
      sprint-3.md
  specs/                       ← live contracts (SpecFerret reads)
    auth/
      jwt.md
      login.md
    search/
      query.md
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
| Contract tree location    | `specs/` — singular `spec/` is for planning docs           |
| Folder structure          | Domain-first, never sprint-first                           |
| Nesting depth             | 1 level recommended, 2 max                                 |
| File naming               | Lowercase, hyphens, `.md` extension                        |
| One contract per file     | Yes, always                                                |
| Planning doc separation   | Keep planning docs outside `specDir`                       |
| Flat vs nested            | Flat is fine under ~15 files                               |
| BMAD/spec-kit integration | Parallel directories, manual bridge, SpecFerret downstream |

---

_© Laser Unicorn — MIT License_
