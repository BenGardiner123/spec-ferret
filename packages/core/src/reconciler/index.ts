import {
  DBStore,
  FerretNode,
  FerretContract,
  FerretDependency,
} from "../store/types.js";
import {
  ImportSuggestion,
  suggestMissingImports,
} from "./import-suggestions.js";

export interface UnresolvedImportViolation {
  contractId: string;
  filePath: string;
  importPath: string;
  expectedTargetId: string;
  transitiveChain?: string[];
}

export interface SelfImportViolation {
  contractId: string;
  filePath: string;
  importPath: string;
}

export interface CircularImportViolation {
  contractId: string;
  filePath: string;
  importPath: string;
  cycle: string[];
}

export interface OrphanedContractViolation {
  contractId: string;
  filePath: string;
  unresolvedImports: string[];
  remediationHint: string;
}

export interface ImportIntegrityReport {
  unresolvedImports: UnresolvedImportViolation[];
  selfImports: SelfImportViolation[];
  circularImports: CircularImportViolation[];
  orphanedContracts: OrphanedContractViolation[];
}

export interface ReconcileReport {
  consistent: boolean;
  flagged: Array<{
    nodeId: string;
    filePath: string;
    triggeredByContractId: string;
    impact: "direct" | "transitive";
    depth: number;
  }>;
  integrityViolations: ImportIntegrityReport;
  importSuggestions: ImportSuggestion[];
  timestamp: string;
}

/**
 * The Reconciler engine (Phase 3).
 * It calculates the downstream impact of graph shape changes. Since resolving recursive graphs
 * can be heavily database dependent, we execute an Application-level Breadth-First Search (BFS)
 * to maintain 100% parity across SQLite and PostgreSQL effortlessly and stay extremely fast.
 */
export class Reconciler {
  constructor(private store: DBStore) {}

  /**
   * Identifies completely unhandled ripples and propagates them up to 10 hops (S011)
   */
  async reconcile(): Promise<ReconcileReport> {
    const nodes = await this.store.getNodes();
    const contracts = await this.store.getContracts();
    const dependencies = await this.store.getDependencies();

    const integrityViolations = this.validateImportIntegrity(
      nodes,
      contracts,
      dependencies,
    );
    const hasIntegrityViolations =
      integrityViolations.unresolvedImports.length > 0 ||
      integrityViolations.selfImports.length > 0 ||
      integrityViolations.circularImports.length > 0;

    if (hasIntegrityViolations) {
      return {
        consistent: false,
        flagged: [],
        integrityViolations,
        importSuggestions: [],
        timestamp: new Date().toISOString(),
      };
    }

    const importSuggestions = suggestMissingImports(
      nodes,
      contracts,
      dependencies,
    );

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const contractMap = new Map(contracts.map((c) => [c.id, c]));

    // 1. Identify "changed/trigger" contracts.
    // In our simplified engine approach, any contract attached to a Node that is "needs-review"
    // acts as a signal for propagation, OR any specifically updated shapes.
    // For this prototype implementation, we'll traverse starting from specifically flagged nodes.
    const triggerContracts = contracts.filter((c) => {
      const parentNode = nodeMap.get(c.node_id);
      return parentNode && parentNode.status === "needs-review";
    });

    const flaggedNodes: ReconcileReport["flagged"] = [];

    // BFS Queue: [contractId, depth]
    // S011 explicitly mandates capping transitive impact at 10 hops.
    const queue: Array<[string, number]> = triggerContracts.map((c) => [
      c.id,
      1,
    ]);
    const visitedContracts = new Set<string>();

    while (queue.length > 0) {
      const [contractId, depth] = queue.shift()!;
      if (visitedContracts.has(contractId) || depth > 10) continue;
      visitedContracts.add(contractId);

      // Find nodes that import this contract
      const dependentEdges = dependencies.filter(
        (d) => d.target_contract_id === contractId,
      );

      for (const edge of dependentEdges) {
        const dependentNodeId = edge.source_node_id;
        const dependentNode = nodeMap.get(dependentNodeId);

        if (!dependentNode) continue;

        // Skip nodes that are already reviewing or pending, per S011 instructions.
        if (
          dependentNode.status === "needs-review" ||
          dependentNode.status === "pending"
        ) {
          continue;
        }

        // Flag the node natively
        await this.store.updateNodeStatus(dependentNode.id, "needs-review");
        dependentNode.status = "needs-review"; // Update internal ref mapping

        flaggedNodes.push({
          nodeId: dependentNode.id,
          filePath: dependentNode.file_path,
          triggeredByContractId: contractId,
          impact: depth === 1 ? "direct" : "transitive",
          depth,
        });

        // Enqueue cascading contracts exported by the now-flagged dependent node
        const cascadingContracts = contracts.filter(
          (c) => c.node_id === dependentNode.id,
        );
        for (const cContract of cascadingContracts) {
          queue.push([cContract.id, depth + 1]);
        }
      }
    }

    // S012: graph is consistent when no nodes need review and all nodes are stable or pending.
    // Pending nodes are unverified and are an acceptable stable state.
    return {
      consistent:
        flaggedNodes.length === 0 &&
        nodes.every((n) => n.status === "stable" || n.status === "pending"),
      flagged: flaggedNodes,
      integrityViolations,
      importSuggestions,
      timestamp: new Date().toISOString(),
    };
  }

  private validateImportIntegrity(
    nodes: FerretNode[],
    contracts: FerretContract[],
    dependencies: FerretDependency[],
  ): ImportIntegrityReport {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const contractById = new Map(
      contracts.map((contract) => [contract.id, contract]),
    );
    const contractsByNodeId = new Map<string, FerretContract[]>();

    for (const contract of contracts) {
      const existing = contractsByNodeId.get(contract.node_id) ?? [];
      existing.push(contract);
      contractsByNodeId.set(contract.node_id, existing);
    }

    const dependencyKeys = new Set<string>();
    const uniqueDependencies = dependencies.filter((dependency) => {
      const key = `${dependency.source_node_id}->${dependency.target_contract_id}`;
      if (dependencyKeys.has(key)) {
        return false;
      }
      dependencyKeys.add(key);
      return true;
    });

    const unresolvedImports: UnresolvedImportViolation[] = [];
    const selfImports: SelfImportViolation[] = [];
    const adjacency = new Map<string, Set<string>>();
    const importsBySourceContractId = new Map<string, string[]>();

    for (const contract of contracts) {
      adjacency.set(contract.id, new Set<string>());
    }

    for (const dependency of uniqueDependencies) {
      const sourceNode = nodeById.get(dependency.source_node_id);
      const sourceContracts =
        contractsByNodeId.get(dependency.source_node_id) ?? [];
      const targetContract = contractById.get(dependency.target_contract_id);

      if (!sourceNode || sourceContracts.length === 0) {
        continue;
      }

      for (const sourceContract of sourceContracts) {
        const existing = importsBySourceContractId.get(sourceContract.id) ?? [];
        existing.push(dependency.target_contract_id);
        importsBySourceContractId.set(sourceContract.id, existing);
      }

      if (!targetContract) {
        for (const sourceContract of sourceContracts) {
          unresolvedImports.push({
            contractId: sourceContract.id,
            filePath: sourceNode.file_path,
            importPath: dependency.target_contract_id,
            expectedTargetId: dependency.target_contract_id,
          });
        }
        continue;
      }

      const selfImportingContracts = sourceContracts.filter(
        (sourceContract) => sourceContract.id === dependency.target_contract_id,
      );
      for (const sourceContract of selfImportingContracts) {
        selfImports.push({
          contractId: sourceContract.id,
          filePath: sourceNode.file_path,
          importPath: dependency.target_contract_id,
        });
      }

      for (const sourceContract of sourceContracts) {
        if (sourceContract.id === dependency.target_contract_id) {
          continue;
        }
        adjacency.get(sourceContract.id)?.add(dependency.target_contract_id);
      }
    }

    const circularImports = this.findCircularImports(
      adjacency,
      contractById,
      nodeById,
    );

    const reverseAdjacency = buildReverseAdjacency(adjacency);
    for (const violation of unresolvedImports) {
      const upstreamChain = this.findTransitiveChainToContract(
        violation.contractId,
        reverseAdjacency,
      );
      if (upstreamChain.length > 1) {
        violation.transitiveChain = [...upstreamChain, violation.expectedTargetId];
      }
    }

    const orphanedContracts: OrphanedContractViolation[] = [];
    for (const contract of contracts) {
      const imports = importsBySourceContractId.get(contract.id) ?? [];
      if (imports.length === 0) {
        continue;
      }

      const validResolvedCount = imports.filter((targetId) => {
        if (targetId === contract.id) {
          return false;
        }
        return contractById.has(targetId);
      }).length;

      const unresolvedForContract = imports.filter(
        (targetId) => !contractById.has(targetId),
      );

      if (validResolvedCount === 0 && unresolvedForContract.length > 0) {
        const sourceNode = nodeById.get(contract.node_id);
        orphanedContracts.push({
          contractId: contract.id,
          filePath: sourceNode?.file_path ?? contract.id,
          unresolvedImports: [...new Set(unresolvedForContract)].sort(),
          remediationHint:
            "Add or restore the expected target contract(s), or remove stale imports.",
        });
      }
    }

    return {
      unresolvedImports,
      selfImports,
      circularImports,
      orphanedContracts: orphanedContracts.sort((left, right) =>
        left.contractId.localeCompare(right.contractId),
      ),
    };
  }

  private findTransitiveChainToContract(
    contractId: string,
    reverseAdjacency: Map<string, Set<string>>,
  ): string[] {
    const visit = (currentId: string, seen: Set<string>): string[] => {
      const parents = [...(reverseAdjacency.get(currentId) ?? [])]
        .filter((parentId) => !seen.has(parentId))
        .sort();
      if (parents.length === 0) {
        return [currentId];
      }

      let bestPath = [currentId];
      for (const parentId of parents) {
        const nextSeen = new Set(seen);
        nextSeen.add(parentId);
        const parentPath = visit(parentId, nextSeen);
        const candidate = [...parentPath, currentId];
        if (
          candidate.length > bestPath.length ||
          (candidate.length === bestPath.length &&
            candidate.join("->") < bestPath.join("->"))
        ) {
          bestPath = candidate;
        }
      }

      return bestPath;
    };

    return visit(contractId, new Set([contractId]));
  }

  private findCircularImports(
    adjacency: Map<string, Set<string>>,
    contractById: Map<string, FerretContract>,
    nodeById: Map<string, FerretNode>,
  ): CircularImportViolation[] {
    const visited = new Set<string>();
    const path: string[] = [];
    const cycleMap = new Map<string, CircularImportViolation>();
    const contractIds = [...adjacency.keys()].sort();

    const visit = (contractId: string): void => {
      visited.add(contractId);
      path.push(contractId);

      const neighbors = [...(adjacency.get(contractId) ?? [])].sort();
      for (const neighborId of neighbors) {
        const existingIndex = path.indexOf(neighborId);
        if (existingIndex !== -1) {
          const cycle = [...path.slice(existingIndex), neighborId];
          const key = canonicalizeCycle(cycle);
          if (!cycleMap.has(key)) {
            const sourceContractId = cycle[0];
            const sourceContract = contractById.get(sourceContractId);
            const sourceNode = sourceContract
              ? nodeById.get(sourceContract.node_id)
              : undefined;
            cycleMap.set(key, {
              contractId: sourceContractId,
              filePath: sourceNode?.file_path ?? sourceContractId,
              importPath: cycle.join(" -> "),
              cycle,
            });
          }
          continue;
        }

        if (!visited.has(neighborId)) {
          visit(neighborId);
        }
      }

      path.pop();
    };

    for (const contractId of contractIds) {
      if (!visited.has(contractId)) {
        visit(contractId);
      }
    }

    return [...cycleMap.values()].sort((left, right) =>
      left.importPath.localeCompare(right.importPath),
    );
  }
}

function buildReverseAdjacency(
  adjacency: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();

  for (const [sourceId, targets] of adjacency) {
    if (!reverse.has(sourceId)) {
      reverse.set(sourceId, new Set<string>());
    }
    for (const targetId of targets) {
      const parents = reverse.get(targetId) ?? new Set<string>();
      parents.add(sourceId);
      reverse.set(targetId, parents);
    }
  }

  return reverse;
}

function canonicalizeCycle(cycle: string[]): string {
  const ring = cycle.slice(0, -1);
  if (ring.length === 0) {
    return "";
  }

  const rotations = ring.map((_, index) => {
    const rotated = [...ring.slice(index), ...ring.slice(0, index)];
    return `${rotated.join("->")}->${rotated[0]}`;
  });

  return rotations.sort()[0];
}
