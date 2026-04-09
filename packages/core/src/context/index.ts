import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DBStore } from '../store/types.js';

export const CONTEXT_VERSION = '2.0' as const;
export const CONTEXT_SCHEMA_VERSION = '1.0.0' as const;

type LegacyFerretContextV2 = {
  version: '2.0';
  generated: string;
  contracts: ContextContract[];
  edges: ContextEdge[];
  needsReview: string[];
};

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
  version: typeof CONTEXT_VERSION;
  schemaVersion: typeof CONTEXT_SCHEMA_VERSION;
  generated: string; // ISO timestamp
  contracts: ContextContract[];
  edges: ContextEdge[];
  needsReview: string[]; // contract IDs currently flagged
}

function normalizeContext(raw: unknown): FerretContext {
  if (!raw || typeof raw !== 'object') {
    throw new Error("ferret: invalid context.json format. Run 'ferret scan' to regenerate .ferret/context.json.");
  }

  const candidate = raw as Record<string, unknown>;
  const contextVersion = candidate.version;
  if (contextVersion !== CONTEXT_VERSION) {
    throw new Error(
      `ferret: unsupported context.json version '${String(contextVersion)}'. Run 'ferret scan' with the current CLI to regenerate .ferret/context.json.`,
    );
  }

  const schemaVersion = candidate.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== CONTEXT_SCHEMA_VERSION) {
    throw new Error(
      `ferret: unsupported context schemaVersion '${String(schemaVersion)}'. Run 'ferret scan' with the current CLI to migrate .ferret/context.json.`,
    );
  }

  // Known migration path: V2 payloads created before schemaVersion was introduced.
  const legacy = candidate as Partial<LegacyFerretContextV2>;
  return {
    version: CONTEXT_VERSION,
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    generated: typeof legacy.generated === 'string' ? legacy.generated : new Date(0).toISOString(),
    contracts: Array.isArray(legacy.contracts) ? legacy.contracts : [],
    edges: Array.isArray(legacy.edges) ? legacy.edges : [],
    needsReview: Array.isArray(legacy.needsReview) ? legacy.needsReview : [],
  };
}

export function readContextFile(contextPath: string): FerretContext {
  try {
    const raw = fs.readFileSync(contextPath, 'utf-8');
    return normalizeContext(JSON.parse(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('ferret:')) {
      throw error;
    }
    throw new Error(`ferret: unable to read ${contextPath} (${message}). Run 'ferret scan' to regenerate it.`);
  }
}

/**
 * Reads the full graph from the store and writes .ferret/context.json.
 * Called automatically at the end of every ferret scan.
 * Silent — no output. If write fails, it logs to stderr and continues.
 */
export async function writeContext(store: DBStore, projectRoot: string): Promise<void> {
  const [nodes, contracts, dependencies] = await Promise.all([store.getNodes(), store.getContracts(), store.getDependencies()]);

  // Build a map of node_id → node for quick lookup
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Map contracts to context shape
  const contextContracts: ContextContract[] = contracts.map((c) => {
    const parentNode = nodeById.get(c.node_id);
    const nodeType = (parentNode as any)?.type ?? 'spec'; // nodes don't store type in V2 yet

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
      specFile: nodeType !== 'code' ? (parentNode?.file_path?.replace(/\\/g, '/') ?? null) : null,
      codeFile: nodeType === 'code' ? (parentNode?.file_path?.replace(/\\/g, '/') ?? null) : null,
    };
  });

  // Build edges: source_node file_path → target_contract_id
  const edges: ContextEdge[] = dependencies.map((d) => {
    const sourceNode = nodeById.get(d.source_node_id);
    return {
      from: (sourceNode?.file_path ?? d.source_node_id).replace(/\\/g, '/'),
      to: d.target_contract_id,
    };
  });

  // needsReview: contract IDs whose parent node is flagged needs-review
  const needsReviewNodeIds = new Set(nodes.filter((n) => n.status === 'needs-review').map((n) => n.id));
  const needsReview = contracts.filter((c) => needsReviewNodeIds.has(c.node_id) || c.status === 'needs-review').map((c) => c.id);

  const context: FerretContext = {
    version: CONTEXT_VERSION,
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    generated: new Date().toISOString(),
    contracts: contextContracts,
    edges,
    needsReview,
  };

  const ferretDir = path.join(projectRoot, '.ferret');
  const contextPath = path.join(ferretDir, 'context.json');

  try {
    if (!fs.existsSync(ferretDir)) {
      fs.mkdirSync(ferretDir, { recursive: true });
    }
    fs.writeFileSync(contextPath, JSON.stringify(context, null, 2), 'utf-8');
  } catch (err) {
    process.stderr.write(`⚠ Could not write context.json: ${err}\n`);
  }
}
