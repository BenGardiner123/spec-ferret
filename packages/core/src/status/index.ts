import type { DBStore, ContractStatus } from '../store/types.js';

export type StatusContractEntry = {
  id: string;
  status: ContractStatus;
  driftClass: 'breaking' | 'stable' | 'pending';
  dependentCount: number;
  dependents: string[];
};

export type StatusReport = {
  version: '2.0';
  timestamp: string;
  total: number;
  stable: number;
  pending: number;
  needsReview: number;
  contracts: StatusContractEntry[];
};

export async function buildStatusReport(store: DBStore): Promise<StatusReport> {
  const [contracts, nodes, deps] = await Promise.all([store.getContracts(), store.getNodes(), store.getDependencies()]);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const dependentsByContractId = new Map<string, string[]>();

  for (const dep of deps) {
    const node = nodeById.get(dep.source_node_id);
    if (!node) continue;
    const list = dependentsByContractId.get(dep.target_contract_id) ?? [];
    if (!list.includes(node.file_path)) list.push(node.file_path);
    dependentsByContractId.set(dep.target_contract_id, list);
  }

  const entries: StatusContractEntry[] = contracts.map((c) => {
    const dependents = dependentsByContractId.get(c.id) ?? [];
    return {
      id: c.id,
      status: c.status,
      driftClass: c.status === 'needs-review' ? 'breaking' : c.status === 'pending' ? 'pending' : 'stable',
      dependentCount: dependents.length,
      dependents,
    };
  });

  return {
    version: '2.0',
    timestamp: new Date().toISOString(),
    total: contracts.length,
    stable: contracts.filter((c) => c.status === 'stable').length,
    pending: contracts.filter((c) => c.status === 'pending').length,
    needsReview: contracts.filter((c) => c.status === 'needs-review').length,
    contracts: entries,
  };
}

export function buildStatusMarkdown(report: StatusReport): string {
  const lines = [
    '# Contract Status',
    '',
    `Generated: ${report.timestamp}`,
    '',
    '| Contract | Status | Drift Class | Dependents |',
    '| --- | --- | --- | --- |',
    ...report.contracts.map((c) => `| ${c.id} | ${c.status} | ${c.driftClass} | ${c.dependentCount} |`),
  ];
  return lines.join('\n') + '\n';
}
