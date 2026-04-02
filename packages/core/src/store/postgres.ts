// Sprint 2 roadmap — Postgres support not yet implemented.
// This stub exists so factory.ts compiles.
// Do not use this in production until Sprint 2 is complete.

import type {
  DBStore,
  FerretNode,
  FerretContract,
  FerretDependency,
  FerretReconciliationLog,
  FerretPlacementDecision,
  NodeStatus,
} from "./types.js";

export class PostgresStore implements DBStore {
  constructor(private connectionString: string) {}

  private notImplemented(): never {
    throw new Error(
      "PostgresStore: Postgres support is Sprint 2 roadmap. " +
        'Set FERRET_DATABASE_URL to use Postgres, or remove the store: "postgres" config to use SQLite.',
    );
  }

  async init(): Promise<void> {
    this.notImplemented();
  }
  async close(): Promise<void> {
    this.notImplemented();
  }
  async getNodeByFilePath(_filePath: string): Promise<FerretNode | null> {
    this.notImplemented();
  }
  async upsertNode(_node: FerretNode): Promise<void> {
    this.notImplemented();
  }
  async getAllContractIds(): Promise<string[]> {
    this.notImplemented();
  }
  async upsertContract(_contract: FerretContract): Promise<void> {
    this.notImplemented();
  }
  async upsertDependency(_dependency: FerretDependency): Promise<void> {
    this.notImplemented();
  }
  async replaceDependenciesForSourceNode(
    _sourceNodeId: string,
    _targetNodeIds: string[],
  ): Promise<void> {
    this.notImplemented();
  }
  async getNodes(): Promise<FerretNode[]> {
    this.notImplemented();
  }
  async getNodesByStatus(_status: NodeStatus): Promise<FerretNode[]> {
    this.notImplemented();
  }
  async getContracts(): Promise<FerretContract[]> {
    this.notImplemented();
  }
  async getContract(_id: string): Promise<FerretContract | null> {
    this.notImplemented();
  }
  async getDependencies(): Promise<FerretDependency[]> {
    this.notImplemented();
  }
  async updateNodeStatus(_nodeId: string, _status: NodeStatus): Promise<void> {
    this.notImplemented();
  }
  async insertReconciliationLog(_log: FerretReconciliationLog): Promise<void> {
    this.notImplemented();
  }
  async getReconciliationLogs(): Promise<FerretReconciliationLog[]> {
    this.notImplemented();
  }
  async insertPlacementDecision(
    _decision: FerretPlacementDecision,
  ): Promise<void> {
    this.notImplemented();
  }
  async getPlacementDecisions(): Promise<FerretPlacementDecision[]> {
    this.notImplemented();
  }
}
