import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach, afterEach } from "bun:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, "../../dist/bin/ferret.js");

function runInit(
  cwd: string,
  args: string[] = ["--no-hook"],
): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [ferretBin, "init", ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
  });
}

describe("ferret init — S01 acceptance criteria", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 0 on a clean run", () => {
    const result = runInit(tmpDir);
    assert.equal(result.status, 0);
  });

  it("creates .ferret/graph.db silently", () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, ".ferret", "graph.db")));
  });

  it("creates specs/ directory if it does not exist", () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, "specs")));
  });

  it("writes specs/example.md with valid ferret frontmatter", () => {
    runInit(tmpDir);
    const content = fs.readFileSync(
      path.join(tmpDir, "specs", "example.md"),
      "utf-8",
    );
    assert.ok(content.includes("ferret:"), "missing ferret: block");
    assert.ok(content.includes("id:"), "missing id field");
    assert.ok(content.includes("type:"), "missing type field");
    assert.ok(content.includes("shape:"), "missing shape field");
  });

  it("writes ferret.config.json with correct defaults", () => {
    runInit(tmpDir);
    const raw = fs.readFileSync(
      path.join(tmpDir, "ferret.config.json"),
      "utf-8",
    );
    const config = JSON.parse(raw) as Record<string, unknown>;
    assert.equal(config.specDir, "specs/");
    assert.equal(typeof config.filePattern, "string");
    assert.equal(config.store, "sqlite");
  });

  it("writes CLAUDE.md containing the context.json instruction", () => {
    runInit(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    assert.ok(
      content.includes("context.json"),
      "CLAUDE.md missing context.json reference",
    );
  });

  it("sends all output to stdout — stderr is empty on a clean run", () => {
    const result = runInit(tmpDir);
    assert.equal(result.stderr, "");
    assert.ok(result.stdout.length > 0);
  });

  it("is idempotent — running twice does not overwrite specs/example.md", () => {
    runInit(tmpDir);

    const examplePath = path.join(tmpDir, "specs", "example.md");
    const sentinel = "# sentinel — must survive second init";
    fs.writeFileSync(examplePath, sentinel, "utf-8");

    runInit(tmpDir);

    const content = fs.readFileSync(examplePath, "utf-8");
    assert.equal(content, sentinel);
  });

  it("second run prints 'Already initialised.' and exits 0", () => {
    runInit(tmpDir);
    const second = runInit(tmpDir);
    assert.equal(second.status, 0);
    assert.ok(
      second.stdout.includes("Already initialised."),
      `expected 'Already initialised.' but got: ${second.stdout}`,
    );
  });

  it("--no-hook skips the pre-commit prompt and still exits 0", () => {
    const result = runInit(tmpDir, ["--no-hook"]);
    assert.equal(result.status, 0);
  });
});
