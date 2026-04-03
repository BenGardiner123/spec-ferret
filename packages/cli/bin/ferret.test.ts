import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "bun:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, "./ferret.ts");

describe("ferret version", () => {
  it("prints the current CLI package version", () => {
    const result = spawnSync(process.execPath, [ferretBin, "--version"], {
      encoding: "utf-8",
      timeout: 10_000,
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "0.1.3");
    assert.equal(result.stderr, "");
  });
});
