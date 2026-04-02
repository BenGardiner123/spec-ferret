# ferret-extract — Claude Code Command

Copy this file to `.claude/commands/ferret-extract.md` in your project.
Invoke it with `/ferret-extract` in Claude Code.

---

Read all planning documents in this project — `docs/`, `_bmad-output/`, `.specify/`, or wherever planning artifacts live.

Identify every concrete data shape: API request/response bodies, database table schemas, shared TypeScript types, domain events, configuration shapes, and user flows.

For each shape, create a `.contract.md` file in `contracts/` using this structure:

```markdown
---
ferret:
  id: <namespace>.<name>
  type: <api|table|type|event|flow|config>
  shape: <JSON Schema object>
  imports:
    - <contract id this shape depends on>
---

# <Title>

<One sentence describing what this contract represents.>
```

Rules:

- `id` format is `<namespace>.<name>` — e.g. `api.GET/users`, `tables.user`, `types.UserProfile`, `events.user.created`
- The namespace must match the `type` value
- File path should mirror the namespace: `contracts/auth/jwt.contract.md` for `id: auth.jwt`
- `shape` must be a valid JSON Schema object — use `request:` and `response:` keys for API contracts
- `imports` lists contract IDs this shape directly depends on — omit the field entirely if there are none
- Do not add `imports: []`
- One contract per file

After creating all files, run:

```bash
ferret scan
```

Report:

- Which contracts were created and their IDs
- Any shapes that were ambiguous or couldn't be cleanly mapped to a contract type
- Any imports you inferred but weren't certain about
