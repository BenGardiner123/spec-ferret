````markdown
# SpecFerret keeps your specs honest.

AI coding tools build fast. Specs drift faster.

## Runtime

SpecFerret targets Node.js 22+ and ships as a plain Node CLI.
It uses Node's built-in `node:sqlite` backend for the local graph store, so there is no Bun runtime requirement and no separate database setup.

## Install

```bash
npm install -g @specferret/cli
ferret init
ferret lint
```

## Your First Spec

After `ferret init`, open `specs/example.md` and replace it with your first real contract:

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
        email:
          type: string
      required: [id, email]
---

# GET /users

Returns the list of registered users.
```

Run:

```bash
ferret scan
ferret lint
```

You should see:

```
✓ ferret  1 contract  0 drift  12ms
```

Now change `required: [id, email]` to `required: [id]` and scan again:

```bash
ferret scan
```

```
BREAKING api.GET/users — required field(s) removed: email
```

That's spec drift. SpecFerret caught it before your AI assistant, your teammates, or your users did.

## How It Works

SpecFerret watches your spec files. Each spec exports a contract — a typed JSON Schema shape defined in lightweight YAML frontmatter.

When a shape changes, SpecFerret classifies it: breaking or non-breaking. Breaking changes block your pre-commit hook. Non-breaking changes pass silently.

No LLM. No network call. No opinion. Just your specs, your contracts, and a fast deterministic check every time you commit.

Clean runs stay clean. The CLI suppresses Node's SQLite experimental warning so `ferret lint` prints the result, not runtime noise.

## Contract Types

SpecFerret understands six kinds of contracts:

| Type     | Use for                                         |
| -------- | ----------------------------------------------- |
| `api`    | REST endpoints, GraphQL operations, RPC methods |
| `table`  | Database tables, collections, schemas           |
| `type`   | Shared TypeScript types, interfaces, enums      |
| `event`  | Domain events, webhooks, message queue payloads |
| `flow`   | User flows, multi-step processes                |
| `config` | Configuration shapes, feature flags             |

## CI Integration

```bash
ferret lint --ci
```

Outputs JSON, exits 1 on drift. Drop it in any pipeline.

```yaml
# GitHub Actions
- run: ferret lint --ci
```

## Badge

```markdown
[![SpecFerret](https://img.shields.io/badge/spec--drift-protected-green)](https://specferret.dev)
```

[![SpecFerret](https://img.shields.io/badge/spec--drift-protected-green)](https://specferret.dev)

---

MIT License
````
