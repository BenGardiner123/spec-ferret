import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'bun:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, '../ferret.ts');

function runInit(cwd: string, args: string[] = []): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [ferretBin, 'init', ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 10_000,
  });
}

// Known flake: spawnSync child process can exceed bun's default 5s test
// timeout under load, especially on Windows CI.  Bump to 15s per-test.
describe('ferret init hook behavior — S25 acceptance criteria', () => {
  let tmpDir: string;
  const TEST_TIMEOUT = 15_000;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-init-hook-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it(
    'installs pre-commit hook by default when .git/hooks exists',
    () => {
      fs.mkdirSync(path.join(tmpDir, '.git', 'hooks'), { recursive: true });

      const result = runInit(tmpDir);

      assert.equal(result.status, 0);
      const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
      assert.ok(fs.existsSync(hookPath), 'expected pre-commit hook to be installed');
      const hookContent = fs.readFileSync(hookPath, 'utf-8');
      assert.ok(hookContent.includes('ferret lint --changed'), 'expected hook to run ferret lint --changed');
      assert.ok(result.stdout.includes('.git/hooks/pre-commit installed'), `expected install message, got: ${result.stdout}`);
    },
    TEST_TIMEOUT,
  );

  it(
    '--no-hook does not install a pre-commit hook',
    () => {
      fs.mkdirSync(path.join(tmpDir, '.git', 'hooks'), { recursive: true });

      const result = runInit(tmpDir, ['--no-hook']);

      assert.equal(result.status, 0);
      const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
      assert.equal(fs.existsSync(hookPath), false);
    },
    TEST_TIMEOUT,
  );

  it(
    'does not overwrite an existing pre-commit hook',
    () => {
      const hooksDir = path.join(tmpDir, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const hookPath = path.join(hooksDir, 'pre-commit');
      const sentinel = '#!/bin/sh\necho existing-hook\n';
      fs.writeFileSync(hookPath, sentinel, 'utf-8');

      const result = runInit(tmpDir);

      assert.equal(result.status, 0);
      const hookContent = fs.readFileSync(hookPath, 'utf-8');
      assert.equal(hookContent, sentinel);
      assert.ok(result.stdout.includes('skipped (already exists)'), `expected skip-existing message, got: ${result.stdout}`);
    },
    TEST_TIMEOUT,
  );

  it(
    'prints warning status and continues when .git/hooks is unavailable',
    () => {
      const result = runInit(tmpDir);

      assert.equal(result.status, 0);
      assert.ok(result.stdout.includes('skipped (.git/hooks unavailable)'), `expected unavailable message, got: ${result.stdout}`);
    },
    TEST_TIMEOUT,
  );

  it(
    'is deterministic in non-interactive mode (no prompt text appears)',
    () => {
      fs.mkdirSync(path.join(tmpDir, '.git', 'hooks'), { recursive: true });

      const result = runInit(tmpDir);

      assert.equal(result.status, 0);
      assert.equal(result.stdout.includes('Install pre-commit hook?'), false);
      assert.equal(result.stderr, '');
    },
    TEST_TIMEOUT,
  );
});
