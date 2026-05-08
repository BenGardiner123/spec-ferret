import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'bun:test';
import { SqliteStore } from '@specferret/core';
import { runFerretCli } from '../test-utils/run-ferret';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, '../ferret.ts');

function runFerret(cwd: string, args: string[]): ReturnType<typeof runFerretCli> {
  return runFerretCli(ferretBin, args, {
    cwd,
    timeout: 240_000,
  });
}

function stableIt(name: string, fn: () => void | Promise<void>, timeout = 240_000): void {
  it(name, fn, timeout);
}

async function cleanupTmpDir(tmpDir: string): Promise<void> {
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
}

async function initializeStatusProject(tmpDir: string): Promise<void> {
  fs.mkdirSync(path.join(tmpDir, '.ferret'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'contracts'), { recursive: true });

  const store = new SqliteStore(path.join(tmpDir, '.ferret', 'graph.db'));
  try {
    await store.init();
  } finally {
    await store.close();
  }
}

async function seedContract(
  tmpDir: string,
  {
    contractId,
    status,
    filePath = 'contracts/api.contract.md',
  }: { contractId: string; status: 'stable' | 'pending' | 'needs-review'; filePath?: string },
): Promise<void> {
  const store = new SqliteStore(path.join(tmpDir, '.ferret', 'graph.db'));

  try {
    await store.init();

    const nodeId = randomUUID();
    await store.upsertNode({
      id: nodeId,
      file_path: filePath,
      hash: 'status-test-hash',
      status: 'needs-review',
    });

    await store.upsertContract({
      id: contractId,
      node_id: nodeId,
      shape_hash: 'status-test-shape-hash',
      shape_schema: JSON.stringify({
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      }),
      type: 'api',
      status,
    });
  } finally {
    await store.close();
  }
}

describe('ferret status — S59 acceptance criteria', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-status-test-'));
    await initializeStatusProject(tmpDir);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt('exits 0 and prints "0 contracts" on an empty store', () => {
    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ferret status\s+0 contracts/);
  });

  stableIt('fresh scan without status field shows contract as pending', async () => {
    await seedContract(tmpDir, { contractId: 'api.endpoint', status: 'pending' });
    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /pending\s+1/);
  });

  stableIt('contract with status: active shows as stable after scan', async () => {
    await seedContract(tmpDir, { contractId: 'api.endpoint', status: 'stable' });
    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /stable\s+1/);
  });

  stableIt('--json outputs valid JSON with required fields', () => {
    const result = runFerret(tmpDir, ['status', '--json']);
    assert.equal(result.status, 0);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.ok('version' in json, 'missing version');
    assert.ok('timestamp' in json, 'missing timestamp');
    assert.ok('total' in json, 'missing total');
    assert.ok('stable' in json, 'missing stable');
    assert.ok('pending' in json, 'missing pending');
    assert.ok('needsReview' in json, 'missing needsReview');
    assert.ok('contracts' in json, 'missing contracts');
  });

  stableIt('--json exits 0 even with no contracts', () => {
    // No scan — DB is empty
    const result = runFerret(tmpDir, ['status', '--json']);
    assert.equal(result.status, 0);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(json.total, 0);
    assert.equal(json.needsReview, 0);
    assert.deepEqual(json.contracts, []);
  });

  stableIt('shows NEEDS REVIEW section when breaking contract exists', async () => {
    await seedContract(tmpDir, { contractId: 'api.breaking', status: 'needs-review' });

    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /NEEDS REVIEW/);
    assert.match(result.stdout, /api\.breaking/);
  });

  stableIt('--json contracts array contains only needs-review entries', async () => {
    await seedContract(tmpDir, { contractId: 'api.breaking', status: 'needs-review' });

    const result = runFerret(tmpDir, ['status', '--json']);
    assert.equal(result.status, 0);
    const json = JSON.parse(result.stdout) as { needsReview: number; contracts: Array<{ status: string }> };
    assert.equal(json.needsReview, 1);
    assert.ok(
      json.contracts.every((c) => c.status === 'needs-review'),
      'contracts array should only include needs-review entries',
    );
  });

  stableIt('--export writes STATUS.md to project root', async () => {
    await seedContract(tmpDir, { contractId: 'api.endpoint', status: 'pending' });
    const result = runFerret(tmpDir, ['status', '--export']);
    assert.equal(result.status, 0);
    const statusMdPath = path.join(tmpDir, 'STATUS.md');
    assert.ok(fs.existsSync(statusMdPath), 'STATUS.md should be created');
    const content = fs.readFileSync(statusMdPath, 'utf-8');
    assert.match(content, /# Contract Status/);
    assert.match(content, /api\.endpoint/);
  });

  stableIt('exits 0 even when contracts need review', async () => {
    await seedContract(tmpDir, { contractId: 'api.breaking', status: 'needs-review' });

    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0, 'status must always exit 0');
  });
});
