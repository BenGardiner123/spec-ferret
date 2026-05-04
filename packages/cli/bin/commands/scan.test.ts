import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach, afterEach } from "bun:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, "../ferret.ts");

function runFerret(cwd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [ferretBin, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
  });
}

async function cleanupTmpDir(tmpDir: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    } catch (error: any) {
      if (error?.code !== "EBUSY" || attempt === 19) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

describe("ferret scan — S57 .contract.ts discovery", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-scan-ts-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  it("discovers and processes both .contract.md and .contract.ts in the same scan", () => {
    // .contract.md — standard gray-matter contract
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "search.contract.md"),
      `---\nferret:\n  id: api.search\n  type: api\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );

    // .contract.ts — output: {} is a plain empty schema-definition map; z.object({}) accepts it
    // as a valid empty Zod object schema, so extraction succeeds with no fields.
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "auth.contract.ts"),
      `export const authContract = {\n  value: 'JWT authentication contract',\n  output: {},\n};\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan"]);

    assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stdout, /3 files scanned/);
    assert.match(result.stdout, /3 contracts updated/);

    // Verify context.json contains both contracts
    const contextPath = path.join(tmpDir, ".ferret", "context.json");
    assert.ok(fs.existsSync(contextPath), "context.json was not written");
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8"));
    const ids = context.contracts.map((c: { id: string }) => c.id);
    assert.ok(ids.includes("api.search"), `api.search not in context: ${JSON.stringify(ids)}`);
    assert.ok(ids.includes("authContract"), `authContract not in context: ${JSON.stringify(ids)}`);
  });

  it(".contract.ts with no valid exports emits a warning and is skipped without crashing", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "empty.contract.ts"),
      `export const version = '1.0.0';\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan"]);

    assert.equal(result.status, 0, `scan crashed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stderr, /no ferret frontmatter — skipped/);
  });

  it("opt-out via contractParsers.typescript=false skips .contract.ts discovery", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "search.contract.md"),
      `---\nferret:\n  id: api.search\n  type: api\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "auth.contract.ts"),
      `export const authContract = { value: 'auth', output: {} };\n`,
      "utf-8",
    );

    // Write config with typescript discovery disabled
    const configPath = path.join(tmpDir, "ferret.config.json");
    const existing = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    existing.contractParsers = { typescript: false };
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");

    const result = runFerret(tmpDir, ["scan"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /2 files scanned/);

    const contextPath = path.join(tmpDir, ".ferret", "context.json");
    const context = JSON.parse(fs.readFileSync(contextPath, "utf-8"));
    const ids = context.contracts.map((c: { id: string }) => c.id);
    assert.ok(ids.includes("api.search"));
    assert.ok(!ids.includes("authContract"), "authContract should not be present when typescript=false");
  });
});

describe("ferret scan — #31 error handling", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-scan-errors-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  it("fails fast on malformed frontmatter by default", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "bad.contract.md"),
      `---\nferret:\n  id: api.bad\n  type: api\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan"]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /scan failed for contracts[\\/]bad\.contract\.md/);
    assert.match(result.stderr, /Missing required frontmatter fields/i);
    // Diagnostic must appear exactly once — no double-write
    assert.equal(
      (result.stderr.match(/scan failed for/g) ?? []).length,
      1,
      "diagnostic should appear exactly once on stderr",
    );
    // Prefix must not be doubled
    assert.doesNotMatch(result.stderr, /ferret: ferret:/);
  });

  it("fails fast on YAML parser errors by default", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "broken-yaml.contract.md"),
      `---\nferret:\n  id: api.broken\n  type: api\n  shape:\n    type: object\n    properties:\n      bad: [unclosed\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan"]);

    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /scan failed for contracts[\\/]broken-yaml\.contract\.md/,
    );
    assert.match(result.stderr, /YAML|end of the stream|missed comma|unexpected/i);
    assert.doesNotMatch(result.stderr, /ferret: ferret:/);
  });

  it("allows explicit partial success with --allow-partial-success", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "good.contract.md"),
      `---\nferret:\n  id: api.good\n  type: api\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "bad.contract.md"),
      `---\nferret:\n  id: api.bad\n  type: api\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan", "--allow-partial-success"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /1 failed\./);
    assert.match(result.stderr, /--allow-partial-success/);
    assert.match(result.stderr, /scan failed for contracts[\\/]bad\.contract\.md/);
  });
});

describe("ferret scan — auto-inference of stable status from source", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-scan-status-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  it("source resolves clean → contract auto-promoted to stable", () => {
    // Implementation file in src/ (outside specDir so it is not scanned as a contract)
    fs.writeFileSync(
      path.join(tmpDir, "src", "impl.contract.ts"),
      `export const implContract = { value: 'Implementation', output: {} };\n`,
      "utf-8",
    );

    // Contract with an empty declared shape pointing to the impl above
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "main.contract.md"),
      [
        "---",
        "ferret:",
        "  id: api.main",
        "  type: api",
        "  shape: {}",
        "  source:",
        "    file: src/impl.contract.ts",
        "    symbol: implContract",
        "---",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan"]);
    assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

    const context = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".ferret", "context.json"), "utf-8"),
    ) as { contracts: Array<{ id: string; status: string }> };
    const contract = context.contracts.find((c) => c.id === "api.main");
    assert.ok(contract, "api.main not found in context.json");
    assert.equal(contract.status, "stable", `expected stable but got ${contract.status}`);
  });

  it("source shape mismatches declared → contract stays pending", () => {
    // Implementation has an empty shape — does not match the declared required field
    fs.writeFileSync(
      path.join(tmpDir, "src", "impl2.contract.ts"),
      `export const impl2Contract = { value: 'Impl', output: {} };\n`,
      "utf-8",
    );

    // Contract declares a required field the impl does not have → breaking upward drift → stays pending
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "mismatch.contract.md"),
      [
        "---",
        "ferret:",
        "  id: api.mismatch",
        "  type: api",
        "  shape:",
        "    type: object",
        "    properties:",
        "      name:",
        "        type: string",
        "    required:",
        "      - name",
        "  source:",
        "    file: src/impl2.contract.ts",
        "    symbol: impl2Contract",
        "---",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan"]);
    assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

    const context = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".ferret", "context.json"), "utf-8"),
    ) as { contracts: Array<{ id: string; status: string }> };
    const contract = context.contracts.find((c) => c.id === "api.mismatch");
    assert.ok(contract, "api.mismatch not found in context.json");
    assert.equal(contract.status, "pending", `expected pending but got ${contract.status}`);
  });

  it("no source field → contract stays pending (regression guard)", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "nosource.contract.md"),
      [
        "---",
        "ferret:",
        "  id: api.nosource",
        "  type: api",
        "  shape: {}",
        "---",
        "",
      ].join("\n"),
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan"]);
    assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

    const context = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".ferret", "context.json"), "utf-8"),
    ) as { contracts: Array<{ id: string; status: string }> };
    const contract = context.contracts.find((c) => c.id === "api.nosource");
    assert.ok(contract, "api.nosource not found in context.json");
    assert.equal(contract.status, "pending", `expected pending but got ${contract.status}`);
  });

  it(".contract.ts without explicit source stays pending (self-reference guard)", () => {
    // A .contract.ts without an explicit source.file has sourceFile default to the file
    // itself. The guard normalizedSourceFile !== relFile must block promotion so that
    // no contract ever auto-promotes by comparing its shape against itself.
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "self.contract.ts"),
      `export const selfContract = { value: 'Self', output: {} };\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["scan"]);
    assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

    const context = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".ferret", "context.json"), "utf-8"),
    ) as { contracts: Array<{ id: string; status: string }> };
    const contract = context.contracts.find((c) => c.id === "selfContract");
    assert.ok(contract, "selfContract not found in context.json");
    assert.equal(contract.status, "pending", `expected pending but got ${contract.status}`);
  });
});
