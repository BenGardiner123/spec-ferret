export type NodeStatus = 'stable' | 'needs-review' | 'pending' | 'blocked';
export type ContractStatus = 'stable' | 'pending' | 'needs-review';

export interface FerretNode {
  id: string;
  file_path: string;
  hash: string;
  status: NodeStatus;
  updated_at?: string | Date; // Dependent on SQLite (string) vs Postgres (Date) nuances, keep flexible for mapping.
}

export interface FerretContract {
  id: string;
  node_id: string;
  shape_hash: string;
  shape_schema: string;
  type: string;
  status: ContractStatus;
  /** Path to the TypeScript file this contract was generated from (code-first contracts only). */
  code_source_file?: string;
  /** TypeScript symbol name this contract was generated from (code-first contracts only). */
  code_source_symbol?: string;
}

export interface FerretDependency {
  id: string;
  source_node_id: string;
  target_contract_id: string;
}

export interface FerretReconciliationLog {
  id: string;
  node_id: string;
  triggered_by: string;
  resolved_by?: string;
  resolution_notes?: string;
}

export interface FerretPlacementDecision {
  id: string;
  node_id: string;
  placed_by: string;
  reasoning?: string;
}

export interface FerretMigrationSnapshot {
  nodes: FerretNode[];
  contracts: FerretContract[];
  dependencies: FerretDependency[];
  reconciliationLogs: FerretReconciliationLog[];
  placementDecisions: FerretPlacementDecision[];
}

/**
 * The standard contract for our Data Access Layer (DAL).
 * All implementers (SQLite, Postgres) MUST satisfy this completely so the CLI
 * can remain ignorant to the underlying storage type.
 */
export interface DBStore {
  /** Core initialisation & teardown */
  init(): Promise<void>;
  close(): Promise<void>;

  /** Retrieves a node based on its unique file path relative to specDir */
  getNodeByFilePath(filePath: string): Promise<FerretNode | null>;

  /** Upserts a node based on its ID */
  upsertNode(node: FerretNode): Promise<void>;

  /** Retrieves all existing contract IDs for LLM context injection */
  getAllContractIds(): Promise<string[]>;

  /** Upserts an extracted contract */
  upsertContract(contract: FerretContract): Promise<void>;

  /** Creates a dependency edge between a Node and a Contract */
  upsertDependency(dependency: FerretDependency): Promise<void>;

  /** Replaces all dependency edges for a source node with the provided targets */
  replaceDependenciesForSourceNode(sourceNodeId: string, targetContractIds: string[]): Promise<void>;

  /** Full graph retrieval methods for the Reconciler engine */
  getNodes(): Promise<FerretNode[]>;
  getNodesByStatus(status: NodeStatus): Promise<FerretNode[]>;
  getContracts(): Promise<FerretContract[]>;
  getContract(id: string): Promise<FerretContract | null>;
  getDependencies(): Promise<FerretDependency[]>;

  /** Update helper for the Reconciler to safely flag nodes */
  updateNodeStatus(nodeId: string, status: NodeStatus): Promise<void>;

  /** Records review actions against flagged nodes S013 */
  insertReconciliationLog(log: FerretReconciliationLog): Promise<void>;

  getReconciliationLogs(): Promise<FerretReconciliationLog[]>;

  /** Tracks feature placement decisions S016 */
  insertPlacementDecision(decision: FerretPlacementDecision): Promise<void>;

  getPlacementDecisions(): Promise<FerretPlacementDecision[]>;
}
