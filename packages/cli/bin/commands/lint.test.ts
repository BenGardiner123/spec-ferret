import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach, afterEach } from "bun:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, "../../dist/bin/ferret.js");

function runFerret(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [ferretBin, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
  });
}

describe("ferret lint — S07 acceptance criteria", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-lint-test-"));
    // Lint requires an initialised project
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 0 on a clean project with no drift", () => {
    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 0);
  });

  it("prints the clean-state summary line to stdout", () => {
    const result = runFerret(tmpDir, ["lint"]);
    // Expected: ✓ ferret  N contracts  0 drift  Xms
    assert.match(result.stdout, /0 drift\s+\d+ms/);
  });

  it("produces no stderr on a clean run", () => {
    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.stderr, "");
  });

  it("--ci flag outputs valid JSON to stdout", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  });

  it("--ci JSON has all required fields: version, consistent, breaking, nonBreaking, flagged, timestamp", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.ok("version" in json, "missing version");
    assert.ok("consistent" in json, "missing consistent");
    assert.ok("breaking" in json, "missing breaking");
    assert.ok("nonBreaking" in json, "missing nonBreaking");
    assert.ok("flagged" in json, "missing flagged");
    assert.ok("timestamp" in json, "missing timestamp");
  });

  it("--ci JSON has correct types for each field", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(typeof json.version, "string");
    assert.equal(typeof json.consistent, "boolean");
    assert.equal(typeof json.breaking, "number");
    assert.equal(typeof json.nonBreaking, "number");
    assert.ok(Array.isArray(json.flagged));
    assert.equal(typeof json.timestamp, "string");
  });

  it("--ci exits 0 on a consistent (drift-free) project", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    assert.equal(result.status, 0);
  });

  it("--ci consistent field is true on a clean project", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(json.consistent, true);
  });

  it("--ci output contains zero ANSI escape codes", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    // ANSI sequences start with ESC (\x1b)
    assert.doesNotMatch(result.stdout, /\x1b\[/);
  });

  it("includes a timing value in the clean-state summary output", () => {
    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 0);
    const match = result.stdout.match(/(\d+)ms/);
    assert.ok(match, "output should contain a timing value in ms");
  });
});
