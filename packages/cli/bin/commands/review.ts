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

type ReviewAction = "accept" | "update" | "reject";

export const reviewCommand = new Command("review")
  .description("Guided review flow for contract drift.")
  .option("--contract <id>", "Specific contract id to review")
  .option("--action <accept|update|reject>", "Review action to apply")
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

      if (reviewableContracts.length === 0) {
        process.stdout.write(
          `${pc.green("✓ ferret review")}  0 items need review\n`,
        );
        process.exitCode = 0;
        return;
      }

      const targetContract = await selectContract(
        reviewableContracts,
        affectedByContractId,
        nodeById,
        options.contract,
      );
      if (!targetContract) {
        process.stderr.write(
          "ferret review: contract not found in current drift set.\n",
        );
        process.exitCode = 2;
        return;
      }

      const sourceNode = nodeById.get(targetContract.node_id);
      if (!sourceNode) {
        process.stderr.write(
          "ferret review: source node missing for selected contract.\n",
        );
        process.exitCode = 2;
        return;
      }

      const affected = (affectedByContractId.get(targetContract.id) ?? []).sort(
        (a, b) => a.filePath.localeCompare(b.filePath),
      );

      renderReviewContext(targetContract, sourceNode, affected);

      const action = await selectAction(options.action);
      if (!action) {
        process.stderr.write(
          "ferret review: no action selected. Use --action in non-interactive mode.\n",
        );
        process.exitCode = 2;
        return;
      }

      const note = String(options.note ?? "").trim();
      await store.insertReconciliationLog({
        id: randomUUID(),
        node_id: targetContract.node_id,
        triggered_by: targetContract.id,
        resolved_by: action,
        resolution_notes:
          note || defaultResolutionNote(action, targetContract.id),
      });

      if (action === "accept") {
        const nodeIdsToClear = new Set<string>([
          targetContract.node_id,
          ...affected.map((item) => item.nodeId),
        ]);

        for (const nodeId of nodeIdsToClear) {
          await store.updateNodeStatus(nodeId, "stable");
        }

        for (const contract of contracts.filter((item) =>
          nodeIdsToClear.has(item.node_id),
        )) {
          await store.upsertContract({ ...contract, status: "stable" });
        }

        await writeContext(store, root);

        process.stdout.write(
          `ACCEPTED  ${targetContract.id}  review recorded, drift cleared\n`,
        );
        process.exitCode = 0;
        return;
      }

      await writeContext(store, root);

      if (action === "update") {
        renderCopyPasteContext(targetContract, sourceNode, affected, "update");
        process.stdout.write(
          `UPDATE  ${targetContract.id}  repo remains blocked until dependents are updated\n`,
        );
        process.exitCode = 0;
        return;
      }

      renderCopyPasteContext(targetContract, sourceNode, affected, "reject");
      process.stdout.write(
        `REJECT  ${targetContract.id}  repo remains blocked until upstream is fixed\n`,
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

async function selectContract(
  reviewableContracts: FerretContract[],
  affectedByContractId: Map<string, Array<{ filePath: string }>>,
  nodeById: Map<string, FerretNode>,
  requestedContractId?: string,
): Promise<FerretContract | undefined> {
  if (requestedContractId) {
    return reviewableContracts.find(
      (contract) => contract.id === requestedContractId,
    );
  }

  if (reviewableContracts.length === 1) {
    return reviewableContracts[0];
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return undefined;
  }

  process.stdout.write("\n  REVIEW ITEMS\n");
  reviewableContracts.forEach((contract, index) => {
    const sourceNode = nodeById.get(contract.node_id);
    const impactCount = affectedByContractId.get(contract.id)?.length ?? 0;
    process.stdout.write(
      `  ${index + 1}. ${contract.id}  ${sourceNode?.file_path ?? contract.node_id}  ${impactCount} impacted file${impactCount === 1 ? "" : "s"}\n`,
    );
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await rl.question("\nSelect review item number: ")).trim();
    const selection = Number.parseInt(answer, 10);
    if (
      !Number.isFinite(selection) ||
      selection < 1 ||
      selection > reviewableContracts.length
    ) {
      return undefined;
    }
    return reviewableContracts[selection - 1];
  } finally {
    rl.close();
  }
}

async function selectAction(
  requestedAction?: string,
): Promise<ReviewAction | undefined> {
  if (requestedAction) {
    const normalized = normalizeAction(requestedAction);
    return normalized;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
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

function renderReviewContext(
  contract: FerretContract,
  sourceNode: FerretNode,
  affected: Array<{
    filePath: string;
    impact: "direct" | "transitive";
    depth: number;
  }>,
): void {
  process.stdout.write("\n  ferret review\n\n");
  process.stdout.write("  DRIFT\n");
  process.stdout.write(`  contract: ${contract.id}\n`);
  process.stdout.write(`  source: ${sourceNode.file_path}\n`);
  process.stdout.write(
    `  classification: ${contract.status === "needs-review" ? "breaking" : "non-breaking"}\n`,
  );
  process.stdout.write(
    `  affected: ${affected.length} file${affected.length === 1 ? "" : "s"}\n\n`,
  );

  process.stdout.write("  IMPACT\n");
  if (affected.length === 0) {
    process.stdout.write("  └── no downstream files currently flagged\n\n");
  } else {
    affected.forEach((item, index) => {
      const treeChar = index === affected.length - 1 ? "└──" : "├──";
      const impact =
        item.impact === "direct"
          ? "imports this directly"
          : `imports this transitively (depth ${item.depth})`;
      process.stdout.write(`  ${treeChar} ${item.filePath}  ${impact}\n`);
    });
    process.stdout.write("\n");
  }

  process.stdout.write("  RESOLUTION OPTIONS\n");
  process.stdout.write("  [a]ccept  mark reviewed items stable and continue\n");
  process.stdout.write(
    "  [u]pdate  print copy-paste context for downstream updates\n",
  );
  process.stdout.write(
    "  [r]eject  keep repo blocked until upstream is fixed\n",
  );
}

function renderCopyPasteContext(
  contract: FerretContract,
  sourceNode: FerretNode,
  affected: Array<{
    filePath: string;
    impact: "direct" | "transitive";
    depth: number;
  }>,
  mode: "update" | "reject",
): void {
  process.stdout.write("\n  COPY-PASTE CONTEXT\n");
  process.stdout.write(`  contract: ${contract.id}\n`);
  process.stdout.write(`  source: ${sourceNode.file_path}\n`);
  process.stdout.write(`  requested-action: ${mode}\n`);
  process.stdout.write(`  affected-files: ${affected.length}\n`);
  affected.forEach((item) => {
    process.stdout.write(
      `  - ${item.filePath} (${item.impact === "direct" ? "direct" : `transitive depth ${item.depth}`})\n`,
    );
  });
  process.stdout.write(
    `  next-step: ${mode === "update" ? "Update downstream files and re-run ferret lint" : "Fix or revert the upstream change and re-run ferret lint"}\n\n`,
  );
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
