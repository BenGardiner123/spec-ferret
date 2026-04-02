import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type Mode = "clean" | "drift";

type Args = {
  mode: Mode;
  ferretEntry: string;
};

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function parseArgs(argv: string[]): Args {
  let mode: Mode = "clean";
  let ferretEntry = "packages/cli/dist/bin/ferret.js";

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--mode") {
      const value = argv[i + 1];
      if (value === "clean" || value === "drift") {
        mode = value;
        i++;
        continue;
      }
      fail(
        `Invalid --mode value: ${value ?? "<missing>"}. Use clean or drift.`,
      );
    }

    if (token === "--ferret-entry") {
      const value = argv[i + 1];
      if (!value) {
        fail("Missing value for --ferret-entry.");
      }
      ferretEntry = value;
      i++;
      continue;
    }

    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }

    fail(`Unknown argument: ${token}`);
  }

  return {
    mode,
    ferretEntry: resolve(process.cwd(), ferretEntry),
  };
}

function printHelp(): void {
  process.stdout.write(
    [
      "S34 smoke harness for SpecFerret.",
      "",
      "Usage:",
      "  bun scripts/smoke-s34.ts --mode <clean|drift> [--ferret-entry <path>]",
      "",
      "Modes:",
      "  clean  verifies init -> lint -> break -> block -> review -> green",
      "  drift  verifies init -> lint -> break -> block (intentional failure path)",
      "",
    ].join("\n"),
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const workDir = mkdtempSync(join(tmpdir(), "specferret-s34-"));

  process.stdout.write(
    `[S34] mode=${args.mode} ferretEntry=${args.ferretEntry} workDir=${workDir}\n`,
  );

  try {
    runStep(args.ferretEntry, workDir, ["init", "--no-hook"], {
      expectedExit: 0,
      label: "init",
    });

    runStep(args.ferretEntry, workDir, ["lint"], {
      expectedExit: 0,
      label: "lint-baseline",
    });

    applyBreakingChange(workDir);

    const blockedResult = runStep(args.ferretEntry, workDir, ["lint"], {
      expectedExit: 1,
      label: "lint-blocked",
    });

    if (!blockedResult.stdout.includes("Run ferret review to resolve")) {
      failWithDetails(
        "lint-blocked",
        ["lint output did not include review guidance"],
        blockedResult,
      );
    }

    if (args.mode === "drift") {
      process.stdout.write("[S34] intentional drift path verified\n");
      process.exit(0);
    }

    runStep(
      args.ferretEntry,
      workDir,
      ["review", "--contract", "api.GET/example", "--action", "accept"],
      {
        expectedExit: 0,
        label: "review-accept",
      },
    );

    runStep(args.ferretEntry, workDir, ["lint"], {
      expectedExit: 0,
      label: "lint-green",
    });

    process.stdout.write("[S34] clean path verified\n");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function applyBreakingChange(workDir: string): void {
  const contractPath = join(workDir, "contracts", "example.contract.md");
  const source = readFileSync(contractPath, "utf-8");
  const before = "required: [id, name]";
  const after = "required: [id]";

  if (!source.includes(before)) {
    fail(
      "Unable to apply deterministic break: expected template line 'required: [id, name]' was not found.",
    );
  }

  writeFileSync(contractPath, source.replace(before, after), "utf-8");
  process.stdout.write("[S34] applied intentional breaking change\n");
}

function runStep(
  ferretEntry: string,
  cwd: string,
  ferretArgs: string[],
  options: { expectedExit: number; label: string },
): CommandResult {
  const command = ["bun", ferretEntry, ...ferretArgs].join(" ");
  process.stdout.write(`[S34] ${options.label}: ${command}\n`);

  const result = spawnSync("bun", [ferretEntry, ...ferretArgs], {
    cwd,
    encoding: "utf-8",
  });

  const normalized: CommandResult = {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };

  if (normalized.status !== options.expectedExit) {
    failWithDetails(
      options.label,
      [
        `Expected exit code ${options.expectedExit} but received ${String(normalized.status)}`,
        "This indicates the end-to-end drift contract may have changed or a command regressed.",
      ],
      normalized,
    );
  }

  return normalized;
}

function failWithDetails(
  step: string,
  messages: string[],
  result?: CommandResult,
): never {
  const lines = [`[S34] FAILURE at step '${step}'`];
  lines.push(...messages.map((message) => `- ${message}`));

  if (result) {
    lines.push("- Captured stdout:");
    lines.push(result.stdout.length > 0 ? result.stdout.trimEnd() : "<empty>");
    lines.push("- Captured stderr:");
    lines.push(result.stderr.length > 0 ? result.stderr.trimEnd() : "<empty>");
  }

  process.stderr.write(lines.join("\n") + "\n");
  process.exit(1);
}

function fail(message: string): never {
  process.stderr.write(`[S34] ${message}\n`);
  process.exit(1);
}

main();
