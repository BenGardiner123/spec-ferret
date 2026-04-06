import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { extractContractsFromTypeScript } from "./typescript.js";

describe("extractContractsFromTypeScript — S28 acceptance criteria", () => {
  it("extracts deterministic contract shapes from exported interfaces without annotations", () => {
    const src = `
export interface GetUsersResponse {
  id: string;
  email: string;
  active: boolean;
  createdAt: Date;
}
`;

    const first = extractContractsFromTypeScript("src/users.ts", src);
    const second = extractContractsFromTypeScript("src/users.ts", src);

    assert.equal(first.diagnostics.length, 0);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.contracts.length, 1);

    const contract = first.contracts[0];
    assert.equal(contract.id, "type.src/users/getusersresponse");
    assert.equal(contract.type, "type");
    assert.equal(contract.sourceSymbol, "GetUsersResponse");

    const shape = contract.shape as Record<string, unknown>;
    assert.equal(shape.type, "object");
  });

  it("extracts enum and function signatures from exported declarations", () => {
    const src = `
export enum UserRole {
  Admin,
  Viewer,
}

export function getUser(id: string): UserRole {
  return UserRole.Admin;
}
`;

    const result = extractContractsFromTypeScript("src/roles.ts", src);

    assert.equal(result.contracts.length, 2);
    const enumContract = result.contracts.find(
      (contract) => contract.sourceSymbol === "UserRole",
    );
    const functionContract = result.contracts.find(
      (contract) => contract.sourceSymbol === "getUser",
    );

    assert.ok(enumContract);
    assert.ok(functionContract);

    const enumShape = enumContract?.shape as Record<string, unknown>;
    assert.equal(enumShape.type, "string");

    const functionShape = functionContract?.shape as Record<string, unknown>;
    assert.equal(functionShape.type, "object");
  });

  it("records diagnostics for unsupported unions", () => {
    const src = `
export interface ProfileResponse {
  email: string | null;
}
`;

    const result = extractContractsFromTypeScript("src/profile.ts", src);

    assert.equal(result.contracts.length, 1);
    assert.ok(
      result.diagnostics.some((d) =>
        d.includes("Union types are not supported"),
      ),
    );
  });

  it("applies annotation overrides for id and type when present", () => {
    const src = `
// @ferret-contract: api.GET/profile api
export interface ProfileResponse {
  email: string;
}
`;
    const result = extractContractsFromTypeScript("src/missing.ts", src);

    assert.equal(result.contracts.length, 1);
    assert.equal(result.contracts[0].id, "api.GET/profile");
    assert.equal(result.contracts[0].type, "api");
  });

  it("reports unmatched annotations", () => {
    const src = `
// @ferret-contract: api.GET/missing api
interface MissingContract {
  id: string;
}
`;
    const result = extractContractsFromTypeScript("src/missing.ts", src);

    assert.equal(result.contracts.length, 0);
    assert.ok(result.errors.some((d) => d.includes("did not match")));
  });

  it("extracts type alias with primitive value", () => {
    const src = `
export type UserId = string;
`;
    const result = extractContractsFromTypeScript("src/ids.ts", src);

    assert.equal(result.contracts.length, 1);
    const contract = result.contracts[0];
    assert.equal(contract.sourceSymbol, "UserId");
    assert.deepEqual(contract.shape, { type: "string" });
  });

  it("extracts enum members with string initialisers", () => {
    const src = `
export enum Role {
  Admin = "admin",
  Viewer = "viewer",
}
`;
    const result = extractContractsFromTypeScript("src/roles.ts", src);

    assert.equal(result.contracts.length, 1);
    const shape = result.contracts[0].shape as Record<string, unknown>;
    assert.equal(shape.type, "string");
    assert.deepEqual(shape.enum, ["Admin", "Viewer"]);
  });

  it("does not mark required methods with optional parameters as optional", () => {
    const src = `
export interface Service {
  bar: string;
  baz?: string;
  fn(x?: string): void;
}
`;
    const result = extractContractsFromTypeScript("src/service.ts", src);
    assert.equal(result.diagnostics.length, 0);

    const shape = result.contracts[0].shape as {
      required: string[];
      properties: Record<string, unknown>;
    };
    // 'bar' and 'fn' are required; 'baz' is optional
    assert.ok(shape.required.includes("bar"));
    assert.ok(shape.required.includes("fn"));
    assert.ok(!shape.required.includes("baz"));
  });

  it("does not mark rest parameters as required", () => {
    const src = `
export function log(message: string, ...args: string[]): void {}
`;
    const result = extractContractsFromTypeScript("src/log.ts", src);
    assert.equal(result.contracts.length, 1);

    const shape = result.contracts[0].shape as {
      properties: { params: { required: string[] } };
    };
    const paramsRequired = shape.properties.params.required;
    assert.ok(paramsRequired.includes("message"), "message should be required");
    assert.ok(
      !paramsRequired.includes("args"),
      "rest param args should not be required",
    );
  });

  it("extracts function with typed parameters", () => {
    const src = `
export function getUser(id: string, active: boolean): void {}
`;
    const result = extractContractsFromTypeScript("src/user.ts", src);
    assert.equal(result.contracts.length, 1);

    const shape = result.contracts[0].shape as {
      properties: {
        params: { properties: Record<string, unknown>; required: string[] };
      };
    };
    assert.deepEqual(shape.properties.params.properties["id"], {
      type: "string",
    });
    assert.deepEqual(shape.properties.params.properties["active"], {
      type: "boolean",
    });
    assert.deepEqual(shape.properties.params.required, ["id", "active"]);
  });

  it("normalizes absolute paths to deterministic ids", () => {
    const src = `
export interface ProfileResponse {
  id: string;
}
`;

    const windowsPath =
      "C:/Users/alice/work/specferret/src/contracts/profile.ts";
    const unixPath =
      "/home/bob/work/specferret/src/contracts/profile.ts";

    const windowsResult = extractContractsFromTypeScript(windowsPath, src);
    const unixResult = extractContractsFromTypeScript(unixPath, src);

    assert.equal(windowsResult.contracts.length, 1);
    assert.equal(unixResult.contracts.length, 1);
    assert.equal(
      windowsResult.contracts[0].id,
      "type.src/contracts/profile/profileresponse",
    );
    assert.equal(
      unixResult.contracts[0].id,
      "type.src/contracts/profile/profileresponse",
    );
  });

  it("falls back to core contract type for inferred declarations", () => {
    const src = `
export interface Team {
  id: string;
}
`;

    const result = extractContractsFromTypeScript("src/team.ts", src);

    assert.equal(result.contracts.length, 1);
    assert.equal(result.contracts[0].type, "type");
  });
});
