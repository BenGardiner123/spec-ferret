````markdown
# SpecFerret keeps your specs honest.

AI coding tools build fast. Specs drift faster.

## Runtime

SpecFerret targets Bun 1.0+ and ships as a CLI tool.
It uses Bun's built-in `bun:sqlite` backend for the local graph store, so there is no separate runtime shim or database setup.

## Install

```bash
bun install -g @specferret/cli
ferret init
ferret lint
```

Requires Bun 1.0 or later. Install Bun at [bun.sh](https://bun.sh).

## Your First Spec

After `ferret init`, open `contracts/example.contract.md` and replace it with your first real contract:

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
ferret lint
```

You should see:

```
✓ ferret  1 contract  0 drift  12ms
```

Now change `required: [id, email]` to `required: [id]` and run lint again:

```bash
ferret lint
```

```
BREAKING api.GET/users — required field(s) removed: email
```

That's spec drift. SpecFerret caught it before your AI assistant, your teammates, or your users did.

Already using BMAD or spec-kit? Skip the example file. Pick a data shape from your PRD or architecture document, create a `.contract.md` file in `contracts/`, and run `ferret lint`. SpecFerret takes it from there.

`ferret scan` is still available for manual graph updates and debugging, but normal day-to-day flow should be lint-first.

## How It Works

SpecFerret watches your spec files. Each spec exports a contract — a typed JSON Schema shape defined in lightweight YAML frontmatter.

When a shape changes, SpecFerret classifies it: breaking or non-breaking. Breaking changes block your pre-commit hook. Non-breaking changes pass silently.

No LLM. No network call. No opinion. Just your specs, your contracts, and a fast deterministic check every time you commit.

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

## Working Alongside BMAD and spec-kit

SpecFerret is not a planning tool. It lives downstream of your planning workflow.

If you use BMAD, spec-kit, or any structured planning process, the integration is straightforward:

1. Your planning workflow produces a PRD, architecture doc, or stories
2. When that planning defines a concrete data shape — an API response, a table schema, a shared type — create a `.contract.md` file in `contracts/` with `ferret:` frontmatter
3. Run `ferret lint` to register and validate the contract
4. From that point, SpecFerret detects if the shape drifts

```
your-project/
  _bmad-output/          ← BMAD planning artifacts
    PRD.md
    architecture.md
  contracts/             ← SpecFerret guards this
    auth/
      jwt.contract.md
    tables/
      user.contract.md
  ferret.config.json
```

Planning tools define intent. SpecFerret enforces it.

### Agent Skills

To automate the bridge — having your AI agent read planning docs and scaffold the `.contract.md` files for you — copy the agent skill template for your tool:

| Tool           | Template                                                                                                 | Install location                           |
| -------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Claude Code    | [docs/agent-skills/ferret-extract.claude-command.md](docs/agent-skills/ferret-extract.claude-command.md) | `.claude/commands/ferret-extract.md`       |
| GitHub Copilot | [docs/agent-skills/ferret-extract.prompt.md](docs/agent-skills/ferret-extract.prompt.md)                 | `.github/prompts/ferret-extract.prompt.md` |

Once installed, invoke it (`/ferret-extract` in Claude Code, or via Copilot agent mode) and point it at your planning docs. It will create the contract files and run `ferret lint`.

---

MIT License
````
