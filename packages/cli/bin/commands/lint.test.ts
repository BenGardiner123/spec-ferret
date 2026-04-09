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

function stableIt(name: string, fn: () => void | Promise<void>): void {
  it(name, fn, 15_000);
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

describe("ferret lint — S07 acceptance criteria", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-lint-test-"));
    // Lint tests use committed baseline mode, so create context.json once.
    runFerret(tmpDir, ["init", "--no-hook"]);
    runFerret(tmpDir, ["scan"]);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt("exits 0 on a clean project with no drift", () => {
    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 0);
  });

  stableIt("prints the clean-state summary line to stdout", () => {
    const result = runFerret(tmpDir, ["lint"]);
    // Expected: ✓ ferret  N contracts  0 drift  Xms
    assert.match(result.stdout, /0 drift\s+\d+ms/);
  });

  stableIt("produces no stderr on a clean run", () => {
    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.stderr, "");
  });

  stableIt("--ci flag outputs valid JSON to stdout", () => {
    const result = runFerret(tmpDir, [
      "lint",
      "--ci",
      "--ci-baseline",
      "rebuild",
    ]);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  });

  stableIt(
    "--ci JSON has all required fields: version, consistent, breaking, nonBreaking, flagged, timestamp",
    () => {
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
    },
  );

  stableIt("--ci JSON has correct types for each field", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(typeof json.version, "string");
    assert.equal(typeof json.consistent, "boolean");
    assert.equal(typeof json.breaking, "number");
    assert.equal(typeof json.nonBreaking, "number");
    assert.ok(Array.isArray(json.flagged));
    assert.equal(typeof json.timestamp, "string");
  });

  stableIt("--ci exits 0 on a consistent (drift-free) project", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    assert.equal(result.status, 0);
  });

  stableIt("--ci consistent field is true on a clean project", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(json.consistent, true);
  });

  stableIt("--ci output contains zero ANSI escape codes", () => {
    const result = runFerret(tmpDir, ["lint", "--ci"]);
    // ANSI sequences start with ESC (\x1b)
    assert.doesNotMatch(result.stdout, /\x1b\[/);
  });

  stableIt("includes a timing value in the clean-state summary output", () => {
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

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt(
    "fails on unresolved imports with actionable local diagnostics",
    () => {
      const contractPath = path.join(
        tmpDir,
        "contracts",
        "example.contract.md",
      );
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
      assert.match(result.stdout, /expected target api.GET\/missing/);
      assert.match(result.stdout, /orphaned contract/);
      assert.match(result.stdout, /remediation:/);
    },
  );

  stableIt("includes transitive chain context for unresolved imports", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "root.contract.md"),
      `---\nferret:\n  id: api.GET/root\n  type: api\n  imports:\n    - api.GET/mid\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "mid.contract.md"),
      `---\nferret:\n  id: api.GET/mid\n  type: api\n  imports:\n    - api.GET/leaf\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "leaf.contract.md"),
      `---\nferret:\n  id: api.GET/leaf\n  type: api\n  imports:\n    - api.GET/missing\n  shape:\n    type: object\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 2);
    assert.match(
      result.stdout,
      /transitive chain: api.GET\/root -> api.GET\/mid -> api.GET\/leaf -> api.GET\/missing/,
    );
  });

  stableIt("fails on self-imports with actionable local diagnostics", () => {
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

  stableIt("fails on circular imports with concise local diagnostics", () => {
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

  stableIt("reports integrity violations in machine-readable CI output", () => {
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
        unresolvedImports: Array<{
          contractId: string;
          importPath: string;
          expectedTargetId: string;
          transitiveChain?: string[];
        }>;
        selfImports: unknown[];
        circularImports: unknown[];
        orphanedContracts: Array<{
          contractId: string;
          unresolvedImports: string[];
          remediationHint: string;
        }>;
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
    assert.equal(
      json.integrityViolations.unresolvedImports[0].expectedTargetId,
      "api.GET/missing",
    );
    assert.equal(json.integrityViolations.selfImports.length, 0);
    assert.equal(json.integrityViolations.circularImports.length, 0);
    assert.equal(json.integrityViolations.orphanedContracts.length, 1);
    assert.equal(
      json.integrityViolations.orphanedContracts[0].contractId,
      "api.GET/example",
    );
  });
});

describe("ferret lint — S31 import suggestions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-lint-suggestions-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt("emits warning-level suggestions without failing lint", () => {
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

  stableIt(
    "suppresses suggestions in --ci mode unless explicitly requested",
    () => {
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
    },
  );

  stableIt(
    "includes suggestions in --ci mode when --ci-suggestions is set",
    () => {
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
    },
  );

  stableIt("allows disabling suggestions via config", () => {
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

describe("ferret lint — #31 fail-fast scan errors", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-lint-fail-fast-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt("fails with actionable diagnostics on malformed frontmatter", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "bad.contract.md"),
      `---\nferret:\n  id: api.bad\n  type: api\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint"]);

    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /scan failed for contracts[\\/]bad\.contract\.md/,
    );
    assert.match(result.stderr, /Missing required frontmatter fields/i);
    // Diagnostic must appear exactly once — no double-write from scan + lint
    assert.equal(
      (result.stderr.match(/scan failed for/g) ?? []).length,
      1,
      "diagnostic should appear exactly once on stderr",
    );
    assert.doesNotMatch(result.stderr, /ferret: ferret:/);
  });

  stableIt("fails with actionable diagnostics on parser failures", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "broken-yaml.contract.md"),
      `---\nferret:\n  id: api.broken\n  type: api\n  shape:\n    type: object\n    properties:\n      bad: [unclosed\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint"]);

    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /scan failed for contracts[\\/]broken-yaml\.contract\.md/,
    );
    assert.match(
      result.stderr,
      /YAML|end of the stream|missed comma|unexpected/i,
    );
    assert.doesNotMatch(result.stderr, /ferret: ferret:/);
  });
});

describe("ferret lint — #30 severity classification", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ferret-lint-severity-"));
    runFerret(tmpDir, ["init", "--no-hook"]);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt(
    "CI breaking/nonBreaking counts reflect trigger severity, not graph depth",
    () => {
      // Baseline: two contracts, downstream imports upstream
      fs.writeFileSync(
        path.join(tmpDir, "contracts", "upstream.contract.md"),
        `---\nferret:\n  id: api.upstream\n  type: api\n  shape:\n    type: object\n    properties:\n      name:\n        type: string\n    required:\n      - name\n---\n`,
        "utf-8",
      );
      fs.writeFileSync(
        path.join(tmpDir, "contracts", "downstream.contract.md"),
        `---\nferret:\n  id: api.downstream\n  type: api\n  imports:\n    - api.upstream\n  shape:\n    type: object\n    properties:\n      ok:\n        type: boolean\n---\n`,
        "utf-8",
      );

      // Scan baseline
      runFerret(tmpDir, ["scan"]);

      // Now introduce a breaking change to upstream (add a required field)
      fs.writeFileSync(
        path.join(tmpDir, "contracts", "upstream.contract.md"),
        `---\nferret:\n  id: api.upstream\n  type: api\n  shape:\n    type: object\n    properties:\n      name:\n        type: string\n      email:\n        type: string\n    required:\n      - name\n      - email\n---\n`,
        "utf-8",
      );

      const result = runFerret(tmpDir, [
        "lint",
        "--ci",
        "--ci-baseline",
        "rebuild",
      ]);
      const json = JSON.parse(result.stdout) as {
        breaking: number;
        nonBreaking: number;
        flagged: Array<{ triggeredByContractId: string; depth: number }>;
      };

      // The downstream node is flagged because upstream changed (breaking).
      // Old bug: depth=1 counted as "breaking", depth>1 as "nonBreaking".
      // Correct: the trigger contract (api.upstream) has status=needs-review,
      // so ALL nodes it flagged are "breaking" regardless of depth.
      assert.equal(json.breaking, json.flagged.length);
      assert.equal(json.nonBreaking, 0);
    },
  );

  stableIt("human output counts match trigger severity for mixed drift", () => {
    // Baseline: two independent contracts
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "auth.contract.md"),
      `---\nferret:\n  id: api.auth\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n    required:\n      - token\n---\n`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "profile.contract.md"),
      `---\nferret:\n  id: api.profile\n  type: api\n  imports:\n    - api.auth\n  shape:\n    type: object\n    properties:\n      name:\n        type: string\n---\n`,
      "utf-8",
    );

    runFerret(tmpDir, ["scan"]);

    // Breaking change to auth (add required field)
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "auth.contract.md"),
      `---\nferret:\n  id: api.auth\n  type: api\n  shape:\n    type: object\n    properties:\n      token:\n        type: string\n      refreshToken:\n        type: string\n    required:\n      - token\n      - refreshToken\n---\n`,
      "utf-8",
    );

    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 1);
    // All flagged nodes are downstream of a breaking trigger
    assert.match(result.stdout, /1 breaking\s+0 non-breaking/);
  });

  stableIt("no false non-zero exit on clean state after re-scan", () => {
    fs.writeFileSync(
      path.join(tmpDir, "contracts", "stable.contract.md"),
      `---\nferret:\n  id: api.stable\n  type: api\n  shape:\n    type: object\n    properties:\n      ok:\n        type: boolean\n---\n`,
      "utf-8",
    );

    runFerret(tmpDir, ["scan"]);
    // Re-scan with identical content should remain clean
    const result = runFerret(tmpDir, ["lint"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /0 drift/);
  });
});
