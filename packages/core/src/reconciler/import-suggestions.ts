import {
  FerretContract,
  FerretDependency,
  FerretNode,
} from "../store/types.js";

export interface ImportSuggestion {
  sourceContractId: string;
  sourceFilePath: string;
  suggestedImportId: string;
  confidence: "medium" | "high";
  evidence: string;
}

export function suggestMissingImports(
  nodes: FerretNode[],
  contracts: FerretContract[],
  dependencies: FerretDependency[],
): ImportSuggestion[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeImportMap = new Map<string, Set<string>>();

  for (const dependency of dependencies) {
    const imports =
      nodeImportMap.get(dependency.source_node_id) ?? new Set<string>();
    imports.add(dependency.target_contract_id);
    nodeImportMap.set(dependency.source_node_id, imports);
  }

  const schemaKeysByContract = new Map<string, Set<string>>();
  for (const contract of contracts) {
    schemaKeysByContract.set(
      contract.id,
      extractSchemaKeys(parseSchema(contract.shape_schema)),
    );
  }

  const suggestions: ImportSuggestion[] = [];
  const seen = new Set<string>();

  for (const source of contracts) {
    const sourceKeys = schemaKeysByContract.get(source.id) ?? new Set<string>();
    if (sourceKeys.size === 0) {
      continue;
    }

    const importedTargets =
      nodeImportMap.get(source.node_id) ?? new Set<string>();
    const sourceNode = nodeById.get(source.node_id);
    if (!sourceNode) {
      continue;
    }

    const rankedCandidates = contracts
      .filter(
        (target) => target.id !== source.id && !importedTargets.has(target.id),
      )
      .map((target) => {
        const targetKeys =
          schemaKeysByContract.get(target.id) ?? new Set<string>();
        const sharedKeys = intersectSets(sourceKeys, targetKeys);
        const overlap =
          sourceKeys.size === 0 ? 0 : sharedKeys.length / sourceKeys.size;
        return {
          target,
          targetKeys,
          sharedKeys,
          overlap,
        };
      })
      .filter(
        (candidate) =>
          candidate.sharedKeys.length >= 2 &&
          candidate.overlap >= 0.67 &&
          candidate.targetKeys.size >= sourceKeys.size,
      )
      .sort((left, right) => {
        if (right.sharedKeys.length !== left.sharedKeys.length) {
          return right.sharedKeys.length - left.sharedKeys.length;
        }
        if (right.overlap !== left.overlap) {
          return right.overlap - left.overlap;
        }
        return left.target.id.localeCompare(right.target.id);
      })
      .slice(0, 3);

    for (const candidate of rankedCandidates) {
      const confidence: "medium" | "high" =
        candidate.sharedKeys.length >= 3 || candidate.overlap >= 0.75
          ? "high"
          : "medium";
      const key = `${source.id}->${candidate.target.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      suggestions.push({
        sourceContractId: source.id,
        sourceFilePath: sourceNode.file_path,
        suggestedImportId: candidate.target.id,
        confidence,
        evidence: `shared shape keys: ${candidate.sharedKeys.slice(0, 3).join(", ")}`,
      });
    }
  }

  return suggestions.sort((left, right) => {
    if (left.sourceContractId !== right.sourceContractId) {
      return left.sourceContractId.localeCompare(right.sourceContractId);
    }
    return left.suggestedImportId.localeCompare(right.suggestedImportId);
  });
}

function parseSchema(shapeSchema: string): unknown {
  try {
    return JSON.parse(shapeSchema);
  } catch {
    return {};
  }
}

function extractSchemaKeys(schema: unknown): Set<string> {
  const keys = new Set<string>();

  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;
    const properties = record.properties;
    if (properties && typeof properties === "object") {
      for (const [key, child] of Object.entries(
        properties as Record<string, unknown>,
      )) {
        keys.add(key);
        walk(child);
      }
    }

    const items = record.items;
    if (items) {
      walk(items);
    }
  };

  walk(schema);
  return keys;
}

function intersectSets(left: Set<string>, right: Set<string>): string[] {
  const shared = [...left].filter((item) => right.has(item));
  return shared.sort((a, b) => a.localeCompare(b));
}
