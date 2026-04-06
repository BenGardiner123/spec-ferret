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
