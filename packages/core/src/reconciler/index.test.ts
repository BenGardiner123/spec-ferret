import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "bun:test";
import { Reconciler } from "./index.js";
import { SqliteStore } from "../store/sqlite.js";
import type { FerretContract, FerretNode } from "../store/types.js";

function makeStore() {
  return new SqliteStore(":memory:");
}

function makeNode(overrides: Partial<FerretNode> = {}): FerretNode {
  return {
    id: randomUUID(),
    file_path: "contracts/test.contract.md",
    hash: randomUUID(),
    status: "stable",
    ...overrides,
  };
}

function makeContract(nodeId: string, id: string): FerretContract {
  return {
    id,
    node_id: nodeId,
    shape_hash: randomUUID(),
    shape_schema: JSON.stringify({ type: "object" }),
    type: "api",
    status: "stable",
  };
}

describe("Reconciler — S30 import integrity", () => {
  it("detects unresolved imports", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode({
      id: "node-a",
      file_path: "contracts/a.contract.md",
    });
    await store.upsertNode(node);
    await store.upsertContract(makeContract(node.id, "api.GET/a"));
    await store.replaceDependenciesForSourceNode(node.id, ["api.GET/missing"]);

    const report = await new Reconciler(store).reconcile();
    assert.equal(report.consistent, false);
    assert.deepEqual(report.integrityViolations.unresolvedImports, [
      {
        contractId: "api.GET/a",
        filePath: "contracts/a.contract.md",
        importPath: "api.GET/missing",
      },
    ]);
    assert.equal(report.integrityViolations.selfImports.length, 0);
    assert.equal(report.integrityViolations.circularImports.length, 0);

    await store.close();
  });

  it("detects self-imports", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode({
      id: "node-a",
      file_path: "contracts/a.contract.md",
    });
    await store.upsertNode(node);
    await store.upsertContract(makeContract(node.id, "api.GET/a"));
    await store.replaceDependenciesForSourceNode(node.id, ["api.GET/a"]);

    const report = await new Reconciler(store).reconcile();
    assert.equal(report.consistent, false);
    assert.deepEqual(report.integrityViolations.selfImports, [
      {
        contractId: "api.GET/a",
        filePath: "contracts/a.contract.md",
        importPath: "api.GET/a",
      },
    ]);
    assert.equal(report.integrityViolations.unresolvedImports.length, 0);
    assert.equal(report.integrityViolations.circularImports.length, 0);

    await store.close();
  });

  it("detects direct circular imports", async () => {
    const store = makeStore();
    await store.init();

    const nodeA = makeNode({
      id: "node-a",
      file_path: "contracts/a.contract.md",
    });
    const nodeB = makeNode({
      id: "node-b",
      file_path: "contracts/b.contract.md",
    });
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertContract(makeContract(nodeA.id, "api.GET/a"));
    await store.upsertContract(makeContract(nodeB.id, "api.GET/b"));
    await store.replaceDependenciesForSourceNode(nodeA.id, ["api.GET/b"]);
    await store.replaceDependenciesForSourceNode(nodeB.id, ["api.GET/a"]);

    const report = await new Reconciler(store).reconcile();
    assert.equal(report.consistent, false);
    assert.equal(report.integrityViolations.circularImports.length, 1);
    assert.equal(
      report.integrityViolations.circularImports[0].importPath,
      "api.GET/a -> api.GET/b -> api.GET/a",
    );
    assert.equal(report.integrityViolations.unresolvedImports.length, 0);
    assert.equal(report.integrityViolations.selfImports.length, 0);

    await store.close();
  });

  it("detects multi-node circular imports", async () => {
    const store = makeStore();
    await store.init();

    const nodeA = makeNode({
      id: "node-a",
      file_path: "contracts/a.contract.md",
    });
    const nodeB = makeNode({
      id: "node-b",
      file_path: "contracts/b.contract.md",
    });
    const nodeC = makeNode({
      id: "node-c",
      file_path: "contracts/c.contract.md",
    });
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeC);
    await store.upsertContract(makeContract(nodeA.id, "api.GET/a"));
    await store.upsertContract(makeContract(nodeB.id, "api.GET/b"));
    await store.upsertContract(makeContract(nodeC.id, "api.GET/c"));
    await store.replaceDependenciesForSourceNode(nodeA.id, ["api.GET/b"]);
    await store.replaceDependenciesForSourceNode(nodeB.id, ["api.GET/c"]);
    await store.replaceDependenciesForSourceNode(nodeC.id, ["api.GET/a"]);

    const report = await new Reconciler(store).reconcile();
    assert.equal(report.consistent, false);
    assert.equal(report.integrityViolations.circularImports.length, 1);
    assert.equal(
      report.integrityViolations.circularImports[0].importPath,
      "api.GET/a -> api.GET/b -> api.GET/c -> api.GET/a",
    );

    await store.close();
  });

  it("deduplicates repeated dependency edges during integrity checks", async () => {
    const store = makeStore();
    await store.init();

    const nodeA = makeNode({
      id: "node-a",
      file_path: "contracts/a.contract.md",
    });
    const nodeB = makeNode({
      id: "node-b",
      file_path: "contracts/b.contract.md",
    });
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertContract(makeContract(nodeA.id, "api.GET/a"));
    await store.upsertContract(makeContract(nodeB.id, "api.GET/b"));
    await store.upsertDependency({
      id: randomUUID(),
      source_node_id: nodeA.id,
      target_contract_id: "api.GET/b",
    });
    await store.upsertDependency({
      id: randomUUID(),
      source_node_id: nodeA.id,
      target_contract_id: "api.GET/b",
    });

    const report = await new Reconciler(store).reconcile();
    assert.equal(report.integrityViolations.unresolvedImports.length, 0);
    assert.equal(report.integrityViolations.selfImports.length, 0);
    assert.equal(report.integrityViolations.circularImports.length, 0);
    assert.equal(report.consistent, true);

    await store.close();
  });
});
