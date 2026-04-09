import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'bun:test';
import { SqliteStore } from '@specferret/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, '../ferret.ts');

function runFerret(cwd: string, args: string[], input?: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [ferretBin, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30_000,
    input,
  });
}

describe('ferret review — S32/S33 acceptance criteria', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-review-test-'));
    runFerret(tmpDir, ['init', '--no-hook']);
  });

  afterEach(async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return;
      } catch (error: any) {
        if (error?.code !== 'EBUSY' || attempt === 19) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });

  it('exits 0 with a clean-state message when no items need review', () => {
    const result = runFerret(tmpDir, ['review']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /0 items need review/);
    assert.equal(result.stderr, '');
  }, 15_000);

  it('accept marks reviewed items stable and records a reconciliation log', async () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--contract', 'auth.jwt', '--action', 'accept']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /contract: auth.jwt/);
    assert.match(result.stdout, /ACCEPTED\s+auth\.jwt/);

    const store = new SqliteStore(path.join(tmpDir, '.ferret', 'graph.db'));
    await store.init();
    const nodes = await store.getNodesByStatus('needs-review');
    assert.equal(
      nodes.some((node) => node.file_path.includes('auth\\jwt.contract.md')),
      false,
    );
    const logs = await store.getReconciliationLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].resolved_by, 'accept');
    await store.close();

    const lintResult = runFerret(tmpDir, ['lint']);
    assert.equal(lintResult.status, 1);
    assert.match(lintResult.stdout, /contracts need review/);
  });

  it('update prints grouped copy-paste context and leaves the repo blocked', async () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--contract', 'auth.jwt', '--action', 'update']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /DIRECT IMPACT/);
    assert.match(result.stdout, /TRANSITIVE IMPACT/);
    assert.match(result.stdout, /requested-action: update/);
    assert.match(result.stdout, /contracts[/\\]search[/\\]results\.contract\.md/);
    assert.match(result.stdout, /TRANSITIVE IMPACT\s+[\s\S]*none/);

    const store = new SqliteStore(path.join(tmpDir, '.ferret', 'graph.db'));
    await store.init();
    const nodes = await store.getNodesByStatus('needs-review');
    assert.equal(nodes.length > 0, true);
    const logs = await store.getReconciliationLogs();
    assert.equal(logs.at(-1)?.resolved_by, 'update');
    await store.close();

    const lintResult = runFerret(tmpDir, ['lint']);
    assert.equal(lintResult.status, 1);
  });

  it('reject prints structured context and leaves the repo blocked', async () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--contract', 'auth.jwt', '--action', 'reject']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /requested-action: reject/);
    assert.match(result.stdout, /repo remains blocked until upstream is fixed/);

    const store = new SqliteStore(path.join(tmpDir, '.ferret', 'graph.db'));
    await store.init();
    const nodes = await store.getNodesByStatus('needs-review');
    assert.equal(nodes.length > 0, true);
    const logs = await store.getReconciliationLogs();
    assert.equal(logs.at(-1)?.resolved_by, 'reject');
    await store.close();
  });

  it('supports multi-item selection and applies one action to all selected drift items', async () => {
    seedMultipleBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--action', 'update'], '1,2\n');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /REVIEW ITEMS/);
    assert.match(result.stdout, /api\.GET\/search/);
    assert.match(result.stdout, /auth\.jwt/);
    assert.match(result.stdout, /UPDATE\s+api\.GET\/search, auth\.jwt/);

    const store = new SqliteStore(path.join(tmpDir, '.ferret', 'graph.db'));
    await store.init();
    const logs = await store.getReconciliationLogs();
    assert.equal(logs.length, 2);
    assert.equal(
      logs.every((log) => log.resolved_by === 'update'),
      true,
    );
    await store.close();
  });

  it('prompts for action when no --action is supplied and accepts interactive input', () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--contract', 'auth.jwt'], 'u\n');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /RESOLUTION OPTIONS/);
    assert.match(result.stdout, /requested-action: update/);
  });

  it('emits stable JSON for current review items without ANSI codes', () => {
    seedMultipleBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--json']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /\x1b\[/);

    const json = JSON.parse(result.stdout) as {
      version: string;
      reviewable: Array<{
        contractId: string;
        sourceFile: string;
        impact: {
          direct: Array<{ filePath: string }>;
          transitive: Array<{ filePath: string }>;
        };
        recommendedAction: string;
        availableActions: string[];
      }>;
      selected: string[];
      action: null;
      result: null;
    };

    assert.equal(json.version, '2.0');
    assert.equal(json.reviewable.length, 3);
    assert.equal(json.selected.length, 0);
    assert.equal(json.action, null);
    assert.equal(json.result, null);
    assert.equal(json.reviewable[0].availableActions.includes('accept'), true);
    assert.equal(
      json.reviewable.some((item) => item.impact.direct.length > 0),
      true,
    );
  });

  it('emits structured JSON action results for accept', () => {
    seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--json', '--contract', 'auth.jwt', '--action', 'accept']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');

    const json = JSON.parse(result.stdout) as {
      selected: string[];
      action: string;
      result: {
        repoBlocked: boolean;
        clearedContracts: string[];
        blockedContracts: string[];
      };
    };

    assert.deepEqual(json.selected, ['auth.jwt']);
    assert.equal(json.action, 'accept');
    assert.equal(json.result.repoBlocked, false);
    assert.equal(json.result.clearedContracts.includes('auth.jwt'), true);
    assert.equal(json.result.blockedContracts.length, 0);
  });
});

function seedBreakingDrift(tmpDir: string): void {
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'auth'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'search'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'recommendations'), {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'auth', 'jwt.contract.md'),
    `---\nferret:\n  id: auth.jwt\n  type: type\n  shape:\n    type: object\n    properties:\n      sub:\n        type: string\n      exp:\n        type: string\n    required:\n      - sub\n      - exp\n---\n`,
    'utf-8',
  );
  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'search', 'results.contract.md'),
    `---\nferret:\n  id: api.GET/search\n  type: api\n  imports:\n    - auth.jwt\n  shape:\n    type: object\n    properties:\n      results:\n        type: array\n---\n`,
    'utf-8',
  );
  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'recommendations', 'items.contract.md'),
    `---\nferret:\n  id: api.GET/recommendations\n  type: api\n  imports:\n    - api.GET/search\n  shape:\n    type: object\n    properties:\n      items:\n        type: array\n---\n`,
    'utf-8',
  );

  const baseline = runFerret(tmpDir, ['scan']);
  assert.equal(baseline.status, 0);

  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'auth', 'jwt.contract.md'),
    `---\nferret:\n  id: auth.jwt\n  type: type\n  shape:\n    type: object\n    properties:\n      sub:\n        type: string\n    required:\n      - sub\n---\n`,
    'utf-8',
  );
}

function seedMultipleBreakingDrift(tmpDir: string): void {
  seedBreakingDrift(tmpDir);
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'billing'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'invoices'), { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'billing', 'invoice.contract.md'),
    `---\nferret:\n  id: billing.invoice\n  type: type\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n      total:\n        type: number\n    required:\n      - id\n      - total\n---\n`,
    'utf-8',
  );
  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'invoices', 'list.contract.md'),
    `---\nferret:\n  id: api.GET/invoices\n  type: api\n  imports:\n    - billing.invoice\n  shape:\n    type: object\n    properties:\n      invoices:\n        type: array\n---\n`,
    'utf-8',
  );

  const baseline = runFerret(tmpDir, ['scan']);
  assert.equal(baseline.status, 0);

  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'billing', 'invoice.contract.md'),
    `---\nferret:\n  id: billing.invoice\n  type: type\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n    required:\n      - id\n---\n`,
    'utf-8',
  );
}
