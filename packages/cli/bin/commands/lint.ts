import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import pc from "picocolors";
import {
  getStore,
  Reconciler,
  findProjectRoot,
  loadConfig,
  hashSchema,
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
  .option(
    "--perf-budget-ms <ms>",
    "Fail (exit 1) if lint runtime exceeds this budget in milliseconds",
  )
  .option("--force", "Re-extract all files before linting")
  .action(async (options) => {
    const start = performance.now();
    const perfBudgetMs = parsePositiveMsBudget(options.perfBudgetMs);

    if (perfBudgetMs === null) {
      process.stderr.write(
        "ferret: invalid --perf-budget-ms value. Use a positive number.\n",
      );
      process.exit(2);
      return;
    }

    const root = findProjectRoot();
    const config = loadConfig();
    const contextPath = path.join(root, ".ferret", "context.json");
    const store = await getStore();
    const suggestionsEnabled = config.importSuggestions?.enabled !== false;
    const baselineMode = options.ci
      ? String(options.ciBaseline ?? "committed")
      : undefined;
    let committedContextSource: string | undefined;

    if (options.ci) {
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

      if (baselineMode === "committed") {
        committedContextSource = fs.readFileSync(contextPath, "utf-8");
      }
    }

    try {
      await store.init();

      if (options.ci && baselineMode === "committed") {
        await restoreCommittedBaseline(store, contextPath);
      }

      // Run scan first (inline — keeps lint under 50 lines by delegating to scan logic)
      await runScan(root, options);

      if (committedContextSource !== undefined) {
        fs.writeFileSync(contextPath, committedContextSource, "utf-8");
      }

      // Reconcile
      const reconciler = new Reconciler(store);
      const report = await reconciler.reconcile();

      const contracts = await store.getContracts();
      const contractCount = contracts.length;
      const ms = Math.round(performance.now() - start);
      const perfExceeded = perfBudgetMs !== undefined && ms > perfBudgetMs;
      const hasIntegrityViolations =
        report.integrityViolations.unresolvedImports.length > 0 ||
        report.integrityViolations.selfImports.length > 0 ||
        report.integrityViolations.circularImports.length > 0;

      // Contract IDs whose schema change was classified as breaking by scan.
      // Used by both CI and human output so counts align with tree labels.
      const breakingTriggerIds = new Set(
        contracts.filter((c) => c.status === "needs-review").map((c) => c.id),
      );

      if (options.ci) {
        // CI mode: JSON to stdout, zero ANSI codes
        const breaking = report.flagged.filter((f) =>
          breakingTriggerIds.has(f.triggeredByContractId),
        ).length;
        const nonBreaking = report.flagged.filter(
          (f) => !breakingTriggerIds.has(f.triggeredByContractId),
        ).length;
        const output: Record<string, unknown> = {
          version: "2.0",
          consistent: report.consistent,
          breaking,
          nonBreaking,
          durationMs: ms,
          flagged: report.flagged,
          integrityViolations: report.integrityViolations,
          timestamp: report.timestamp,
        };
        if (perfBudgetMs !== undefined) {
          output.performanceBudgetMs = perfBudgetMs;
          output.performanceExceeded = perfExceeded;
        }
        if (options.ciSuggestions && suggestionsEnabled) {
          output.importSuggestions = report.importSuggestions;
        }
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        process.exit(
          hasIntegrityViolations ? 2 : perfExceeded ? 1 : report.consistent ? 0 : 1,
        );
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
        if (perfExceeded) {
          process.stderr.write(
            `ferret: performance budget exceeded for lint (${ms}ms > ${perfBudgetMs}ms).\n`,
          );
          process.exit(1);
          return;
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

      const breakingCount = report.flagged.filter((f) =>
        breakingTriggerIds.has(f.triggeredByContractId),
      ).length;
      const nonBreakingCount = report.flagged.filter(
        (f) => !breakingTriggerIds.has(f.triggeredByContractId),
      ).length;
      process.stdout.write(
        `  ${breakingCount} breaking  ${nonBreakingCount} non-breaking\n`,
      );
      process.stdout.write(
        `\n  ${pc.cyan("→")} Run ferret review to resolve\n\n`,
      );

      if (suggestionsEnabled) {
        renderImportSuggestions(report.importSuggestions, true);
      }

      process.exit(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const diagnostic = message.startsWith("ferret:")
        ? message
        : `ferret: ${message}`;
      if (options.ci) {
        process.stderr.write(JSON.stringify({ error: diagnostic }) + "\n");
      } else {
        process.stderr.write(diagnostic + "\n");
      }
      process.exit(2);
    } finally {
      await store.close();
    }
  });

function parsePositiveMsBudget(raw: unknown): number | undefined | null {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

type CommittedContext = {
  contracts: Array<{
    id: string;
    type: string;
    shape: unknown;
    status: "stable" | "roadmap" | "needs-review";
    specFile: string | null;
  }>;
  edges: Array<{
    from: string;
    to: string;
  }>;
  needsReview: string[];
};

async function restoreCommittedBaseline(
  store: Awaited<ReturnType<typeof getStore>>,
  contextPath: string,
): Promise<void> {
  const context = JSON.parse(
    fs.readFileSync(contextPath, "utf-8"),
  ) as CommittedContext;
  const existingNodes = await store.getNodes();
  const nodeIdByFilePath = new Map(
    existingNodes.map((node) => [node.file_path, node.id]),
  );
  const contractsByFilePath = new Map<string, CommittedContext["contracts"]>();

  for (const contract of context.contracts) {
    if (!contract.specFile) {
      continue;
    }
    const normalizedSpecFile = contract.specFile.replace(/\\/g, "/");
    const existing = contractsByFilePath.get(normalizedSpecFile) ?? [];
    existing.push(contract);
    contractsByFilePath.set(normalizedSpecFile, existing);
  }

  const dependencyTargetsByFilePath = new Map<string, string[]>();
  for (const edge of context.edges) {
    const normalizedFrom = edge.from.replace(/\\/g, "/");
    const existing = dependencyTargetsByFilePath.get(normalizedFrom) ?? [];
    existing.push(edge.to);
    dependencyTargetsByFilePath.set(normalizedFrom, existing);
  }

  const allFilePaths = new Set<string>([
    ...contractsByFilePath.keys(),
    ...dependencyTargetsByFilePath.keys(),
  ]);

  for (const filePath of allFilePaths) {
    const nodeId = nodeIdByFilePath.get(filePath) ?? randomUUID();
    const fileContracts = contractsByFilePath.get(filePath) ?? [];
    const nodeStatus = fileContracts.some(
      (contract) =>
        contract.status === "needs-review" ||
        context.needsReview.includes(contract.id),
    )
      ? "needs-review"
      : fileContracts.some((contract) => contract.status === "roadmap")
        ? "roadmap"
        : "stable";

    await store.upsertNode({
      id: nodeId,
      file_path: filePath,
      hash: "",
      status: nodeStatus,
    });

    for (const contract of fileContracts) {
      await store.upsertContract({
        id: contract.id,
        node_id: nodeId,
        shape_hash: hashSchema(contract.shape),
        shape_schema: JSON.stringify(contract.shape ?? {}),
        type: contract.type,
        status: contract.status,
      });
    }

    await store.replaceDependenciesForSourceNode(
      nodeId,
      dependencyTargetsByFilePath.get(filePath) ?? [],
    );
  }
}

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
