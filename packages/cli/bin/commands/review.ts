import { Command } from "commander";
import { randomUUID } from "node:crypto";
import * as readline from "node:readline/promises";
import pc from "picocolors";
import {
  findProjectRoot,
  getStore,
  Reconciler,
  writeContext,
  type FerretContract,
  type FerretNode,
} from "@specferret/core";
import {
  buildIntegrityDiagnostics,
  buildReviewDiagnostics,
  DIAGNOSTICS_SCHEMA_VERSION,
  type MachineDiagnostic,
} from "./diagnostics.js";

const REVIEW_SCHEMA_VERSION = "1.1.0" as const;

type ReviewAction = "accept" | "update" | "reject";

type ReviewImpactItem = {
  nodeId: string;
  filePath: string;
  impact: "direct" | "transitive";
  depth: number;
};

type ReviewItem = {
  contractId: string;
  sourceNodeId: string;
  sourceFile: string;
  classification: "breaking" | "non-breaking";
  affectedCount: number;
  impact: {
    direct: ReviewImpactItem[];
    transitive: ReviewImpactItem[];
  };
  recommendedAction: ReviewAction;
  availableActions: ReviewAction[];
  suggestedActions: Array<{
    action: ReviewAction;
    confidence: "high" | "medium" | "low";
    reason: string;
  }>;
  dependencyContext: {
    directDependents: Array<{
      nodeId: string;
      filePath: string;
      depth: number;
    }>;
    transitiveDependents: Array<{
      nodeId: string;
      filePath: string;
      depth: number;
    }>;
  };
};

type ReviewJsonOutput = {
  version: "2.0";
  reviewSchemaVersion: typeof REVIEW_SCHEMA_VERSION;
  diagnosticsSchemaVersion: string;
  diagnostics: MachineDiagnostic[];
  reviewable: ReviewItem[];
  selected: string[];
  action: ReviewAction | null;
  result: {
    repoBlocked: boolean;
    clearedContracts: string[];
    clearedFiles: string[];
    blockedContracts: string[];
    blockedFiles: string[];
  } | null;
};

export const reviewCommand = new Command("review")
  .description("Guided review flow for contract drift.")
  .option(
    "--contract <ids>",
    "Specific contract id or comma-separated contract ids to review",
  )
  .option("--all", "Select all current review items")
  .option("--action <accept|update|reject>", "Review action to apply")
  .option("--json", "Emit structured review output to stdout")
  .option(
    "--note <text>",
    "Optional review note to persist in reconciliation log",
  )
  .action(async (options) => {
    const root = findProjectRoot();
    const store = await getStore();

    try {
      await store.init();
      await runScanQuietly(options);

      const reconciler = new Reconciler(store);
      const report = await reconciler.reconcile();
      const hasIntegrityViolations =
        report.integrityViolations.unresolvedImports.length > 0 ||
        report.integrityViolations.selfImports.length > 0 ||
        report.integrityViolations.circularImports.length > 0;

      if (hasIntegrityViolations) {
        if (options.json) {
          writeJson({
            version: "2.0",
            reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
            diagnosticsSchemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
            diagnostics: buildIntegrityDiagnostics(report.integrityViolations),
            reviewable: [],
            selected: [],
            action: null,
            result: null,
          });
        }
        process.stderr.write(
          "ferret review: fix import integrity violations before reviewing drift.\n",
        );
        process.exitCode = 2;
        return;
      }

      const nodes = await store.getNodes();
      const contracts = await store.getContracts();
      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      const affectedByContractId = new Map<string, typeof report.flagged>();

      for (const item of report.flagged) {
        const affected =
          affectedByContractId.get(item.triggeredByContractId) ?? [];
        affected.push(item);
        affectedByContractId.set(item.triggeredByContractId, affected);
      }

      const reviewableContracts = contracts
        .filter(
          (contract) =>
            contract.status === "needs-review" ||
            affectedByContractId.has(contract.id),
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const reviewItems = buildReviewItems(
        reviewableContracts,
        nodeById,
        affectedByContractId,
      );

      if (reviewItems.length === 0) {
        if (options.json) {
          writeJson({
            version: "2.0",
            reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
            diagnosticsSchemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
            diagnostics: [],
            reviewable: [],
            selected: [],
            action: null,
            result: null,
          });
        } else {
          process.stdout.write(
            `${pc.green("✓ ferret review")}  0 items need review\n`,
          );
        }
        process.exitCode = 0;
        return;
      }

      const selectedContractIds = await selectContracts(reviewItems, {
        contract: options.contract,
        all: options.all,
        json: options.json,
      });

      if (options.json && !options.action && selectedContractIds.length === 0) {
        writeJson({
          version: "2.0",
          reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
          diagnosticsSchemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
          diagnostics: buildReviewDiagnostics(reviewItems),
          reviewable: reviewItems,
          selected: [],
          action: null,
          result: null,
        });
        process.exitCode = 0;
        return;
      }

      if (selectedContractIds.length === 0) {
        process.stderr.write(
          "ferret review: no valid review items selected. Use --contract, --all, or choose from the prompt.\n",
        );
        process.exitCode = 2;
        return;
      }

      const selectedItems = reviewItems.filter((item) =>
        selectedContractIds.includes(item.contractId),
      );
      if (selectedItems.length !== selectedContractIds.length) {
        process.stderr.write(
          "ferret review: one or more selected contracts are not in the current drift set.\n",
        );
        process.exitCode = 2;
        return;
      }

      if (!options.json) {
        selectedItems.forEach((item, index) => {
          if (index > 0) {
            process.stdout.write("\n");
          }
          renderReviewContext(item);
        });
      }

      const action = await selectAction(options.action, Boolean(options.json));
      if (!action) {
        process.stderr.write(
          "ferret review: no action selected. Use --action in non-interactive mode.\n",
        );
        process.exitCode = 2;
        return;
      }

      const note = String(options.note ?? "").trim();
      for (const item of selectedItems) {
        await store.insertReconciliationLog({
          id: randomUUID(),
          node_id: item.sourceNodeId,
          triggered_by: item.contractId,
          resolved_by: action,
          resolution_notes:
            note || defaultResolutionNote(action, item.contractId),
        });
      }

      const resultSummary = await applyReviewAction(
        store,
        root,
        contracts,
        selectedItems,
        action,
      );

      if (options.json) {
        writeJson({
          version: "2.0",
          reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
          diagnosticsSchemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
          diagnostics: buildReviewDiagnostics(selectedItems),
          reviewable: selectedItems,
          selected: selectedItems.map((item) => item.contractId),
          action,
          result: resultSummary,
        });
        process.exitCode = 0;
        return;
      }

      if (action === "accept") {
        process.stdout.write(
          `ACCEPTED  ${selectedItems.map((item) => item.contractId).join(", ")}  review recorded, drift cleared\n`,
        );
        process.exitCode = 0;
        return;
      }

      selectedItems.forEach((item) => renderCopyPasteContext(item, action));
      process.stdout.write(
        `${action === "update" ? "UPDATE" : "REJECT"}  ${selectedItems.map((item) => item.contractId).join(", ")}  repo remains blocked until ${action === "update" ? "dependents are updated" : "upstream is fixed"}\n`,
      );
      process.exitCode = 0;
      return;
    } finally {
      await store.close();
    }
  });

async function runScanQuietly(options: {
  changed?: boolean;
  force?: boolean;
}): Promise<void> {
  const { scanCommand } = await import("./scan.js");
  const args = ["node", "scan"];
  if (options.changed) args.push("--changed");
  if (options.force) args.push("--force");
  const savedWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    await scanCommand.parseAsync(args, { from: "node" });
  } catch {
    // scan errors are surfaced later through lint/reconcile state
  } finally {
    process.stdout.write = savedWrite;
  }
}

function buildReviewItems(
  reviewableContracts: FerretContract[],
  nodeById: Map<string, FerretNode>,
  affectedByContractId: Map<
    string,
    Array<{
      nodeId: string;
      filePath: string;
      impact: "direct" | "transitive";
      depth: number;
    }>
  >,
): ReviewItem[] {
  return reviewableContracts.map((contract) => {
    const sourceNode = nodeById.get(contract.node_id);
    const affected = (affectedByContractId.get(contract.id) ?? [])
      .slice()
      .sort((a, b) => {
        if (a.impact !== b.impact) {
          return a.impact.localeCompare(b.impact);
        }
        if (a.depth !== b.depth) {
          return a.depth - b.depth;
        }
        return a.filePath.localeCompare(b.filePath);
      });
    const direct = affected.filter((item) => item.impact === "direct");
    const transitive = affected.filter((item) => item.impact === "transitive");
    const classification: "breaking" | "non-breaking" =
      contract.status === "needs-review" ? "breaking" : "non-breaking";
    return {
      contractId: contract.id,
      sourceNodeId: contract.node_id,
      sourceFile: sourceNode?.file_path ?? contract.node_id,
      classification,
      affectedCount: affected.length,
      impact: {
        direct,
        transitive,
      },
      recommendedAction:
        classification === "breaking" || affected.length > 0
          ? "update"
          : "accept",
      availableActions: ["accept", "update", "reject"],
      suggestedActions: buildSuggestedActions(
        contract.status === "needs-review" ? "breaking" : "non-breaking",
        affected.length,
      ),
      dependencyContext: {
        directDependents: direct.map((item) => ({
          nodeId: item.nodeId,
          filePath: item.filePath,
          depth: item.depth,
        })),
        transitiveDependents: transitive.map((item) => ({
          nodeId: item.nodeId,
          filePath: item.filePath,
          depth: item.depth,
        })),
      },
    };
  });
}

function buildSuggestedActions(
  classification: "breaking" | "non-breaking",
  affectedCount: number,
): Array<{ action: ReviewAction; confidence: "high" | "medium" | "low"; reason: string }> {
  if (classification === "breaking") {
    if (affectedCount > 0) {
      return [
        {
          action: "update",
          confidence: "high",
          reason: "Breaking drift has downstream dependents that need updates.",
        },
        {
          action: "reject",
          confidence: "medium",
          reason: "Reject when upstream change should not propagate.",
        },
        {
          action: "accept",
          confidence: "low",
          reason: "Accept only when downstream risk is intentionally tolerated.",
        },
      ];
    }

    return [
      {
        action: "accept",
        confidence: "medium",
        reason: "No downstream dependents detected for this breaking change.",
      },
      {
        action: "reject",
        confidence: "medium",
        reason: "Reject if the breaking change should not ship.",
      },
    ];
  }

  return [
    {
      action: "accept",
      confidence: "high",
      reason: "Non-breaking drift can usually be accepted safely.",
    },
    {
      action: "update",
      confidence: affectedCount > 0 ? "medium" : "low",
      reason: "Update dependents if you want immediate downstream alignment.",
    },
  ];
}

async function selectContracts(
  reviewItems: ReviewItem[],
  options: { contract?: string; all?: boolean; json?: boolean },
): Promise<string[]> {
  if (options.all) {
    return reviewItems.map((item) => item.contractId);
  }

  if (options.contract) {
    const requested = options.contract
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return [...new Set(requested)];
  }

  if (reviewItems.length === 1) {
    return [reviewItems[0].contractId];
  }

  if (options.json) {
    return [];
  }

  process.stdout.write("\n  REVIEW ITEMS\n");
  reviewItems.forEach((item, index) => {
    process.stdout.write(
      `  ${index + 1}. ${item.contractId}  ${item.sourceFile}  ${item.affectedCount} impacted file${item.affectedCount === 1 ? "" : "s"}\n`,
    );
  });
  process.stdout.write("  all. review every current drift item\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (
      await rl.question("\nSelect review item number(s) or 'all': ")
    ).trim();
    return parseSelection(answer, reviewItems);
  } finally {
    rl.close();
  }
}

function parseSelection(answer: string, reviewItems: ReviewItem[]): string[] {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  if (normalized === "all") {
    return reviewItems.map((item) => item.contractId);
  }

  const seen = new Set<string>();
  const selected: string[] = [];
  for (const token of normalized.split(",").map((item) => item.trim())) {
    const selection = Number.parseInt(token, 10);
    if (
      !Number.isFinite(selection) ||
      selection < 1 ||
      selection > reviewItems.length
    ) {
      return [];
    }
    const contractId = reviewItems[selection - 1].contractId;
    if (!seen.has(contractId)) {
      seen.add(contractId);
      selected.push(contractId);
    }
  }

  return selected;
}

async function selectAction(
  requestedAction?: string,
  suppressPromptOutput: boolean = false,
): Promise<ReviewAction | undefined> {
  if (requestedAction) {
    const normalized = normalizeAction(requestedAction);
    return normalized;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: suppressPromptOutput ? undefined : process.stdout,
  });
  try {
    const answer = (
      await rl.question("\nSelect action [a]ccept, [u]pdate, [r]eject: ")
    ).trim();
    return normalizeAction(answer);
  } finally {
    rl.close();
  }
}

function normalizeAction(value: string): ReviewAction | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "a" || normalized === "accept") return "accept";
  if (normalized === "u" || normalized === "update") return "update";
  if (normalized === "r" || normalized === "reject") return "reject";
  return undefined;
}

async function applyReviewAction(
  store: Awaited<ReturnType<typeof getStore>>,
  root: string,
  contracts: FerretContract[],
  selectedItems: ReviewItem[],
  action: ReviewAction,
): Promise<ReviewJsonOutput["result"]> {
  if (action === "accept") {
    const nodeIdsToClear = new Set<string>();
    for (const item of selectedItems) {
      nodeIdsToClear.add(item.sourceNodeId);
      item.impact.direct.forEach((impact) => nodeIdsToClear.add(impact.nodeId));
      item.impact.transitive.forEach((impact) =>
        nodeIdsToClear.add(impact.nodeId),
      );
    }

    for (const nodeId of nodeIdsToClear) {
      await store.updateNodeStatus(nodeId, "stable");
    }

    const clearedContracts = contracts.filter((contract) =>
      nodeIdsToClear.has(contract.node_id),
    );
    for (const contract of clearedContracts) {
      await store.upsertContract({ ...contract, status: "stable" });
    }

    await writeContext(store, root);

    return {
      repoBlocked: false,
      clearedContracts: clearedContracts.map((contract) => contract.id).sort(),
      clearedFiles: [
        ...new Set(
          clearedContracts.map((contract) => {
            const item = selectedItems.find(
              (entry) => entry.sourceNodeId === contract.node_id,
            );
            return item?.sourceFile ?? contract.node_id;
          }),
        ),
      ].sort(),
      blockedContracts: [],
      blockedFiles: [],
    };
  }

  await writeContext(store, root);

  return {
    repoBlocked: true,
    clearedContracts: [],
    clearedFiles: [],
    blockedContracts: selectedItems.map((item) => item.contractId).sort(),
    blockedFiles: [
      ...new Set(
        selectedItems.flatMap((item) => [
          item.sourceFile,
          ...item.impact.direct.map((impact) => impact.filePath),
          ...item.impact.transitive.map((impact) => impact.filePath),
        ]),
      ),
    ].sort(),
  };
}

function renderReviewContext(item: ReviewItem): void {
  process.stdout.write("\n  ferret review\n\n");
  process.stdout.write("  DRIFT\n");
  process.stdout.write(`  contract: ${item.contractId}\n`);
  process.stdout.write(`  source: ${item.sourceFile}\n`);
  process.stdout.write(`  classification: ${item.classification}\n`);
  process.stdout.write(
    `  affected: ${item.affectedCount} file${item.affectedCount === 1 ? "" : "s"}\n`,
  );
  process.stdout.write(`  recommended-action: ${item.recommendedAction}\n\n`);

  process.stdout.write("  DIRECT IMPACT\n");
  renderImpactGroup(item.impact.direct);
  process.stdout.write("\n  TRANSITIVE IMPACT\n");
  renderImpactGroup(item.impact.transitive);
  process.stdout.write("\n");

  process.stdout.write("  RESOLUTION OPTIONS\n");
  process.stdout.write("  [a]ccept  mark reviewed items stable and continue\n");
  process.stdout.write(
    "  [u]pdate  print copy-paste context for downstream updates\n",
  );
  process.stdout.write(
    "  [r]eject  keep repo blocked until upstream is fixed\n",
  );
}

function renderImpactGroup(items: ReviewImpactItem[]): void {
  if (items.length === 0) {
    process.stdout.write("  └── none\n");
    return;
  }

  items.forEach((item, index) => {
    const treeChar = index === items.length - 1 ? "└──" : "├──";
    const impact =
      item.impact === "direct"
        ? "imports this directly"
        : `imports this transitively (depth ${item.depth})`;
    process.stdout.write(`  ${treeChar} ${item.filePath}  ${impact}\n`);
  });
}

function renderCopyPasteContext(
  item: ReviewItem,
  mode: "update" | "reject",
): void {
  process.stdout.write("\n  COPY-PASTE CONTEXT\n");
  process.stdout.write(`  contract: ${item.contractId}\n`);
  process.stdout.write(`  source: ${item.sourceFile}\n`);
  process.stdout.write(`  requested-action: ${mode}\n`);
  process.stdout.write(`  affected-files: ${item.affectedCount}\n`);
  [...item.impact.direct, ...item.impact.transitive].forEach((impact) => {
    process.stdout.write(
      `  - ${impact.filePath} (${impact.impact === "direct" ? "direct" : `transitive depth ${impact.depth}`})\n`,
    );
  });
  process.stdout.write(
    `  next-step: ${mode === "update" ? "Update downstream files and re-run ferret lint" : "Fix or revert the upstream change and re-run ferret lint"}\n\n`,
  );
}

function writeJson(payload: ReviewJsonOutput): void {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

function defaultResolutionNote(
  action: ReviewAction,
  contractId: string,
): string {
  if (action === "accept") {
    return `Accepted review for ${contractId}.`;
  }
  if (action === "update") {
    return `Update requested for downstream dependents of ${contractId}.`;
  }
  return `Rejected upstream drift for ${contractId}.`;
}
