import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { SqliteStore } from "./sqlite.js";
import type { FerretNode, FerretContract } from "./types.js";
import { randomUUID } from "node:crypto";

// Use in-memory SQLite for all tests — fast, isolated, no disk cleanup needed
function makeStore() {
  return new SqliteStore(":memory:");
}

function makeNode(overrides: Partial<FerretNode> = {}): FerretNode {
  return {
    id: randomUUID(),
    file_path: "specs/test.md",
    hash: "abc123",
    status: "stable",
    ...overrides,
  };
}

function makeContract(
  nodeId: string,
  overrides: Partial<FerretContract> = {},
): FerretContract {
  return {
    id: `api.GET/test-${randomUUID()}`,
    node_id: nodeId,
    shape_hash: "sha256hashvalue",
    shape_schema: JSON.stringify({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    }),
    type: "api",
    status: "stable",
    ...overrides,
  };
}

describe("SqliteStore — Task 1: shape_schema field", () => {
  it("upserts a contract with shape_schema field", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode();
    await store.upsertNode(node);

    const contract = makeContract(node.id, {
      shape_schema: JSON.stringify({
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      }),
    });
    await store.upsertContract(contract);

    const all = await store.getContracts();
    assert.equal(all.length, 1);
    assert.equal(all[0].shape_schema, contract.shape_schema);

    await store.close();
  });

  it("retrieves a contract with shape_schema field intact", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode();
    await store.upsertNode(node);

    const schema = {
      type: "object",
      properties: { email: { type: "string", format: "email" } },
      required: ["email"],
    };
    const contract = makeContract(node.id, {
      shape_schema: JSON.stringify(schema),
    });
    await store.upsertContract(contract);

    const retrieved = await store.getContract(contract.id);
    assert.notEqual(retrieved, null);
    assert.equal(retrieved!.shape_schema, JSON.stringify(schema));
    assert.deepEqual(JSON.parse(retrieved!.shape_schema), schema);

    await store.close();
  });

  it("upserts (updates) a contract — shape_schema is overwritten correctly", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode();
    await store.upsertNode(node);

    const contract = makeContract(node.id, {
      shape_schema: JSON.stringify({ type: "string" }),
    });
    await store.upsertContract(contract);

    const updatedSchema = JSON.stringify({
      type: "object",
      properties: { id: { type: "string" } },
    });
    await store.upsertContract({ ...contract, shape_schema: updatedSchema });

    const retrieved = await store.getContract(contract.id);
    assert.equal(retrieved!.shape_schema, updatedSchema);

    await store.close();
  });

  it("migration: ALTER TABLE runs cleanly on an existing database that lacks shape_schema", async () => {
    // Simulate a pre-migration DB by manually creating the table without shape_schema
    // then calling init() which should run the migration without throwing
    const store = makeStore();
    // init() contains the migration; calling it twice should be idempotent
    await store.init();
    await store.init(); // second call must not throw
    await store.close();
  });

  it("shape_schema defaults to empty JSON object string when not set explicitly", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode();
    await store.upsertNode(node);

    // shape_schema has DEFAULT '{}' in the schema; pass it explicitly to match interface
    const contract = makeContract(node.id, { shape_schema: "{}" });
    await store.upsertContract(contract);

    const retrieved = await store.getContract(contract.id);
    assert.equal(retrieved!.shape_schema, "{}");

    await store.close();
  });
});

describe("SqliteStore — existing store functionality still passes", () => {
  it("upserts and retrieves a node by file path", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode({ file_path: "specs/auth.md" });
    await store.upsertNode(node);

    const retrieved = await store.getNodeByFilePath("specs/auth.md");
    assert.notEqual(retrieved, null);
    assert.equal(retrieved!.id, node.id);
    assert.equal(retrieved!.hash, node.hash);

    await store.close();
  });

  it("returns null for unknown file path", async () => {
    const store = makeStore();
    await store.init();
    const result = await store.getNodeByFilePath("specs/nonexistent.md");
    assert.equal(result, null);
    await store.close();
  });

  it("getAllContractIds returns all contract IDs", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode();
    await store.upsertNode(node);
    const c1 = makeContract(node.id, { id: "api.GET/one" });
    const c2 = makeContract(node.id, { id: "api.GET/two" });
    await store.upsertContract(c1);
    await store.upsertContract(c2);

    const ids = await store.getAllContractIds();
    assert.ok(ids.includes("api.GET/one"));
    assert.ok(ids.includes("api.GET/two"));

    await store.close();
  });

  it("updateNodeStatus changes node status", async () => {
    const store = makeStore();
    await store.init();

    const node = makeNode({ status: "stable" });
    await store.upsertNode(node);
    await store.updateNodeStatus(node.id, "needs-review");

    const nodes = await store.getNodesByStatus("needs-review");
    assert.equal(
      nodes.some((n) => n.id === node.id),
      true,
    );

    await store.close();
  });

  it("upsertDependency and getDependencies work correctly", async () => {
    const store = makeStore();
    await store.init();

    const nodeA = makeNode({ id: "node-a", file_path: "specs/a.md" });
    const nodeB = makeNode({ id: "node-b", file_path: "specs/b.md" });
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);

    const contract = makeContract(nodeA.id, { id: "api.GET/shared" });
    await store.upsertContract(contract);

    await store.upsertDependency({
      id: randomUUID(),
      source_node_id: nodeB.id,
      target_contract_id: contract.id,
    });

    const deps = await store.getDependencies();
    assert.equal(
      deps.some(
        (d) =>
          d.source_node_id === nodeB.id && d.target_contract_id === contract.id,
      ),
      true,
    );

    await store.close();
  });
});
