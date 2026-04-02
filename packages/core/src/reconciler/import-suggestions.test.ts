import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { suggestMissingImports } from "./import-suggestions.js";
import type {
  FerretContract,
  FerretDependency,
  FerretNode,
} from "../store/types.js";

function makeNode(id: string, filePath: string): FerretNode {
  return {
    id,
    file_path: filePath,
    hash: id,
    status: "stable",
  };
}

function makeContract(
  nodeId: string,
  id: string,
  shapeSchema: unknown,
): FerretContract {
  return {
    id,
    node_id: nodeId,
    shape_hash: id,
    shape_schema: JSON.stringify(shapeSchema),
    type: "api",
    status: "stable",
  };
}

describe("suggestMissingImports — S31 acceptance criteria", () => {
  it("suggests likely missing imports using shape overlap evidence", () => {
    const nodes: FerretNode[] = [
      makeNode("node-a", "contracts/a.contract.md"),
      makeNode("node-b", "contracts/b.contract.md"),
    ];

    const contracts: FerretContract[] = [
      makeContract("node-a", "api.GET/a", {
        type: "object",
        properties: {
          token: { type: "string" },
          userId: { type: "string" },
        },
      }),
      makeContract("node-b", "auth.jwt", {
        type: "object",
        properties: {
          token: { type: "string" },
          userId: { type: "string" },
          expiresAt: { type: "string" },
        },
      }),
    ];

    const suggestions = suggestMissingImports(nodes, contracts, []);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].sourceContractId, "api.GET/a");
    assert.equal(suggestions[0].suggestedImportId, "auth.jwt");
    assert.match(suggestions[0].evidence, /shared shape keys/);
  });

  it("does not suggest imports that already exist in dependencies", () => {
    const nodes: FerretNode[] = [
      makeNode("node-a", "contracts/a.contract.md"),
      makeNode("node-b", "contracts/b.contract.md"),
    ];

    const contracts: FerretContract[] = [
      makeContract("node-a", "api.GET/a", {
        type: "object",
        properties: {
          token: { type: "string" },
          userId: { type: "string" },
        },
      }),
      makeContract("node-b", "auth.jwt", {
        type: "object",
        properties: {
          token: { type: "string" },
          userId: { type: "string" },
          expiresAt: { type: "string" },
        },
      }),
    ];

    const dependencies: FerretDependency[] = [
      {
        id: "dep-a",
        source_node_id: "node-a",
        target_contract_id: "auth.jwt",
      },
    ];

    const suggestions = suggestMissingImports(nodes, contracts, dependencies);
    assert.equal(suggestions.length, 0);
  });
});
