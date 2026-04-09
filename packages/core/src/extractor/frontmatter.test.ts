import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import { extractFromSpecFile, ALLOWED_TYPES } from "./frontmatter.js";

const VALID_SPEC = `---
ferret:
  id: api.GET/users
  type: api
  shape:
    response:
      type: array
      items:
        type: object
        properties:
          id:
            type: string
            format: uuid
          name:
            type: string
        required: [id, name]
---

# Users Endpoint

Returns all users.
`;

const SPEC_WITH_IMPORTS = `---
ferret:
  id: api.GET/search
  type: api
  shape:
    response:
      type: array
      items:
        type: string
  imports:
    - auth.jwt
    - tables.document
---
`;

const SPEC_WITH_UNSUPPORTED_KEYWORD = `---
ferret:
  id: tables.user
  type: table
  shape:
    type: object
    allOf:
      - type: string
    properties:
      id:
        type: string
---
`;

const SPEC_NO_FRONTMATTER = `# Just a markdown file

No frontmatter here. Ferret should skip this.
`;

const SPEC_MISSING_FIELDS = `---
ferret:
  id: api.GET/broken
  type: api
---
`;

describe("extractFromSpecFile — Task 3", () => {
  it("extracts valid frontmatter correctly", () => {
    const result = extractFromSpecFile("contracts/users.contract.md", VALID_SPEC);
    assert.equal(result.filePath, "contracts/users.contract.md");
    assert.equal(result.fileType, "spec");
    assert.equal(result.extractedBy, "gray-matter");
    assert.equal(result.warning, undefined);
    assert.equal(result.contracts.length, 1);
    assert.equal(result.contracts[0].id, "api.GET/users");
    assert.equal(result.contracts[0].type, "api");
    assert.notEqual(result.contracts[0].shape_hash, undefined);
    assert.equal(result.contracts[0].shape_hash.length, 64);
    assert.deepEqual(result.contracts[0].imports, []);
  });

  it("extracts imports correctly", () => {
    const result = extractFromSpecFile("contracts/search.contract.md", SPEC_WITH_IMPORTS);
    assert.deepEqual(result.contracts[0].imports, [
      "auth.jwt",
      "tables.document",
    ]);
  });

  it("missing frontmatter returns warning, empty contracts, does not throw", () => {
    const result = extractFromSpecFile("contracts/plain.contract.md", SPEC_NO_FRONTMATTER);
    assert.equal(result.warning, "no-frontmatter");
    assert.equal(result.contracts.length, 0);
    assert.equal(result.filePath, "contracts/plain.contract.md");
    assert.equal(result.fileType, "spec");
  });

  it('missing required field "shape" throws with field name in message', () => {
    assert.throws(
      () => extractFromSpecFile("contracts/broken.contract.md", SPEC_MISSING_FIELDS),
      /shape/,
    );
  });

  it("missing multiple required fields throws with all field names in message", () => {
    const specMissingAll = `---\nferret:\n  someField: value\n---\n`;
    assert.throws(
      () => extractFromSpecFile("contracts/broken.contract.md", specMissingAll),
      /id.*type.*shape|Missing required/,
    );
  });

  it("invalid ferret.type throws with allowed values listed", () => {
    const specInvalidType = `---
ferret:
  id: tables.user
  type: schema
  shape:
    type: object
    properties:
      id:
        type: string
---
`;
    assert.throws(
      () => extractFromSpecFile("contracts/invalid-type.contract.md", specInvalidType),
      /Invalid ferret\.type "schema".*api, table, type, event, flow, config/,
    );
  });

  it("all six allowed types are accepted without error", () => {
    for (const t of ALLOWED_TYPES) {
      const spec = `---
ferret:
  id: test.${t}
  type: ${t}
  shape:
    type: object
---
`;
      assert.doesNotThrow(
        () => extractFromSpecFile(`contracts/${t}.contract.md`, spec),
        `Expected type "${t}" to be accepted`,
      );
    }
  });

  it("unsupported schema keyword produces warning, does not fail", () => {
    const stderrOutput: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    // Capture stderr writes
    process.stderr.write = (chunk: any) => {
      stderrOutput.push(String(chunk));
      return true;
    };

    let result: ReturnType<typeof extractFromSpecFile> | undefined;
    try {
      result = extractFromSpecFile(
        "contracts/complex.contract.md",
        SPEC_WITH_UNSUPPORTED_KEYWORD,
      );
    } finally {
      process.stderr.write = originalWrite;
    }

    assert.notEqual(result, undefined);
    assert.equal(result!.contracts.length, 1);
    assert.equal(result!.warning, undefined);
    assert.equal(
      stderrOutput.some((line) => line.includes("allOf")),
      true,
    );
  });

  it("extraction is synchronous — the function itself has no async/await", () => {
    // If extractFromSpecFile returns a Promise, this would be a thenable object
    const result = extractFromSpecFile("contracts/users.contract.md", VALID_SPEC);
    assert.equal(result instanceof Promise, false);
    assert.notEqual(typeof (result as any).then, "function");
  });

  it("identical files produce identical shape_hash", () => {
    const r1 = extractFromSpecFile("contracts/a.contract.md", VALID_SPEC);
    const r2 = extractFromSpecFile("contracts/b.contract.md", VALID_SPEC);
    assert.equal(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });

  it("different shapes produce different shape_hash", () => {
    const specA = VALID_SPEC;
    const specB = specA.replace("format: uuid", "format: email");
    const r1 = extractFromSpecFile("contracts/a.contract.md", specA);
    const r2 = extractFromSpecFile("contracts/b.contract.md", specB);
    assert.notEqual(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });

  it("property order change in shape does NOT change shape_hash", () => {
    const specA = `---
ferret:
  id: api.GET/test
  type: api
  shape:
    type: object
    properties:
      id:
        type: string
      name:
        type: string
    required: [id, name]
---
`;
    const specB = `---
ferret:
  id: api.GET/test
  type: api
  shape:
    type: object
    properties:
      name:
        type: string
      id:
        type: string
    required: [id, name]
---
`;
    const r1 = extractFromSpecFile("contracts/a.contract.md", specA);
    const r2 = extractFromSpecFile("contracts/b.contract.md", specB);
    // Keys are sorted before hashing — order change is a no-change
    assert.equal(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });
});
