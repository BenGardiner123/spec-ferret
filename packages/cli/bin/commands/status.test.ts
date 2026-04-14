import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'bun:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, '../ferret.ts');

function runFerret(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [ferretBin, ...args], {
    cwd,
    encoding: 'utf-8',
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
      if (error?.code !== 'EBUSY' || attempt === 19) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

describe('ferret status — S59 acceptance criteria', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-status-test-'));
    runFerret(tmpDir, ['init', '--no-hook']);
    // Do NOT run scan here — each test controls its own store state.
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt('exits 0 on an empty store', () => {
    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0);
  });

  stableIt('prints "0 contracts" on an empty store', () => {
    // Status without scan: DB is empty (init does not scan)
    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ferret status\s+0 contracts/);
  });

  stableIt('exits 0 on a clean project with stable contracts', () => {
    // Remove init sample so we control exactly what's in the store
    fs.rmSync(path.join(tmpDir, 'contracts', 'example.contract.md'), { force: true });
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'api.contract.md'),
      '---\nferret:\n  id: api.endpoint\n  type: api\n  shape:\n    type: object\n---\n',
      'utf-8',
    );
    runFerret(tmpDir, ['scan']);
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

  stableIt('shows NEEDS REVIEW section when breaking contract exists', () => {
    const contractPath = path.join(tmpDir, 'contracts', 'api.contract.md');
    fs.writeFileSync(
      contractPath,
      '---\nferret:\n  id: api.breaking\n  type: api\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n    required:\n      - id\n---\n',
      'utf-8',
    );
    runFerret(tmpDir, ['scan']);
    // Remove required field — breaking change
    fs.writeFileSync(
      contractPath,
      '---\nferret:\n  id: api.breaking\n  type: api\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n---\n',
      'utf-8',
    );
    runFerret(tmpDir, ['scan', '--force']);
    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /NEEDS REVIEW/);
    assert.match(result.stdout, /api\.breaking/);
  });

  stableIt('--json contracts array contains only needs-review entries', () => {
    const contractPath = path.join(tmpDir, 'contracts', 'api.contract.md');
    fs.writeFileSync(
      contractPath,
      '---\nferret:\n  id: api.breaking\n  type: api\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n    required:\n      - id\n---\n',
      'utf-8',
    );
    runFerret(tmpDir, ['scan']);
    fs.writeFileSync(
      contractPath,
      '---\nferret:\n  id: api.breaking\n  type: api\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n---\n',
      'utf-8',
    );
    runFerret(tmpDir, ['scan', '--force']);
    const result = runFerret(tmpDir, ['status', '--json']);
    assert.equal(result.status, 0);
    const json = JSON.parse(result.stdout) as { needsReview: number; contracts: Array<{ status: string }> };
    assert.equal(json.needsReview, 1);
    assert.ok(
      json.contracts.every((c) => c.status === 'needs-review'),
      'contracts array should only include needs-review entries',
    );
  });

  stableIt('--export writes STATUS.md to project root', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'api.contract.md'),
      '---\nferret:\n  id: api.endpoint\n  type: api\n  shape:\n    type: object\n---\n',
      'utf-8',
    );
    runFerret(tmpDir, ['scan']);
    const result = runFerret(tmpDir, ['status', '--export']);
    assert.equal(result.status, 0);
    const statusMdPath = path.join(tmpDir, 'STATUS.md');
    assert.ok(fs.existsSync(statusMdPath), 'STATUS.md should be created');
    const content = fs.readFileSync(statusMdPath, 'utf-8');
    assert.match(content, /# Contract Status/);
    assert.match(content, /api\.endpoint/);
  });

  stableIt('exits 0 even when contracts need review', () => {
    const contractPath = path.join(tmpDir, 'contracts', 'api.contract.md');
    fs.writeFileSync(
      contractPath,
      '---\nferret:\n  id: api.breaking\n  type: api\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n    required:\n      - id\n---\n',
      'utf-8',
    );
    runFerret(tmpDir, ['scan']);
    fs.writeFileSync(
      contractPath,
      '---\nferret:\n  id: api.breaking\n  type: api\n  shape:\n    type: object\n    properties:\n      id:\n        type: string\n---\n',
      'utf-8',
    );
    runFerret(tmpDir, ['scan', '--force']);
    const result = runFerret(tmpDir, ['status']);
    assert.equal(result.status, 0, 'status must always exit 0');
  });
});
