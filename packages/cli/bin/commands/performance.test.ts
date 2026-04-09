import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'bun:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, '../ferret.ts');

function runFerret(cwd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [ferretBin, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 15_000,
  });
}

function stableIt(name: string, fn: () => void | Promise<void>): void {
  it(name, fn, 20_000);
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

describe('ferret performance guardrails — #27', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-perf-test-'));
    runFerret(tmpDir, ['init', '--no-hook']);
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'users.ts'), `export interface User {\n  id: string;\n  email?: string;\n}\n`, 'utf-8');
    runFerret(tmpDir, ['extract']);
    runFerret(tmpDir, ['scan']);
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt('keeps clean lint runs under the 500ms baseline budget', () => {
    const result = runFerret(tmpDir, ['lint', '--perf-budget-ms', '500']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /0 drift\s+\d+ms/);
  });

  stableIt('fails lint when the performance budget is exceeded', () => {
    const result = runFerret(tmpDir, ['lint', '--perf-budget-ms', '1']);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /performance budget exceeded for lint/i);
  });

  stableIt('records extract runtime in summary output', () => {
    const result = runFerret(tmpDir, ['extract', '--perf-budget-ms', '2000']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /ferret extract/);
    assert.match(result.stdout, /\s\d+ms\s*$/m);
  });

  stableIt('fails extract when the performance budget is exceeded', () => {
    const result = runFerret(tmpDir, ['extract', '--perf-budget-ms', '1']);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /performance budget exceeded for extract/i);
  });
});
