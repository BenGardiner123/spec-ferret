import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach, afterEach } from "bun:test";
import { SqliteStore } from "@specferret/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, "../ferret.ts");

function runFerret(
  cwd: string,
  args: string[],
  input?: string,
): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [ferretBin, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
    input,
  });
}

describe("ferret review — S32 acceptance criteria", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-review-test-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(async () => {
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
  });

  it("exits 0 with a clean-state message when no items need review", () => {
    const result = runFerret(tmpDir, ["review"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /0 items need review/);
    assert.equal(result.stderr, "");
  });

  it("accept marks reviewed items stable and records a reconciliation log", async () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, [
      "review",
      "--contract",
      "auth.jwt",
      "--action",
      "accept",
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /contract: auth.jwt/);
    assert.match(result.stdout, /ACCEPTED\s+auth\.jwt/);

    const store = new SqliteStore(path.join(tmpDir, ".ferret", "graph.db"));
    await store.init();
    const nodes = await store.getNodesByStatus("needs-review");
    assert.equal(nodes.length, 0);
    const logs = await store.getReconciliationLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].resolved_by, "accept");
    await store.close();

    const lintResult = runFerret(tmpDir, ["lint"]);
    assert.equal(lintResult.status, 0);
  });

  it("update prints copy-paste context and leaves the repo blocked", async () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, [
      "review",
      "--contract",
      "auth.jwt",
      "--action",
      "update",
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /COPY-PASTE CONTEXT/);
    assert.match(result.stdout, /requested-action: update/);
    assert.match(
      result.stdout,
      /next-step: Update downstream files and re-run ferret lint/,
    );

    const store = new SqliteStore(path.join(tmpDir, ".ferret", "graph.db"));
    await store.init();
    const nodes = await store.getNodesByStatus("needs-review");
    assert.equal(nodes.length > 0, true);
    const logs = await store.getReconciliationLogs();
    assert.equal(logs.at(-1)?.resolved_by, "update");
    await store.close();

    const lintResult = runFerret(tmpDir, ["lint"]);
    assert.equal(lintResult.status, 1);
  });

  it("reject prints structured context and leaves the repo blocked", async () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, [
      "review",
      "--contract",
      "auth.jwt",
      "--action",
      "reject",
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /requested-action: reject/);
    assert.match(result.stdout, /repo remains blocked until upstream is fixed/);

    const store = new SqliteStore(path.join(tmpDir, ".ferret", "graph.db"));
    await store.init();
    const nodes = await store.getNodesByStatus("needs-review");
    assert.equal(nodes.length > 0, true);
    const logs = await store.getReconciliationLogs();
    assert.equal(logs.at(-1)?.resolved_by, "reject");
    await store.close();
  });

  it("prompts for action when no --action is supplied and accepts interactive input", () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(
      tmpDir,
      ["review", "--contract", "auth.jwt"],
      "u\n",
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /RESOLUTION OPTIONS/);
    assert.match(result.stdout, /requested-action: update/);
  });
});

function seedBreakingDrift(tmpDir: string): void {
  fs.mkdirSync(path.join(tmpDir, "contracts", "auth"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "contracts", "search"), { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, "contracts", "auth", "jwt.contract.md"),
    `---\nferret:\n  id: auth.jwt\n  type: schema\n  shape:\n    type: object\n    properties:\n      sub:\n        type: string\n      exp:\n        type: string\n    required:\n      - sub\n      - exp\n---\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(tmpDir, "contracts", "search", "results.contract.md"),
    `---\nferret:\n  id: api.GET/search\n  type: api\n  imports:\n    - auth.jwt\n  shape:\n    type: object\n    properties:\n      results:\n        type: array\n---\n`,
    "utf-8",
  );

  const baseline = runFerret(tmpDir, ["scan"]);
  assert.equal(baseline.status, 0);

  fs.writeFileSync(
    path.join(tmpDir, "contracts", "auth", "jwt.contract.md"),
    `---\nferret:\n  id: auth.jwt\n  type: schema\n  shape:\n    type: object\n    properties:\n      sub:\n        type: string\n    required:\n      - sub\n---\n`,
    "utf-8",
  );
}
