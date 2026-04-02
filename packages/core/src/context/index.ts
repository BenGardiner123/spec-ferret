import * as fs from "node:fs";
import * as path from "node:path";
import type { DBStore } from "../store/types.js";

export interface ContextContract {
  id: string;
  type: string;
  shape: unknown;
  status: string;
  specFile: string | null;
  codeFile: string | null;
}

export interface ContextEdge {
  from: string; // source node file_path
  to: string; // target contract id
}

export interface FerretContext {
  version: "2.0";
  generated: string; // ISO timestamp
  contracts: ContextContract[];
  edges: ContextEdge[];
  needsReview: string[]; // contract IDs currently flagged
}

/**
 * Reads the full graph from the store and writes .ferret/context.json.
 * Called automatically at the end of every ferret scan.
 * Silent — no output. If write fails, it logs to stderr and continues.
 */
export async function writeContext(
  store: DBStore,
  projectRoot: string,
): Promise<void> {
  const [nodes, contracts, dependencies] = await Promise.all([
    store.getNodes(),
    store.getContracts(),
    store.getDependencies(),
  ]);

  // Build a map of node_id → node for quick lookup
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Map contracts to context shape
  const contextContracts: ContextContract[] = contracts.map((c) => {
    const parentNode = nodeById.get(c.node_id);
    const nodeType = (parentNode as any)?.type ?? "spec"; // nodes don't store type in V2 yet

    let shape: unknown = {};
    try {
      shape = JSON.parse(c.shape_schema);
    } catch {
      shape = {};
    }

    return {
      id: c.id,
      type: c.type,
      shape,
      status: c.status,
      specFile:
        nodeType !== "code"
          ? (parentNode?.file_path?.replace(/\\/g, "/") ?? null)
          : null,
      codeFile:
        nodeType === "code"
          ? (parentNode?.file_path?.replace(/\\/g, "/") ?? null)
          : null,
    };
  });

  // Build edges: source_node file_path → target_contract_id
  const edges: ContextEdge[] = dependencies.map((d) => {
    const sourceNode = nodeById.get(d.source_node_id);
    return {
      from: (sourceNode?.file_path ?? d.source_node_id).replace(/\\/g, "/"),
      to: d.target_contract_id,
    };
  });

  // needsReview: contract IDs whose parent node is flagged needs-review
  const needsReviewNodeIds = new Set(
    nodes.filter((n) => n.status === "needs-review").map((n) => n.id),
  );
  const needsReview = contracts
    .filter(
      (c) => needsReviewNodeIds.has(c.node_id) || c.status === "needs-review",
    )
    .map((c) => c.id);

  const context: FerretContext = {
    version: "2.0",
    generated: new Date().toISOString(),
    contracts: contextContracts,
    edges,
    needsReview,
  };

  const ferretDir = path.join(projectRoot, ".ferret");
  const contextPath = path.join(ferretDir, "context.json");

  try {
    if (!fs.existsSync(ferretDir)) {
      fs.mkdirSync(ferretDir, { recursive: true });
    }
    fs.writeFileSync(contextPath, JSON.stringify(context, null, 2), "utf-8");
  } catch (err) {
    process.stderr.write(`⚠ Could not write context.json: ${err}\n`);
  }
}
