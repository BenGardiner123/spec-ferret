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
    timeout: 15_000,
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

function seedBreakingDrift(dir: string): void {
  const contractsDir = path.join(dir, 'contracts');
  const contractFile = path.join(contractsDir, 'auth.contract.md');
  // First scan with initial shape
  fs.writeFileSync(
    contractFile,
    [
      '---',
      'ferret:',
      '  id: auth.jwt',
      '  type: api',
      '  shape:',
      '    type: object',
      '    properties:',
      '      token:',
      '        type: string',
      '    required:',
      '      - token',
      '---',
      '',
    ].join('\n'),
  );
  runFerret(dir, ['scan']);

  // Introduce breaking change (remove required field, add new one)
  fs.writeFileSync(
    contractFile,
    [
      '---',
      'ferret:',
      '  id: auth.jwt',
      '  type: api',
      '  shape:',
      '    type: object',
      '    properties:',
      '      session:',
      '        type: string',
      '    required:',
      '      - session',
      '---',
      '',
    ].join('\n'),
  );
  runFerret(dir, ['scan', '--force']);
}

describe('ferret audit — command registration', () => {
  stableIt('appears in ferret --help output', () => {
    const result = spawnSync(process.execPath, [ferretBin, '--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    assert.match(result.stdout, /audit/);
  });

  stableIt('ferret audit --help shows description and options', () => {
    const result = spawnSync(process.execPath, [ferretBin, 'audit', '--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    assert.match(result.stdout, /Bidirectional drift report/);
    assert.match(result.stdout, /--json/);
  });
});

describe('ferret audit — clean project', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-audit-test-'));
    runFerret(tmpDir, ['init', '--no-hook']);
    runFerret(tmpDir, ['scan']);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt('exits 0 on a clean project', () => {
    const result = runFerret(tmpDir, ['audit']);
    assert.equal(result.status, 0);
  });

  stableIt('shows healthy check mark on clean project', () => {
    const result = runFerret(tmpDir, ['audit']);
    assert.match(result.stdout, /ferret audit/);
    assert.match(result.stdout, /0 breaking\s+0 non-breaking\s+0 integrity/);
  });

  stableIt('--json outputs valid JSON with required fields', () => {
    const result = runFerret(tmpDir, ['audit', '--json']);
    assert.equal(result.status, 0);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.ok('version' in json, 'missing version');
    assert.ok('timestamp' in json, 'missing timestamp');
    assert.ok('summary' in json, 'missing summary');
    assert.ok('downwardDrift' in json, 'missing downwardDrift');
    assert.ok('upwardDrift' in json, 'missing upwardDrift');
    assert.ok('integrityViolations' in json, 'missing integrityViolations');
    assert.ok('statusReport' in json, 'missing statusReport');
  });

  stableIt('--json summary shows zero drift on clean project', () => {
    const result = runFerret(tmpDir, ['audit', '--json']);
    const json = JSON.parse(result.stdout) as { summary: Record<string, number> };
    assert.equal(json.summary.downwardBreaking, 0);
    assert.equal(json.summary.downwardNonBreaking, 0);
    assert.equal(json.summary.upwardBreaking, 0);
    assert.equal(json.summary.upwardNonBreaking, 0);
    assert.equal(json.summary.integrityViolationCount, 0);
  });
});

describe('ferret audit — with drift', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-audit-drift-'));
    runFerret(tmpDir, ['init', '--no-hook']);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt(
    'exits 0 even when drift is detected (read-only)',
    () => {
      seedBreakingDrift(tmpDir);
      const result = runFerret(tmpDir, ['audit']);
      assert.equal(result.status, 0, `expected exit 0 but got ${result.status}. stderr: ${result.stderr}`);
    },
    30_000,
  );

  stableIt(
    '--json reports breaking drift in summary',
    () => {
      seedBreakingDrift(tmpDir);
      const result = runFerret(tmpDir, ['audit', '--json']);
      assert.equal(result.status, 0);
      const json = JSON.parse(result.stdout) as { summary: Record<string, number> };
      assert.ok(json.summary.needsReview > 0, 'should show contracts needing review');
    },
    30_000,
  );
});
