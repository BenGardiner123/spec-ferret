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

describe('ferret watch — command registration', () => {
  stableIt('appears in ferret --help output', () => {
    const result = spawnSync(process.execPath, [ferretBin, '--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    assert.match(result.stdout, /watch/);
  });

  stableIt('ferret watch --help shows description and options', () => {
    const result = spawnSync(process.execPath, [ferretBin, 'watch', '--help'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });
    assert.match(result.stdout, /Watch contract files/);
    assert.match(result.stdout, /--debounce/);
  });
});

describe('ferret watch — core watcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-watch-test-'));
    fs.mkdirSync(path.join(tmpDir, 'contracts'), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt('createContractWatcher returns an object with close()', async () => {
    const { createContractWatcher } = await import('@specferret/core');

    const watcher = createContractWatcher({
      specDir: 'contracts',
      projectRoot: tmpDir,
      debounceMs: 50,
      onChange: () => {},
    });

    assert.ok(typeof watcher.close === 'function', 'watcher should have a close method');
    watcher.close();
  });

  stableIt('close() does not throw when called multiple times', async () => {
    const { createContractWatcher } = await import('@specferret/core');

    const watcher = createContractWatcher({
      specDir: 'contracts',
      projectRoot: tmpDir,
      debounceMs: 50,
      onChange: () => {},
    });

    assert.doesNotThrow(() => {
      watcher.close();
      watcher.close();
    });
  });
});
