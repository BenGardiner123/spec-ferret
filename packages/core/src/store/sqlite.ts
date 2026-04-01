import { DatabaseSync } from "node:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";
import { findProjectRoot } from "../utils/paths.js";
import type {
  DBStore,
  FerretNode,
  FerretContract,
  FerretDependency,
  FerretReconciliationLog,
  FerretPlacementDecision,
  NodeStatus,
} from "./types.js";

export class SqliteStore implements DBStore {
  private db: DatabaseSync | null = null;
  private dbPath: string;

  constructor(customPath?: string) {
    const root = findProjectRoot();
    const defaultPath = path.join(root, ".ferret", "graph.db");
    this.dbPath =
      customPath === ":memory:"
        ? ":memory:"
        : customPath
          ? path.resolve(root, customPath)
          : defaultPath;
  }

  async init(): Promise<void> {
    if (this.db) return;

    if (this.dbPath !== ":memory:") {
      const ferretDir = path.dirname(this.dbPath);
      if (!fs.existsSync(ferretDir)) {
        fs.mkdirSync(ferretDir, { recursive: true });
      }
      const gitignorePath = path.join(ferretDir, ".gitignore");
      try {
        fs.writeFileSync(gitignorePath, "*\n!.gitignore\n", "utf-8");
      } catch {}
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ferret_nodes (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        hash TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ferret_contracts (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        shape_hash TEXT NOT NULL,
        shape_schema TEXT NOT NULL DEFAULT '{}',
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (node_id) REFERENCES ferret_nodes(id)
      );

      CREATE TABLE IF NOT EXISTS ferret_dependencies (
        id TEXT PRIMARY KEY,
        source_node_id TEXT NOT NULL,
        target_contract_id TEXT NOT NULL,
        FOREIGN KEY (source_node_id) REFERENCES ferret_nodes(id)
      );

      CREATE TABLE IF NOT EXISTS ferret_reconciliation_log (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        triggered_by TEXT NOT NULL,
        resolved_by TEXT,
        resolution_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ferret_placement_decisions (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        placed_by TEXT NOT NULL,
        reasoning TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      this.db.exec(
        `ALTER TABLE ferret_contracts ADD COLUMN shape_schema TEXT NOT NULL DEFAULT '{}';`,
      );
    } catch {}
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async getNodeByFilePath(filePath: string): Promise<FerretNode | null> {
    const row = this.db!.prepare(
      "SELECT * FROM ferret_nodes WHERE file_path = ?",
    ).get(filePath) as any;
    return row ?? null;
  }

  async upsertNode(node: FerretNode): Promise<void> {
    this.db!.prepare(
      `
      INSERT INTO ferret_nodes (id, file_path, hash, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        hash = excluded.hash,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run(node.id, node.file_path, node.hash, node.status);
  }

  async getAllContractIds(): Promise<string[]> {
    return (
      this.db!.prepare("SELECT id FROM ferret_contracts").all() as any[]
    ).map((r) => r.id);
  }

  async upsertContract(contract: FerretContract): Promise<void> {
    this.db!.prepare(
      `
      INSERT INTO ferret_contracts (id, node_id, shape_hash, shape_schema, type, status)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        node_id = excluded.node_id,
        shape_hash = excluded.shape_hash,
        shape_schema = excluded.shape_schema,
        type = excluded.type,
        status = excluded.status
    `,
    ).run(
      contract.id,
      contract.node_id,
      contract.shape_hash,
      contract.shape_schema,
      contract.type,
      contract.status,
    );
  }

  async upsertDependency(dependency: FerretDependency): Promise<void> {
    this.db!.prepare(
      `
      INSERT INTO ferret_dependencies (id, source_node_id, target_contract_id)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    ).run(
      dependency.id,
      dependency.source_node_id,
      dependency.target_contract_id,
    );
  }

  async getNodes(): Promise<FerretNode[]> {
    return this.db!.prepare(
      "SELECT * FROM ferret_nodes",
    ).all() as unknown as FerretNode[];
  }

  async getNodesByStatus(status: NodeStatus): Promise<FerretNode[]> {
    return this.db!.prepare("SELECT * FROM ferret_nodes WHERE status = ?").all(
      status,
    ) as unknown as FerretNode[];
  }

  async getContracts(): Promise<FerretContract[]> {
    return this.db!.prepare(
      "SELECT * FROM ferret_contracts",
    ).all() as unknown as FerretContract[];
  }

  async getContract(id: string): Promise<FerretContract | null> {
    const row = this.db!.prepare(
      "SELECT * FROM ferret_contracts WHERE id = ?",
    ).get(id) as any;
    return row ?? null;
  }

  async getDependencies(): Promise<FerretDependency[]> {
    return this.db!.prepare(
      "SELECT * FROM ferret_dependencies",
    ).all() as unknown as FerretDependency[];
  }

  async updateNodeStatus(nodeId: string, status: NodeStatus): Promise<void> {
    this.db!.prepare(
      "UPDATE ferret_nodes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(status, nodeId);
  }

  async insertReconciliationLog(log: FerretReconciliationLog): Promise<void> {
    this.db!.prepare(
      `
      INSERT INTO ferret_reconciliation_log (id, node_id, triggered_by, resolved_by, resolution_notes)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(
      log.id,
      log.node_id,
      log.triggered_by,
      log.resolved_by ?? null,
      log.resolution_notes ?? null,
    );
  }

  async getReconciliationLogs(): Promise<FerretReconciliationLog[]> {
    return this.db!.prepare(
      "SELECT id, node_id, triggered_by, resolved_by, resolution_notes FROM ferret_reconciliation_log",
    ).all() as unknown as FerretReconciliationLog[];
  }

  async insertPlacementDecision(
    decision: FerretPlacementDecision,
  ): Promise<void> {
    this.db!.prepare(
      `
      INSERT INTO ferret_placement_decisions (id, node_id, placed_by, reasoning)
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      decision.id,
      decision.node_id,
      decision.placed_by,
      decision.reasoning ?? null,
    );
  }

  async getPlacementDecisions(): Promise<FerretPlacementDecision[]> {
    return this.db!.prepare(
      "SELECT id, node_id, placed_by, reasoning FROM ferret_placement_decisions",
    ).all() as unknown as FerretPlacementDecision[];
  }
}
