import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'bun:test';
import { SqliteStore, hashSchema } from '@specferret/core';
import { runFerretCli } from '../test-utils/run-ferret';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, '../ferret.ts');

function runFerret(cwd: string, args: string[], input?: string): ReturnType<typeof runFerretCli> {
  return runFerretCli(ferretBin, args, {
    cwd,
    timeout: 240_000,
    input,
  });
}

function stableIt(name: string, fn: () => void | Promise<void>, timeout = 240_000): void {
  it(name, fn, timeout);
}

function runFerretOk(cwd: string, args: string[], input?: string): ReturnType<typeof runFerretCli> {
  const result = runFerret(cwd, args, input);
  assert.equal(result.status, 0, `command failed: ferret ${args.join(' ')}\nstderr: ${result.stderr}`);
  return result;
}

type SeededReviewContract = {
  contractId: string;
  filePath: string;
  fileContent: string;
  contractType: string;
  shapeSchema: Record<string, unknown>;
  imports?: string[];
};

async function seedBaselineContracts(tmpDir: string, contracts: SeededReviewContract[]): Promise<void> {
  const store = new SqliteStore(path.join(tmpDir, '.ferret', 'graph.db'));

  try {
    await store.init();

    for (const contract of contracts) {
      const nodeId = randomUUID();
      const storeFilePath = contract.filePath.split('/').join(path.sep);
      await store.upsertNode({
        id: nodeId,
        file_path: storeFilePath,
        hash: hashSchema(contract.fileContent),
        status: 'stable',
      });

      await store.upsertContract({
        id: contract.contractId,
        node_id: nodeId,
        shape_hash: hashSchema(contract.shapeSchema),
        shape_schema: JSON.stringify(contract.shapeSchema),
        type: contract.contractType,
        status: 'stable',
      });

      await store.replaceDependenciesForSourceNode(nodeId, contract.imports ?? []);
    }
  } finally {
    await store.close();
  }
}

describe('ferret review — S32/S33 acceptance criteria', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-review-test-'));
    runFerretOk(tmpDir, ['init', '--no-hook']);
    fs.mkdirSync(path.join(tmpDir, 'contracts'), { recursive: true });
  });

  afterEach(async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return;
      } catch (error: any) {
        if (error?.code !== 'EBUSY' || attempt === 99) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });

  stableIt(
    'exits 0 with a clean-state message when no items need review',
    () => {
      const result = runFerret(tmpDir, ['review']);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /0 items need review/);
      assert.equal(result.stderr, '');
    },
    240_000,
  );

  stableIt('accept marks reviewed items stable and records a reconciliation log', async () => {
    await seedBreakingDrift(tmpDir);

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

  stableIt(
    'update prints grouped copy-paste context and leaves the repo blocked',
    async () => {
      await seedBreakingDrift(tmpDir);

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
    },
    120_000,
  );

  stableIt(
    'reject prints structured context and leaves the repo blocked',
    async () => {
      await seedBreakingDrift(tmpDir);

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
    },
    120_000,
  );

  stableIt(
    'supports multi-item selection and applies one action to all selected drift items',
    async () => {
      await seedMultipleBreakingDrift(tmpDir);

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
    },
    120_000,
  );

  stableIt(
    'prompts for action when no --action is supplied and accepts interactive input',
    async () => {
      await seedBreakingDrift(tmpDir);

      const result = runFerret(tmpDir, ['review', '--contract', 'auth.jwt'], 'u\n');
      assert.equal(result.status, 0);
      assert.match(result.stdout, /RESOLUTION OPTIONS/);
      assert.match(result.stdout, /requested-action: update/);
    },
    120_000,
  );

  stableIt('emits stable JSON for current review items without ANSI codes', async () => {
    await seedMultipleBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--json']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /\x1b\[/);

    const json = JSON.parse(result.stdout) as {
      version: string;
      reviewSchemaVersion: string;
      diagnosticsSchemaVersion: string;
      diagnostics: Array<{
        code: string;
        severity: string;
        location: Record<string, unknown>;
        remediation: string;
      }>;
      reviewable: Array<{
        contractId: string;
        sourceFile: string;
        impact: {
          direct: Array<{ filePath: string }>;
          transitive: Array<{ filePath: string }>;
        };
        suggestedActions: Array<{
          action: string;
          confidence: string;
          reason: string;
        }>;
        dependencyContext: {
          directDependents: Array<{ filePath: string; depth: number }>;
          transitiveDependents: Array<{ filePath: string; depth: number }>;
        };
        recommendedAction: string;
        availableActions: string[];
      }>;
      selected: string[];
      action: null;
      result: null;
    };

    assert.equal(json.version, '2.0');
    assert.equal(json.reviewSchemaVersion, '1.1.0');
    assert.equal(json.diagnosticsSchemaVersion, '1.0.0');
    assert.equal(json.diagnostics.length >= 1, true);
    assert.equal(typeof json.diagnostics[0].code, 'string');
    assert.equal(typeof json.diagnostics[0].severity, 'string');
    assert.equal(typeof json.diagnostics[0].remediation, 'string');
    assert.equal(json.reviewable.length, 3);
    assert.equal(json.selected.length, 0);
    assert.equal(json.action, null);
    assert.equal(json.result, null);
    assert.equal(json.reviewable[0].availableActions.includes('accept'), true);
    assert.equal(json.reviewable[0].suggestedActions.length >= 1, true);
    assert.equal(typeof json.reviewable[0].suggestedActions[0].confidence, 'string');
    assert.equal(json.reviewable[0].dependencyContext.directDependents.length >= 0, true);
    assert.equal(json.reviewable[0].dependencyContext.transitiveDependents.length >= 0, true);
    assert.equal(
      json.reviewable.some((item) => item.impact.direct.length > 0),
      true,
    );
  });

  stableIt('emits structured JSON action results for accept', async () => {
    await seedBreakingDrift(tmpDir);

    const result = runFerret(tmpDir, ['review', '--json', '--contract', 'auth.jwt', '--action', 'accept']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');

    const json = JSON.parse(result.stdout) as {
      reviewSchemaVersion: string;
      diagnosticsSchemaVersion: string;
      diagnostics: Array<{
        code: string;
        severity: string;
        location: Record<string, unknown>;
        remediation: string;
      }>;
      reviewable: Array<{
        suggestedActions: Array<{ action: string; confidence: string; reason: string }>;
        dependencyContext: {
          directDependents: Array<{ filePath: string; depth: number }>;
          transitiveDependents: Array<{ filePath: string; depth: number }>;
        };
      }>;
      selected: string[];
      action: string;
      result: {
        repoBlocked: boolean;
        clearedContracts: string[];
        blockedContracts: string[];
      };
    };

    assert.equal(json.reviewSchemaVersion, '1.1.0');
    assert.equal(json.diagnosticsSchemaVersion, '1.0.0');
    assert.equal(json.diagnostics.length >= 1, true);
    assert.equal(json.reviewable[0].suggestedActions.length >= 1, true);
    assert.equal(typeof json.reviewable[0].suggestedActions[0].reason, 'string');
    assert.equal(json.reviewable[0].dependencyContext.directDependents.length >= 0, true);
    assert.deepEqual(json.selected, ['auth.jwt']);
    assert.equal(json.action, 'accept');
    assert.equal(json.result.repoBlocked, false);
    assert.equal(json.result.clearedContracts.includes('auth.jwt'), true);
    assert.equal(json.result.blockedContracts.length, 0);
  });
});

async function seedBreakingDrift(tmpDir: string): Promise<void> {
  const authBaseline = `---\nferret:\n  id: auth.jwt\n  type: type\n  status: active\n  shape:\n    type: object\n    properties:\n      sub:\n        type: string\n      exp:\n        type: string\n    required:\n      - sub\n      - exp\n---\n`;
  const searchBaseline = `---\nferret:\n  id: api.GET/search\n  type: api\n  status: active\n  imports:\n    - auth.jwt\n  shape:\n    type: object\n    properties:\n      results:\n        type: array\n---\n`;
  const recommendationsBaseline = `---\nferret:\n  id: api.GET/recommendations\n  type: api\n  status: active\n  imports:\n    - api.GET/search\n  shape:\n    type: object\n    properties:\n      items:\n        type: array\n---\n`;

  fs.mkdirSync(path.join(tmpDir, 'contracts', 'auth'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'search'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'recommendations'), {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'auth', 'jwt.contract.md'),
    authBaseline,
    'utf-8',
  );
  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'search', 'results.contract.md'),
    searchBaseline,
    'utf-8',
  );
  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'recommendations', 'items.contract.md'),
    recommendationsBaseline,
    'utf-8',
  );

  await seedBaselineContracts(tmpDir, [
    {
      contractId: 'auth.jwt',
      filePath: 'contracts/auth/jwt.contract.md',
      fileContent: authBaseline,
      contractType: 'type',
      shapeSchema: {
        type: 'object',
        properties: {
          sub: { type: 'string' },
          exp: { type: 'string' },
        },
        required: ['sub', 'exp'],
      },
    },
    {
      contractId: 'api.GET/search',
      filePath: 'contracts/search/results.contract.md',
      fileContent: searchBaseline,
      contractType: 'api',
      shapeSchema: {
        type: 'object',
        properties: {
          results: { type: 'array' },
        },
      },
      imports: ['auth.jwt'],
    },
    {
      contractId: 'api.GET/recommendations',
      filePath: 'contracts/recommendations/items.contract.md',
      fileContent: recommendationsBaseline,
      contractType: 'api',
      shapeSchema: {
        type: 'object',
        properties: {
          items: { type: 'array' },
        },
      },
      imports: ['api.GET/search'],
    },
  ]);

  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'auth', 'jwt.contract.md'),
    `---\nferret:\n  id: auth.jwt\n  type: type\n  status: active\n  shape:\n    type: object\n    properties:\n      sub:\n        type: string\n    required:\n      - sub\n---\n`,
    'utf-8',
  );
}

async function seedMultipleBreakingDrift(tmpDir: string): Promise<void> {
  const invoiceBaseline = `---\nferret:\n  id: billing.invoice\n  type: type\n  status: active\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n      total:\n        type: number\n    required:\n      - id\n      - total\n---\n`;
  const invoicesBaseline = `---\nferret:\n  id: api.GET/invoices\n  type: api\n  status: active\n  imports:\n    - billing.invoice\n  shape:\n    type: object\n    properties:\n      invoices:\n        type: array\n---\n`;

  await seedBreakingDrift(tmpDir);
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'billing'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'contracts', 'invoices'), { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'billing', 'invoice.contract.md'),
    invoiceBaseline,
    'utf-8',
  );
  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'invoices', 'list.contract.md'),
    invoicesBaseline,
    'utf-8',
  );

  await seedBaselineContracts(tmpDir, [
    {
      contractId: 'billing.invoice',
      filePath: 'contracts/billing/invoice.contract.md',
      fileContent: invoiceBaseline,
      contractType: 'type',
      shapeSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          total: { type: 'number' },
        },
        required: ['id', 'total'],
      },
    },
    {
      contractId: 'api.GET/invoices',
      filePath: 'contracts/invoices/list.contract.md',
      fileContent: invoicesBaseline,
      contractType: 'api',
      shapeSchema: {
        type: 'object',
        properties: {
          invoices: { type: 'array' },
        },
      },
      imports: ['billing.invoice'],
    },
  ]);

  fs.writeFileSync(
    path.join(tmpDir, 'contracts', 'billing', 'invoice.contract.md'),
    `---\nferret:\n  id: billing.invoice\n  type: type\n  status: active\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n    required:\n      - id\n---\n`,
    'utf-8',
  );
}
