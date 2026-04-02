import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import pc from "picocolors";
import {
  getStore,
  Reconciler,
  findProjectRoot,
  loadConfig,
} from "@specferret/core";

export const lintCommand = new Command("lint")
  .description("Default daily command: check and block contract drift.")
  .option("--changed", "Scan only git-staged files before linting")
  .option(
    "--ci",
    "Machine-readable JSON output, no ANSI codes. Exit 1 on breaking drift.",
  )
  .option(
    "--ci-baseline <mode>",
    "CI baseline strategy: committed (default) or rebuild",
    "committed",
  )
  .option(
    "--ci-suggestions",
    "Include non-blocking import suggestions in --ci output",
  )
  .option("--force", "Re-extract all files before linting")
  .action(async (options) => {
    const start = performance.now();

    const root = findProjectRoot();
    const config = loadConfig();
    const contextPath = path.join(root, ".ferret", "context.json");
    const store = await getStore();
    const suggestionsEnabled = config.importSuggestions?.enabled !== false;

    if (options.ci) {
      const baselineMode = String(options.ciBaseline ?? "committed");
      if (baselineMode !== "committed" && baselineMode !== "rebuild") {
        process.stderr.write(
          "ferret: invalid --ci-baseline value. Use 'committed' or 'rebuild'.\n",
        );
        process.exit(2);
      }

      if (baselineMode === "committed" && !fs.existsSync(contextPath)) {
        process.stderr.write(
          "ferret: CI baseline missing (.ferret/context.json). " +
            "Commit context.json or run with --ci-baseline rebuild.\n",
        );
        process.exit(2);
      }
    }

    try {
      await store.init();

      // Run scan first (inline — keeps lint under 50 lines by delegating to scan logic)
      await runScan(root, options);

      // Reconcile
      const reconciler = new Reconciler(store);
      const report = await reconciler.reconcile();

      const contracts = await store.getContracts();
      const contractCount = contracts.length;
      const ms = Math.round(performance.now() - start);
      const hasIntegrityViolations =
        report.integrityViolations.unresolvedImports.length > 0 ||
        report.integrityViolations.selfImports.length > 0 ||
        report.integrityViolations.circularImports.length > 0;

      if (options.ci) {
        // CI mode: JSON to stdout, zero ANSI codes
        const breaking = report.flagged.filter((f) => f.depth === 1).length;
        const nonBreaking = report.flagged.filter((f) => f.depth > 1).length;
        const output: Record<string, unknown> = {
          version: "2.0",
          consistent: report.consistent,
          breaking,
          nonBreaking,
          flagged: report.flagged,
          integrityViolations: report.integrityViolations,
          timestamp: report.timestamp,
        };
        if (options.ciSuggestions && suggestionsEnabled) {
          output.importSuggestions = report.importSuggestions;
        }
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        process.exit(hasIntegrityViolations ? 2 : report.consistent ? 0 : 1);
        return;
      }

      if (hasIntegrityViolations) {
        process.stdout.write(`\n  ferret  import integrity violations\n\n`);
        renderIntegrityViolations(report.integrityViolations, true);
        process.stdout.write(
          `\n  ${pc.cyan("→")} Fix import integrity before merge\n\n`,
        );
        process.exit(2);
        return;
      }

      if (report.consistent) {
        // Boris clean state — exactly one line
        process.stdout.write(
          pc.green("✓ ferret") +
            `  ${contractCount} contracts  0 drift  ${ms}ms\n`,
        );
        if (suggestionsEnabled) {
          renderImportSuggestions(report.importSuggestions, true);
        }
        process.exit(0);
        return;
      }

      // Drift detected — Boris tree format
      const flaggedContracts = new Map<string, typeof report.flagged>();
      for (const item of report.flagged) {
        const existing = flaggedContracts.get(item.triggeredByContractId) ?? [];
        existing.push(item);
        flaggedContracts.set(item.triggeredByContractId, existing);
      }

      process.stdout.write(
        `\n  ferret  ${contractCount} contracts need review\n\n`,
      );

      for (const [contractId, affected] of flaggedContracts) {
        const contract = contracts.find((c) => c.id === contractId);
        const isBreaking = contract?.status === "needs-review";
        const label = isBreaking
          ? pc.red("BREAKING") + `  ${contractId}`
          : pc.yellow("NON-BREAKING") + `  ${contractId}`;
        process.stdout.write(`  ${label}\n`);

        for (let i = 0; i < affected.length; i++) {
          const item = affected[i];
          const isLast = i === affected.length - 1;
          const treeChar = isLast ? "└──" : "├──";
          const impact =
            item.impact === "direct"
              ? "imports this directly"
              : `imports this transitively (depth ${item.depth})`;
          process.stdout.write(`  ${treeChar} ${item.filePath}  ${impact}\n`);
        }
        process.stdout.write("\n");
      }

      const breakingCount = report.flagged.filter(
        (f) => f.impact === "direct",
      ).length;
      const transitiveCount = report.flagged.filter(
        (f) => f.impact === "transitive",
      ).length;
      process.stdout.write(
        `  ${breakingCount} breaking  ${transitiveCount} non-breaking\n`,
      );
      process.stdout.write(
        `\n  ${pc.cyan("→")} Run ferret review to resolve\n\n`,
      );

      if (suggestionsEnabled) {
        renderImportSuggestions(report.importSuggestions, true);
      }

      process.exit(1);
    } catch (err: any) {
      if (options.ci) {
        process.stderr.write(JSON.stringify({ error: String(err) }) + "\n");
      } else {
        process.stderr.write(`ferret: configuration error — ${err.message}\n`);
      }
      process.exit(2);
    } finally {
      await store.close();
    }
  });

async function runScan(
  root: string,
  options: { changed?: boolean; force?: boolean },
): Promise<void> {
  // Dynamically import scan to keep lint.ts thin
  const { scanCommand } = await import("./scan.js");
  const args = ["node", "scan"];
  if (options.changed) args.push("--changed");
  if (options.force) args.push("--force");
  // Silently suppress scan output for lint's own run
  const savedWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    await scanCommand.parseAsync(args, { from: "node" });
  } catch {
    // Scan errors are non-fatal for lint
  } finally {
    process.stdout.write = savedWrite;
  }
}

function renderImportSuggestions(
  suggestions: Array<{
    sourceContractId: string;
    sourceFilePath: string;
    suggestedImportId: string;
    confidence: "medium" | "high";
    evidence: string;
  }>,
  useColor: boolean,
): void {
  if (suggestions.length === 0) {
    return;
  }

  const warningLabel = useColor ? pc.yellow("SUGGEST") : "SUGGEST";
  process.stdout.write(`\n  ferret  import suggestions\n\n`);

  for (const suggestion of suggestions) {
    process.stdout.write(`  ${warningLabel}  ${suggestion.sourceContractId}\n`);
    process.stdout.write(
      `  └── ${suggestion.sourceFilePath}  consider importing ${suggestion.suggestedImportId} (${suggestion.confidence} confidence; ${suggestion.evidence})\n\n`,
    );
  }
}

function renderIntegrityViolations(
  integrityViolations: {
    unresolvedImports: Array<{
      contractId: string;
      filePath: string;
      importPath: string;
    }>;
    selfImports: Array<{
      contractId: string;
      filePath: string;
      importPath: string;
    }>;
    circularImports: Array<{
      contractId: string;
      filePath: string;
      importPath: string;
    }>;
  },
  useColor: boolean,
): void {
  const criticalLabel = useColor ? pc.red("CRITICAL") : "CRITICAL";

  for (const violation of integrityViolations.unresolvedImports) {
    process.stdout.write(`  ${criticalLabel}  ${violation.contractId}\n`);
    process.stdout.write(
      `  └── ${violation.filePath}  unresolved import ${violation.importPath}\n\n`,
    );
  }

  for (const violation of integrityViolations.selfImports) {
    process.stdout.write(`  ${criticalLabel}  ${violation.contractId}\n`);
    process.stdout.write(
      `  └── ${violation.filePath}  self-import ${violation.importPath}\n\n`,
    );
  }

  for (const violation of integrityViolations.circularImports) {
    process.stdout.write(`  ${criticalLabel}  ${violation.contractId}\n`);
    process.stdout.write(
      `  └── ${violation.filePath}  circular import ${violation.importPath}\n\n`,
    );
  }
}
