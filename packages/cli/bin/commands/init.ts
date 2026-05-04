import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SqliteStore } from '@specferret/core';

const EXAMPLE_SPEC = `---
ferret:
  id: api.GET/example
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
          name:
            type: string
        required: [id, name]
---

# Example Endpoint

Replace this with your first real spec.
Everything below the frontmatter is free-form prose.
Ferret never reads it.
`;

const CLAUDE_MD_CONTENT = `# CLAUDE.md

## SpecFerret Contract Graph

Read \`.ferret/context.json\` before generating any code that touches contracts.
This is the live contract graph. Treat it as ground truth over any contract file.

## What SpecFerret Does

SpecFerret tracks contract shapes and detects drift.
A contract is a named, typed, versioned data shape that one part of the system
promises to provide and another part promises to consume.
The graph tracks dependencies between contracts. When a shape changes, all
downstream dependents are flagged and must be reviewed before merge.

## Contract Types

Every contract has exactly one of these six types:

| Type | Use for |
|---|---|
| \`api\` | REST endpoints, GraphQL operations, RPC methods |
| \`table\` | Database tables, collections, schemas |
| \`type\` | Shared TypeScript types, interfaces, enums |
| \`flow\` | User flows, multi-step processes, state machines |
| \`event\` | Domain events, webhooks, message queue payloads |
| \`config\` | Configuration shapes, feature flags, environment contracts |

## Contract Files

- Live in \`contracts/\` and use the \`.contract.md\` extension
- Start with YAML frontmatter containing \`ferret: { id, type, shape }\`
- ID format: lowercase dot-namespaced — \`api.GET/users\`, \`tables.user\`, \`events.user.created\`
- Namespace must match the \`type\` field exactly

## Daily Workflow

1. Read \`.ferret/context.json\` — know what contracts exist before generating code
2. \`ferret lint\` — before and after any contract-touching change
3. Commit \`context.json\` after every clean lint — this is what makes the AI trustworthy
4. \`ferret review\` — guided resolution when drift is flagged

## Agent Skills

Full contract authoring guide: \`.claude/skills/ferret/write-contract/SKILL.md\`
Drift resolution guide: \`.claude/skills/ferret/resolve-drift/SKILL.md\`
TypeScript extraction guide: \`.claude/skills/ferret/extract-contract/SKILL.md\`

For bulk contract work, invoke the \`ferret-author\` agent.
`;

const DEFAULT_CONFIG = {
  specDir: 'contracts/',
  filePattern: '**/*.contract.md',
  includes: ['**/*.contract.md'],
  store: 'sqlite',
  importSuggestions: {
    enabled: true,
  },
  codeContracts: {
    include: ['src/**/*.ts'],
  },
};

const PRE_COMMIT_HOOK = `#!/bin/sh
# Ferret pre-commit hook — installed by \`ferret init\`
ferret lint --changed
`;

const CANONICAL_AGENT_RULES = `# SpecFerret Canonical Agent Rules

## Contract Lifecycle

- \`stable\` means no active drift and no pending review action.
- \`needs-review\` means drift exists and downstream impact must be reviewed.
- \`pending\` means unverified — written but not yet confirmed as implemented.
- \`blocked\` means merge must not proceed until review or remediation is complete.

## Enforcement Gates

- Run \`ferret lint\` before proposing or merging contract-affecting changes.
- Treat breaking drift as a merge blocker until resolved through \`ferret review\`.
- Use \`ferret review --json\` for machine workflows and audit-safe automation.
- Re-run \`ferret lint\` after review actions to confirm the repo returns to stable.

## Agent Workflow Expectations

- Read \`.ferret/context.json\` before making contract-sensitive changes.
- Preserve deterministic contract IDs and avoid ad-hoc type categories.
- Keep drift resolution explicit: \`accept\`, \`update\`, or \`reject\`.
`;

const ENFORCEMENT_RULES = `# SpecFerret Enforcement Rules

Always apply these rules in any repository with a \`.ferret/\` directory.

## Before generating code

- Read \`.ferret/context.json\` first. Know which contracts exist, their status, and their shapes.
- Do not generate code that consumes a contract shape you have not verified against context.json.

## Before committing

- Run \`ferret lint\` if you have touched any file in \`contracts/\` or any type annotated with \`@ferret-contract\`.
- Do not commit if lint reports drift. Resolve via \`ferret review\` first.

## Contract IDs are permanent

- Do not rename a contract ID without treating it as a deletion + creation.
- Renaming an ID triggers full downstream reconciliation. Flag this explicitly.

## Breaking vs non-breaking

Breaking (blocks merge): required field removed, field type changed, property removed, enum value removed.
Non-breaking (no block): optional field added, enum value added, description changed.
`;

const CONTRACT_AUTHORING_RULES = `# SpecFerret Contract Authoring Rules

Always apply these rules when writing or editing \`.contract.md\` files.

## ID format

- Lowercase, dot-namespaced: \`api.GET/users\`, \`tables.user\`, \`events.user.created\`, \`types.UserProfile\`
- Namespace must match the \`type\` field exactly: type=api → id must start with \`api.\`
- No spaces — use hyphens for multi-word names: \`flows.user-onboarding\`
- IDs are globally unique across the entire repo — SpecFerret errors on duplicates

## Valid type values (closed set)

- \`api\` — REST endpoints, GraphQL operations, RPC methods
- \`table\` — database tables, collections, schemas
- \`type\` — shared TypeScript types, interfaces, enums
- \`flow\` — user flows, multi-step processes, state machines
- \`event\` — domain events, webhooks, message queue payloads
- \`config\` — configuration shapes, feature flags, environment contracts

Any other value fails extraction. Do not invent new type values.

## Supported JSON Schema subset

Supported: object, array, string, number, integer, boolean, null
String formats: uuid, date, date-time, email, uri
Keywords: type, properties, required, items, enum, description, additionalProperties

NOT supported (SpecFerret prints a warning and continues):
  $ref, allOf, anyOf, oneOf, not, if/then/else, $defs, patternProperties

## Required array rules

- Always list \`required\` as an inline array: \`required: [id, email]\`
- Order does not affect the hash — SpecFerret sorts before hashing
- Omit \`required\` entirely if no fields are required (not \`required: []\`)

## imports

- Use \`imports\` to declare explicit dependencies on other contracts
- Every listed ID must exist in the graph — SpecFerret warns on unresolved imports
- Omit entirely if no dependencies (not \`imports: []\`)
`;

const WRITE_CONTRACT_SKILL = `---
name: ferret-write-contract
description: >
  Full authoring guide for SpecFerret contracts. Use this skill whenever you
  need to create or review a .contract.md file. Contains the complete schema
  reference, ID naming rules, JSON Schema subset, and one example per contract type.
---

# Write a SpecFerret Contract

## Frontmatter structure

Every contract file starts with YAML frontmatter. The \`ferret:\` block is required.
Everything after the closing \`---\` is free-form prose — SpecFerret never reads it.

\`\`\`markdown
---
ferret:
  id: api.GET/users
  type: api
  shape:
    type: object
    properties:
      users:
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
    required: [users]
---

# GET /users

Returns the list of registered users.
\`\`\`

## ID naming

| Pattern | Example |
|---|---|
| REST endpoint | \`api.GET/users\`, \`api.POST/auth/login\`, \`api.DELETE/users/{id}\` |
| Database table | \`tables.user\`, \`tables.document\` |
| Shared type | \`types.UserProfile\`, \`types.PaginatedResponse\` |
| User flow | \`flows.user-onboarding\`, \`flows.checkout\` |
| Domain event | \`events.user.created\`, \`events.payment.failed\` |
| Config shape | \`config.rate-limits\`, \`config.feature-flags\` |

Namespace must match \`type\` exactly. Lowercase only. No spaces.

## One example per type

### api — REST endpoint with request + response

\`\`\`markdown
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
\`\`\`

### table — database table

\`\`\`markdown
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
\`\`\`

### type — shared TypeScript type

\`\`\`markdown
---
ferret:
  id: types.PaginatedResponse
  type: type
  shape:
    type: object
    properties:
      items:
        type: array
        items:
          type: object
      total:
        type: integer
      page:
        type: integer
      pageSize:
        type: integer
    required: [items, total, page, pageSize]
---
\`\`\`

### event — domain event

\`\`\`markdown
---
ferret:
  id: events.user.created
  type: event
  shape:
    type: object
    properties:
      userId:
        type: string
        format: uuid
      email:
        type: string
        format: email
      occurredAt:
        type: string
        format: date-time
    required: [userId, email, occurredAt]
---
\`\`\`

### config — configuration shape

\`\`\`markdown
---
ferret:
  id: config.rate-limits
  type: config
  shape:
    type: object
    properties:
      requestsPerMinute:
        type: integer
      burstLimit:
        type: integer
    required: [requestsPerMinute]
---
\`\`\`

### flow — user flow (status enum pattern)

\`\`\`markdown
---
ferret:
  id: flows.checkout
  type: flow
  shape:
    type: object
    properties:
      status:
        type: string
        enum: [pending, processing, completed, failed]
      orderId:
        type: string
        format: uuid
    required: [status, orderId]
---
\`\`\`

## Pending contracts

Use \`status: pending\` (or omit status) for contracts not yet verified as implemented.
SpecFerret tracks them in the graph but shows them as unverified (not blocking).

\`\`\`yaml
ferret:
  id: api.GET/recommendations
  type: api
  status: pending
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
        required: [id, score]
\`\`\`

## After writing

Run \`ferret lint\` to validate. First-time scan: if green, commit \`.ferret/context.json\`.
`;

const RESOLVE_DRIFT_SKILL = `---
name: ferret-resolve-drift
description: >
  Guided workflow for resolving SpecFerret drift reports. Use when ferret lint
  exits 1. Covers the accept/update/reject decision tree and how to return to stable.
---

# Resolve SpecFerret Drift

## When ferret lint exits 1

Drift means a contract shape changed after it was committed to the store.
Downstream dependents are flagged \`needs-review\` until the drift is resolved.

## Decision tree

**BREAKING drift** (required field removed, field type changed, property removed):
- Accept: you own all downstream consumers and have already updated them → \`ferret review --contract <id> --action accept\`
- Reject: the shape change was a mistake → revert the contract file and re-lint
- Update: you need to update the contract to the new shape and notify consumers → \`ferret review --contract <id> --action update\`

**NON-BREAKING drift** (optional field added, enum value added):
- Usually safe to accept → \`ferret review --contract <id> --action accept\`

## Commands

\`\`\`bash
ferret lint                                        # see what is drifted
ferret review --contract <id> --action accept      # accept the new shape as canonical
ferret review --contract <id> --action update      # update contract + flag downstream
ferret review --contract <id> --action reject      # revert acceptance (manual file fix needed)
ferret review --json                               # machine-readable output for CI
ferret lint                                        # must return 0 before committing
\`\`\`

## Contract statuses after resolution

- \`stable\` — no drift, safe to merge
- \`needs-review\` — drift exists, merge blocked
- \`pending\` — unverified, not enforced

## CI behaviour

\`ferret lint --ci\` exits 1 on any drift. Use \`ferret lint --ci --ci-baseline rebuild\` in CI
so the pipeline never depends on a pre-committed context.json.
`;

const EXTRACT_CONTRACT_SKILL = `---
name: ferret-extract-contract
description: >
  Workflow for extracting SpecFerret contracts from annotated TypeScript source.
  Use when you have existing types or interfaces that should be tracked as contracts.
---

# Extract Contracts from TypeScript

## Annotate the source

Add \`// @ferret-contract\` on the line immediately above a TypeScript type, interface, or export.

\`\`\`typescript
// @ferret-contract
export type UserResponse = {
  users: Array<{ id: string; email: string }>;
};
\`\`\`

## Run extraction

\`\`\`bash
ferret extract src/types/user.ts
\`\`\`

This scaffolds a \`.contract.md\` file in \`contracts/\` with the shape extracted from the type.
The contract file gets a \`source:\` field pointing back to the TypeScript file.

## Upward drift

Once extracted, SpecFerret compares the live TypeScript type against the stored contract shape on every lint.
If the TypeScript type changes, \`ferret lint\` flags it — the code drifted from the spec.

## Workflow

\`\`\`bash
# Annotate the TypeScript source
# @ferret-contract
export type PaymentResult = { ... };

ferret extract src/types/payment.ts   # scaffolds contracts/payment.contract.md
ferret lint                           # baseline — must be green
# Edit the TypeScript type
ferret lint                           # detects upward drift
\`\`\`
`;

const FERRET_AUTHOR_AGENT = `---
name: ferret-author
description: >
  SpecFerret contract schema expert. Invoke this agent when creating or reviewing
  .contract.md files, naming contracts, designing import graphs, or validating shapes
  against the supported JSON Schema subset. Knows CONTRACT-SCHEMA.MD by heart.
tools: ["Read", "Write", "Bash"]
---

You are a SpecFerret contract author. You know the full SpecFerret contract schema.

## Your responsibilities

- Write structurally correct \`.contract.md\` files with valid frontmatter
- Name contracts using the correct dot-namespace convention (api.GET/users, tables.user, events.user.created)
- Choose the correct \`type\` from the closed set: api, table, type, flow, event, config
- Use only the supported JSON Schema subset (no $ref, allOf, anyOf, oneOf)
- Declare \`imports\` edges when contracts depend on other contracts
- Run \`ferret lint\` after writing and fix any errors before returning

## What you always do

1. Read \`.ferret/context.json\` first — know the existing graph before adding to it
2. Check for ID conflicts — IDs are globally unique, duplicates are an error
3. Use the authoring rules in \`.claude/rules/ferret/contract-authoring.md\`
4. Validate your output with \`ferret lint\` before completing

## What you never do

- Invent new type values beyond the six supported ones
- Use \`$ref\`, \`allOf\`, \`anyOf\`, \`oneOf\` — simplify to the supported subset
- Leave a contract with an ID namespace that does not match its type field
- Commit without a green \`ferret lint\`
`;

const FERRET_WRITE_COMMAND = `---
description: Scaffold a new SpecFerret contract for a given endpoint, table, type, event, flow, or config shape.
---

# /ferret-write

Scaffold a new SpecFerret contract.

## Steps

1. Read \`.ferret/context.json\` — check if a contract already exists for this shape
2. Determine the correct \`type\` (api, table, type, flow, event, config)
3. Name the contract ID using dot-namespace convention
4. Write the \`.contract.md\` file in \`contracts/\` with valid frontmatter
5. Declare \`imports\` if this contract depends on others
6. Run \`ferret lint\` — must exit 0 before finishing
7. Report the contract ID and file path

Use the full authoring guide: \`.claude/skills/ferret/write-contract/SKILL.md\`
Invoke the \`ferret-author\` agent for multiple contracts or complex import graphs.
`;

const FERRET_REVIEW_COMMAND = `---
description: Resolve SpecFerret drift using the guided accept/update/reject workflow.
---

# /ferret-review

Resolve drift flagged by \`ferret lint\`.

## Steps

1. Run \`ferret lint\` — identify what is drifted and whether it is breaking or non-breaking
2. For each drifted contract, decide: accept / update / reject
   - Breaking drift: is the shape change intentional? Are downstream consumers updated?
   - Non-breaking drift: safe to accept in almost all cases
3. Run \`ferret review --contract <id> --action <accept|update|reject>\`
4. Re-run \`ferret lint\` — must return 0 before committing

Use the full resolution guide: \`.claude/skills/ferret/resolve-drift/SKILL.md\`
`;

const COPILOT_INSTRUCTION_PACK = `---
description: "SpecFerret agent guardrails for contract lifecycle and drift enforcement."
applyTo: "**"
---

# SpecFerret Agent Instruction Pack

When working in this repository:

- Respect contract lifecycle states: \`stable\`, \`needs-review\`, \`pending\`, \`blocked\`.
- Run \`ferret lint\` before and after contract-affecting edits.
- If drift appears, use \`ferret review\` and document whether action is \`accept\`, \`update\`, or \`reject\`.
- For automated flows, prefer machine output from \`ferret lint --ci\` and \`ferret review --json\`.
- Keep contract changes deterministic and aligned with canonical type semantics.
`;

const ADAPTER_TARGETS = ['claude', 'copilot', 'gemini'] as const;
type AdapterTarget = (typeof ADAPTER_TARGETS)[number];

type AdapterWriteResult = 'created' | 'updated' | 'unchanged' | 'skipped-unmanaged';

export const initCommand = new Command('init')
  .description('Initialise SpecFerret in the current project.')
  .option('--no-hook', 'Skip pre-commit hook installation')
  .option('--no-agent-rules', 'Skip canonical agent rules scaffolding')
  .option('--agent-targets <targets>', 'Comma-separated adapter targets (claude,copilot,gemini)', ADAPTER_TARGETS.join(','))
  .action(async (options) => {
    const root = process.cwd();
    const ferretDir = path.join(root, '.ferret');
    const dbPath = path.join(ferretDir, 'graph.db');
    const alreadyInitialised = fs.existsSync(dbPath);

    const targetSelection = parseAdapterTargets(String(options.agentTargets ?? ADAPTER_TARGETS.join(',')));
    if (!targetSelection.ok) {
      process.stderr.write(`ferret: ${targetSelection.error}\n`);
      process.exit(2);
      return;
    }

    // Idempotency check — already initialised
    if (alreadyInitialised) {
      process.stdout.write('Already initialised.\n');
      process.stdout.write('✓ ferret initialised (existing project)\n');
    } else {
      process.stdout.write('✓ ferret initialised\n');
      process.stdout.write('  .ferret/graph.db     created\n');
      process.stdout.write('  contracts/example.contract.md  created\n');
      process.stdout.write('  CLAUDE.md            created\n');
      process.stdout.write('  ferret.config.json   created\n');
    }

    if (!alreadyInitialised) {
      // 1. Create .ferret/graph.db silently — no prompt, no question
      const store = new SqliteStore(dbPath);
      await store.init();
      await store.close();

      // 2. contracts/ directory
      const contractsDir = path.join(root, 'contracts');
      if (!fs.existsSync(contractsDir)) {
        fs.mkdirSync(contractsDir, { recursive: true });
      }

      // 3. contracts/example.contract.md with valid frontmatter template
      const examplePath = path.join(contractsDir, 'example.contract.md');
      if (!fs.existsSync(examplePath)) {
        fs.writeFileSync(examplePath, EXAMPLE_SPEC, 'utf-8');
      }

      // 4. CLAUDE.md with context.json instruction
      const claudePath = path.join(root, 'CLAUDE.md');
      if (!fs.existsSync(claudePath)) {
        fs.writeFileSync(claudePath, CLAUDE_MD_CONTENT, 'utf-8');
      }

      // 5. ferret.config.json with defaults including codeContracts.include
      const configPath = path.join(root, 'ferret.config.json');
      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');
      }
    }

    // 6. Canonical agent rules source + instruction pack scaffolding
    if (options.agentRules !== false) {
      const canonicalRulesDir = path.join(root, '.github', 'specferret');
      if (!fs.existsSync(canonicalRulesDir)) {
        fs.mkdirSync(canonicalRulesDir, { recursive: true });
      }

      const canonicalRulesPath = path.join(canonicalRulesDir, 'canonical-agent-rules.md');
      if (!fs.existsSync(canonicalRulesPath)) {
        fs.writeFileSync(canonicalRulesPath, CANONICAL_AGENT_RULES, 'utf-8');
      }

      const instructionsDir = path.join(root, '.github', 'instructions');
      if (!fs.existsSync(instructionsDir)) {
        fs.mkdirSync(instructionsDir, { recursive: true });
      }

      const instructionPackPath = path.join(instructionsDir, 'specferret-agent.instructions.md');
      if (!fs.existsSync(instructionPackPath)) {
        fs.writeFileSync(instructionPackPath, COPILOT_INSTRUCTION_PACK, 'utf-8');
      }

      const canonicalRules = fs.readFileSync(canonicalRulesPath, 'utf-8');
      const adapterDir = path.join(canonicalRulesDir, 'adapters');
      if (!fs.existsSync(adapterDir)) {
        fs.mkdirSync(adapterDir, { recursive: true });
      }

      const adapterResults = new Map<AdapterTarget, AdapterWriteResult>();
      for (const target of targetSelection.targets) {
        const adapterPath = path.join(adapterDir, `${target}.adapter.md`);
        const generated = generateAdapterArtifact(target, canonicalRules);
        adapterResults.set(target, writeManagedAdapter(adapterPath, target, generated));
      }

      process.stdout.write('  .github/specferret/canonical-agent-rules.md  scaffolded\n');
      process.stdout.write('  .github/instructions/specferret-agent.instructions.md  scaffolded\n');
      for (const target of targetSelection.targets) {
        const result = adapterResults.get(target);
        process.stdout.write(`  .github/specferret/adapters/${target}.adapter.md  ${result}\n`);
      }
    }

    // 7. Claude-layer authoring knowledge: rules, skills, agent, commands
    if (options.agentRules !== false) {
      // Rules
      const claudeRulesDir = path.join(root, '.claude', 'rules', 'ferret');
      if (!fs.existsSync(claudeRulesDir)) {
        fs.mkdirSync(claudeRulesDir, { recursive: true });
      }
      writeIfAbsent(path.join(claudeRulesDir, 'enforcement.md'), ENFORCEMENT_RULES);
      writeIfAbsent(path.join(claudeRulesDir, 'contract-authoring.md'), CONTRACT_AUTHORING_RULES);

      // Skills
      const writeContractSkillDir = path.join(root, '.claude', 'skills', 'ferret', 'write-contract');
      const resolveDriftSkillDir = path.join(root, '.claude', 'skills', 'ferret', 'resolve-drift');
      const extractSkillDir = path.join(root, '.claude', 'skills', 'ferret', 'extract-contract');
      fs.mkdirSync(writeContractSkillDir, { recursive: true });
      fs.mkdirSync(resolveDriftSkillDir, { recursive: true });
      fs.mkdirSync(extractSkillDir, { recursive: true });
      writeIfAbsent(path.join(writeContractSkillDir, 'SKILL.md'), WRITE_CONTRACT_SKILL);
      writeIfAbsent(path.join(resolveDriftSkillDir, 'SKILL.md'), RESOLVE_DRIFT_SKILL);
      writeIfAbsent(path.join(extractSkillDir, 'SKILL.md'), EXTRACT_CONTRACT_SKILL);

      // Agent
      const claudeAgentsDir = path.join(root, '.claude', 'agents');
      if (!fs.existsSync(claudeAgentsDir)) {
        fs.mkdirSync(claudeAgentsDir, { recursive: true });
      }
      writeIfAbsent(path.join(claudeAgentsDir, 'ferret-author.md'), FERRET_AUTHOR_AGENT);

      // Commands
      const claudeCommandsDir = path.join(root, '.claude', 'commands');
      if (!fs.existsSync(claudeCommandsDir)) {
        fs.mkdirSync(claudeCommandsDir, { recursive: true });
      }
      writeIfAbsent(path.join(claudeCommandsDir, 'ferret-write.md'), FERRET_WRITE_COMMAND);
      writeIfAbsent(path.join(claudeCommandsDir, 'ferret-review.md'), FERRET_REVIEW_COMMAND);

      process.stdout.write('  .claude/rules/ferret/enforcement.md  scaffolded\n');
      process.stdout.write('  .claude/rules/ferret/contract-authoring.md  scaffolded\n');
      process.stdout.write('  .claude/skills/ferret/write-contract/SKILL.md  scaffolded\n');
      process.stdout.write('  .claude/skills/ferret/resolve-drift/SKILL.md  scaffolded\n');
      process.stdout.write('  .claude/skills/ferret/extract-contract/SKILL.md  scaffolded\n');
      process.stdout.write('  .claude/agents/ferret-author.md  scaffolded\n');
      process.stdout.write('  .claude/commands/ferret-write.md  scaffolded\n');
      process.stdout.write('  .claude/commands/ferret-review.md  scaffolded\n');
    }

    // 8. Pre-commit hook — installed by default, explicit opt-out via --no-hook
    if (options.hook !== false) {
      const hookResult = installHook(root);
      if (hookResult === 'installed') {
        process.stdout.write('  .git/hooks/pre-commit installed\n');
      } else if (hookResult === 'exists') {
        process.stdout.write('  .git/hooks/pre-commit skipped (already exists)\n');
      } else {
        process.stdout.write('  .git/hooks/pre-commit skipped (.git/hooks unavailable)\n');
      }
    }

    process.stdout.write('\nRun: ferret lint\n');
    process.exit(0);
  });

type HookInstallResult = 'installed' | 'exists' | 'unavailable';

function writeIfAbsent(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

function installHook(root: string): HookInstallResult {
  const gitHooksDir = path.join(root, '.git', 'hooks');
  if (!fs.existsSync(gitHooksDir)) return 'unavailable';

  const hookPath = path.join(gitHooksDir, 'pre-commit');
  if (fs.existsSync(hookPath)) {
    return 'exists';
  }

  fs.writeFileSync(hookPath, PRE_COMMIT_HOOK, {
    mode: 0o755,
    encoding: 'utf-8',
  });

  return 'installed';
}

function parseAdapterTargets(rawTargets: string): { ok: true; targets: AdapterTarget[] } | { ok: false; error: string } {
  const requested = rawTargets
    .split(',')
    .map((target) => target.trim().toLowerCase())
    .filter(Boolean);

  if (requested.length === 0) {
    return { ok: false, error: `invalid --agent-targets value. Use one or more of: ${ADAPTER_TARGETS.join(', ')}` };
  }

  const unsupported = requested.filter((target) => !ADAPTER_TARGETS.includes(target as AdapterTarget));
  if (unsupported.length > 0) {
    return {
      ok: false,
      error: `unsupported agent targets: ${unsupported.join(', ')}. Supported targets: ${ADAPTER_TARGETS.join(', ')}`,
    };
  }

  return { ok: true, targets: [...new Set(requested)] as AdapterTarget[] };
}

function generateAdapterArtifact(target: AdapterTarget, canonicalRules: string): string {
  const managedHeader = `<!-- specferret:generated-adapter target=${target} version=1 -->`;
  const canonicalBlock = canonicalRules.trimEnd();

  if (target === 'claude') {
    return `${managedHeader}\n# CLAUDE Adapter\n\nThis adapter is generated from canonical SpecFerret rules.\n\n${canonicalBlock}\n`;
  }

  if (target === 'copilot') {
    return `---\ndescription: "Generated Copilot adapter from SpecFerret canonical rules."\napplyTo: "**"\n---\n\n${managedHeader}\n# Copilot Adapter\n\nThis adapter is generated from canonical SpecFerret rules.\n\n${canonicalBlock}\n`;
  }

  return `${managedHeader}\n# Gemini Adapter\n\nThis adapter is generated from canonical SpecFerret rules.\n\n${canonicalBlock}\n`;
}

function writeManagedAdapter(filePath: string, target: AdapterTarget, nextContent: string): AdapterWriteResult {
  const managedToken = `specferret:generated-adapter target=${target} version=1`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, nextContent, 'utf-8');
    return 'created';
  }

  const existing = fs.readFileSync(filePath, 'utf-8');
  if (!existing.includes(managedToken)) {
    return 'skipped-unmanaged';
  }

  if (existing === nextContent) {
    return 'unchanged';
  }

  fs.writeFileSync(filePath, nextContent, 'utf-8');
  return 'updated';
}
