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

## Ferret Contract Graph

Always read \`.ferret/context.json\` before generating any code.
This is the live contract graph. Treat it as ground truth over any contract file.

Contract files live in \`contracts/\` and use the \`.contract.md\` extension.
Do not edit contract files without running \`ferret lint\` afterward.

Run \`ferret lint\` before generating any code that touches contracts.
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
- \`roadmap\` means planned but not yet active for enforcement.
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

const COPILOT_INSTRUCTION_PACK = `---
description: "SpecFerret agent guardrails for contract lifecycle and drift enforcement."
applyTo: "**"
---

# SpecFerret Agent Instruction Pack

When working in this repository:

- Respect contract lifecycle states: \`stable\`, \`needs-review\`, \`roadmap\`, \`blocked\`.
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

    if (!alreadyInitialised) {
      process.stdout.write('✓ ferret initialised\n');
      process.stdout.write('  .ferret/graph.db     created\n');
      process.stdout.write('  contracts/example.contract.md  created\n');
      process.stdout.write('  CLAUDE.md            created\n');
      process.stdout.write('  ferret.config.json   created\n');
    } else {
      process.stdout.write('✓ ferret initialised (existing project)\n');
    }

    // 7. Pre-commit hook — installed by default, explicit opt-out via --no-hook
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
    return `${managedHeader}\n---\ndescription: "Generated Copilot adapter from SpecFerret canonical rules."\napplyTo: "**"\n---\n\n# Copilot Adapter\n\nThis adapter is generated from canonical SpecFerret rules.\n\n${canonicalBlock}\n`;
  }

  return `${managedHeader}\n# Gemini Adapter\n\nThis adapter is generated from canonical SpecFerret rules.\n\n${canonicalBlock}\n`;
}

function writeManagedAdapter(filePath: string, target: AdapterTarget, nextContent: string): AdapterWriteResult {
  const managedPrefix = `<!-- specferret:generated-adapter target=${target} version=1 -->`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, nextContent, 'utf-8');
    return 'created';
  }

  const existing = fs.readFileSync(filePath, 'utf-8');
  if (!existing.startsWith(managedPrefix)) {
    return 'skipped-unmanaged';
  }

  if (existing === nextContent) {
    return 'unchanged';
  }

  fs.writeFileSync(filePath, nextContent, 'utf-8');
  return 'updated';
}
