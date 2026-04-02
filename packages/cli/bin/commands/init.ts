import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { SqliteStore } from "@specferret/core";

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
This is the live contract graph. Treat it as ground truth over any spec file.

Run \`ferret lint\` before generating code that touches contracts.
`;

const DEFAULT_CONFIG = {
  specDir: "contracts/",
  filePattern: "**/*.contract.md",
  includes: ["**/*.contract.md"],
  store: "sqlite",
  codeContracts: {
    include: ["src/**/*.ts"],
  },
};

const PRE_COMMIT_HOOK = `#!/bin/sh
# Ferret pre-commit hook — installed by \`ferret init\`
ferret lint --changed
`;

export const initCommand = new Command("init")
  .description("Initialise SpecFerret in the current project.")
  .option("--no-hook", "Skip pre-commit hook installation prompt")
  .action(async (options) => {
    const root = process.cwd();
    const ferretDir = path.join(root, ".ferret");
    const dbPath = path.join(ferretDir, "graph.db");

    // Idempotency check — already initialised
    if (fs.existsSync(dbPath)) {
      process.stdout.write("Already initialised.\n");
      process.exit(0);
    }

    // 1. Create .ferret/graph.db silently — no prompt, no question
    const store = new SqliteStore(dbPath);
    await store.init();
    await store.close();

    // 2. contracts/ directory
    const contractsDir = path.join(root, "contracts");
    if (!fs.existsSync(contractsDir)) {
      fs.mkdirSync(contractsDir, { recursive: true });
    }

    // 3. contracts/example.contract.md with valid frontmatter template
    const examplePath = path.join(contractsDir, "example.contract.md");
    if (!fs.existsSync(examplePath)) {
      fs.writeFileSync(examplePath, EXAMPLE_SPEC, "utf-8");
    }

    // 4. CLAUDE.md with context.json instruction
    const claudePath = path.join(root, "CLAUDE.md");
    if (!fs.existsSync(claudePath)) {
      fs.writeFileSync(claudePath, CLAUDE_MD_CONTENT, "utf-8");
    }

    // 5. ferret.config.json with defaults including codeContracts.include
    const configPath = path.join(root, "ferret.config.json");
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
        "utf-8",
      );
    }

    process.stdout.write("✓ ferret initialised\n");
    process.stdout.write("  .ferret/graph.db     created\n");
    process.stdout.write("  contracts/example.contract.md  created\n");
    process.stdout.write("  CLAUDE.md            created\n");
    process.stdout.write("  ferret.config.json   created\n");

    // 6. Pre-commit hook — opt-in prompt only
    if (options.hook !== false) {
      const shouldInstall = await promptHook();
      if (shouldInstall) {
        installHook(root);
        process.stdout.write("  .git/hooks/pre-commit installed\n");
      }
    }

    process.stdout.write("\nRun: ferret scan\n");
  });

function installHook(root: string): void {
  const gitHooksDir = path.join(root, ".git", "hooks");
  if (!fs.existsSync(gitHooksDir)) return;

  const hookPath = path.join(gitHooksDir, "pre-commit");
  fs.writeFileSync(hookPath, PRE_COMMIT_HOOK, {
    mode: 0o755,
    encoding: "utf-8",
  });
}

function promptHook(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(false);
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Install pre-commit hook? (y/N) ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}
