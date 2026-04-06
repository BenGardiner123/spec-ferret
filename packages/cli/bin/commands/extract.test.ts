import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach, afterEach } from "bun:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, "../ferret.ts");

function runFerret(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [ferretBin, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
  });
}

describe("ferret extract — S28 acceptance criteria", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-extract-test-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates contract files from annotated TypeScript declarations", () => {
    const source = `
// @ferret-contract: api.GET/users api
export interface GetUsersResponse {
  id: string;
  email: string;
}
`;
    fs.writeFileSync(path.join(tmpDir, "src", "users.ts"), source, "utf-8");

    const result = runFerret(tmpDir, ["extract"]);

    assert.equal(result.status, 0);
    const outPath = path.join(
      tmpDir,
      "contracts",
      "api",
      "get-users.contract.md",
    );
    assert.ok(
      fs.existsSync(outPath),
      `expected generated contract at ${outPath}`,
    );
    const content = fs.readFileSync(outPath, "utf-8");
    assert.ok(content.includes("id: api.GET/users"));
    assert.ok(content.includes("type: api"));
  });

  it("is deterministic across repeated runs with unchanged source", () => {
    const source = `
// @ferret-contract: api.GET/users api
export interface GetUsersResponse {
  id: string;
  email: string;
}
`;
    fs.writeFileSync(path.join(tmpDir, "src", "users.ts"), source, "utf-8");

    const first = runFerret(tmpDir, ["extract"]);
    assert.equal(first.status, 0);

    const outPath = path.join(
      tmpDir,
      "contracts",
      "api",
      "get-users.contract.md",
    );
    const before = fs.readFileSync(outPath, "utf-8");

    const second = runFerret(tmpDir, ["extract"]);
    assert.equal(second.status, 0);

    const after = fs.readFileSync(outPath, "utf-8");
    assert.equal(before, after);
    assert.ok(second.stdout.includes("skipped=1"));
    assert.ok(second.stdout.includes("failed=0"));
  });

  it("exits non-zero and prints diagnostics when extraction fails", () => {
    const source = `// @ferret-contract: api.GET/users api`;
    fs.writeFileSync(path.join(tmpDir, "src", "broken.ts"), source, "utf-8");

    const result = runFerret(tmpDir, ["extract"]);

    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes("failed=1"));
    assert.ok(result.stderr.includes("No interface/type declaration found"));
  });

  it("generates contracts from exported declarations without annotations", () => {
    const source = `
export interface TeamMember {
  id: string;
  email?: string;
}
`;
    fs.writeFileSync(path.join(tmpDir, "src", "member.ts"), source, "utf-8");

    const result = runFerret(tmpDir, ["extract"]);

    assert.equal(result.status, 0);
    const outPath = path.join(
      tmpDir,
      "contracts",
      "type",
      "src-member-teammember.contract.md",
    );
    assert.ok(fs.existsSync(outPath));
    const content = fs.readFileSync(outPath, "utf-8");
    assert.ok(content.includes("id: type.src/member/teammember"));
    assert.ok(content.includes("type: type"));
  });

  it("fails with actionable diagnostic on output path collision", () => {
    const sourceA = `
// @ferret-contract: api.GET/users api
export interface A {
  id: string;
}
`;
    const sourceB = `
// @ferret-contract: api.GET-users api
export interface B {
  id: string;
}
`;
    fs.writeFileSync(path.join(tmpDir, "src", "a.ts"), sourceA, "utf-8");
    fs.writeFileSync(path.join(tmpDir, "src", "b.ts"), sourceB, "utf-8");

    const result = runFerret(tmpDir, ["extract"]);

    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes("failed=1"));
    assert.ok(result.stderr.includes("Path collision"));
    assert.ok(result.stderr.includes("get-users.contract.md"));
  });

  it("deterministically suffixes inferred ids and warns on inferred collisions", () => {
    const source = `
export interface UserProfile {
  id: string;
}

export interface userprofile {
  id: string;
}
`;
    fs.writeFileSync(path.join(tmpDir, "src", "collision.ts"), source, "utf-8");

    const result = runFerret(tmpDir, ["extract"]);

    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes("created=2"));
    assert.ok(result.stdout.includes("failed=0"));
    assert.ok(result.stderr.includes("Inferred id collision"));
    assert.ok(result.stderr.includes("userprofile-2"));

    const firstPath = path.join(
      tmpDir,
      "contracts",
      "type",
      "src-collision-userprofile.contract.md",
    );
    const secondPath = path.join(
      tmpDir,
      "contracts",
      "type",
      "src-collision-userprofile-2.contract.md",
    );

    assert.ok(fs.existsSync(firstPath));
    assert.ok(fs.existsSync(secondPath));
    assert.ok(
      fs.readFileSync(firstPath, "utf-8").includes(
        "id: type.src/collision/userprofile",
      ),
    );
    assert.ok(
      fs.readFileSync(secondPath, "utf-8").includes(
        "id: type.src/collision/userprofile-2",
      ),
    );
  });

  it("normalizes required arrays in canonical sorted order", () => {
    const source = `
// @ferret-contract: api.GET/canonical api
export interface Canonical {
  zeta: string;
  alpha: string;
}
`;
    fs.writeFileSync(path.join(tmpDir, "src", "canonical.ts"), source, "utf-8");

    const result = runFerret(tmpDir, ["extract"]);
    assert.equal(result.status, 0);

    const outPath = path.join(
      tmpDir,
      "contracts",
      "api",
      "get-canonical.contract.md",
    );
    const content = fs.readFileSync(outPath, "utf-8");
    assert.match(content, /required:\s*[\s\S]*- alpha[\s\S]*- zeta/);
  });
});
