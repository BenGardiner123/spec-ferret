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

describe("ferret lint — S07 acceptance criteria", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-lint-test-"));
    // Lint tests use committed baseline mode, so create context.json once.
    runFerret(tmpDir, ["init", "--no-hook"]);
    runFerret(tmpDir, ["scan"]);
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
    const result = runFerret(tmpDir, [
      "lint",
      "--ci",
      "--ci-baseline",
      "rebuild",
    ]);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  });

  it("--ci JSON has all required fields: version, consistent, breaking, nonBreaking, flagged, timestamp", () => {
    const result = runFerret(tmpDir, [
      "lint",
      "--ci",
      "--ci-baseline",
      "rebuild",
    ]);
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

describe("ferret lint — S30 import integrity", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-lint-integrity-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fails on unresolved imports with actionable local diagnostics", () => {
    const contractPath = path.join(tmpDir, "contracts", "example.contract.md");
    fs.writeFileSync(
      contractPath,
      `---\nferret:\n  id: api.GET/example\n  type: api\n  imports:\n    - api.GET/missing\n  shape:\n    type: object\n    properties:\n      ok:\n        type: boolean\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /import integrity violations/);
    assert.match(result.stdout, /api.GET\/example/);
    assert.match(result.stdout, /contracts[\\/]example\.contract\.md/);
    assert.match(result.stdout, /unresolved import api.GET\/missing/);
  });

  it("fails on self-imports with actionable local diagnostics", () => {
    const contractPath = path.join(tmpDir, "contracts", "example.contract.md");
    fs.writeFileSync(
      contractPath,
      `---\nferret:\n  id: api.GET/example\n  type: api\n  imports:\n    - api.GET/example\n  shape:\n    type: object\n    properties:\n      ok:\n        type: boolean\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /self-import api.GET\/example/);
  });

  it("fails on circular imports with concise local diagnostics", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "a.contract.md"),
      `---\nferret:\n  id: api.GET/a\n  type: api\n  imports:\n    - api.GET/b\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "b.contract.md"),
      `---\nferret:\n  id: api.GET/b\n  type: api\n  imports:\n    - api.GET/a\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 2);
    assert.match(
      result.stdout,
      /circular import api.GET\/a -> api.GET\/b -> api.GET\/a/,
    );
  });

  it("reports integrity violations in machine-readable CI output", () => {
    runFerret(tmpDir, ["scan"]);

    const contractPath = path.join(tmpDir, "contracts", "example.contract.md");
    fs.writeFileSync(
      contractPath,
      `---\nferret:\n  id: api.GET/example\n  type: api\n  imports:\n    - api.GET/missing\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint", "--ci"]);
    assert.equal(result.status, 2);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /\x1b\[/);

    const json = JSON.parse(result.stdout) as {
      integrityViolations: {
        unresolvedImports: Array<{ contractId: string; importPath: string }>;
        selfImports: unknown[];
        circularImports: unknown[];
      };
      flagged: unknown[];
      breaking: number;
      nonBreaking: number;
    };

    assert.equal(json.breaking, 0);
    assert.equal(json.nonBreaking, 0);
    assert.equal(json.flagged.length, 0);
    assert.equal(json.integrityViolations.unresolvedImports.length, 1);
    assert.equal(
      json.integrityViolations.unresolvedImports[0].contractId,
      "api.GET/example",
    );
    assert.equal(
      json.integrityViolations.unresolvedImports[0].importPath,
      "api.GET/missing",
    );
    assert.equal(json.integrityViolations.selfImports.length, 0);
    assert.equal(json.integrityViolations.circularImports.length, 0);
  });
});

describe("ferret lint — S31 import suggestions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-lint-suggestions-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("emits warning-level suggestions without failing lint", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "a.contract.md"),
      `---\nferret:\n  id: api.GET/a\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      userId:\n        type: string\n---\n`,
      "utf-8",
    );

    fs.writeFileSync(
      path.join(tmpDir, "contracts", "b.contract.md"),
      `---\nferret:\n  id: auth.jwt\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      userId:\n        type: string\n      expiresAt:\n        type: string\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /import suggestions/);
    assert.match(result.stdout, /consider importing auth.jwt/);
    assert.match(result.stdout, /high confidence|medium confidence/);
  });

  it("suppresses suggestions in --ci mode unless explicitly requested", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "a.contract.md"),
      `---\nferret:\n  id: api.GET/a\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      userId:\n        type: string\n---\n`,
      "utf-8",
    );

    fs.writeFileSync(
      path.join(tmpDir, "contracts", "b.contract.md"),
      `---\nferret:\n  id: auth.jwt\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      userId:\n        type: string\n      expiresAt:\n        type: string\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, [
      "lint",
      "--ci",
      "--ci-baseline",
      "rebuild",
    ]);
    assert.equal(result.status, 0);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal("importSuggestions" in json, false);
  });

  it("includes suggestions in --ci mode when --ci-suggestions is set", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "a.contract.md"),
      `---\nferret:\n  id: api.GET/a\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      userId:\n        type: string\n---\n`,
      "utf-8",
    );

    fs.writeFileSync(
      path.join(tmpDir, "contracts", "b.contract.md"),
      `---\nferret:\n  id: auth.jwt\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      userId:\n        type: string\n      expiresAt:\n        type: string\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, [
      "lint",
      "--ci",
      "--ci-baseline",
      "rebuild",
      "--ci-suggestions",
    ]);
    assert.equal(result.status, 0);
    const json = JSON.parse(result.stdout) as {
      importSuggestions: Array<{
        sourceContractId: string;
        suggestedImportId: string;
      }>;
    };
    assert.equal(Array.isArray(json.importSuggestions), true);
    assert.equal(json.importSuggestions.length > 0, true);
    assert.equal(json.importSuggestions[0].sourceContractId, "api.GET/a");
    assert.equal(json.importSuggestions[0].suggestedImportId, "auth.jwt");
  });

  it("allows disabling suggestions via config", () => {
    const configPath = path.join(tmpDir, "ferret.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      importSuggestions?: { enabled?: boolean };
    };
    config.importSuggestions = { enabled: false };
    fs.writeFileSync(
      configPath,
      JSON.stringify(config, null, 2) + "\n",
      "utf-8",
    );

    fs.writeFileSync(
      path.join(tmpDir, "contracts", "a.contract.md"),
      `---\nferret:\n  id: api.GET/a\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      userId:\n        type: string\n---\n`,
      "utf-8",
    );

    fs.writeFileSync(
      path.join(tmpDir, "contracts", "b.contract.md"),
      `---\nferret:\n  id: auth.jwt\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      userId:\n        type: string\n      expiresAt:\n        type: string\n---\n`,
      "utf-8",
    );

    const local = runFerret(tmpDir, ["lint"]);
    assert.equal(local.status, 0);
    assert.doesNotMatch(local.stdout, /import suggestions/);

    const ci = runFerret(tmpDir, [
      "lint",
      "--ci",
      "--ci-baseline",
      "rebuild",
      "--ci-suggestions",
    ]);
    assert.equal(ci.status, 0);
    const json = JSON.parse(ci.stdout) as Record<string, unknown>;
    assert.equal("importSuggestions" in json, false);
  });
});
