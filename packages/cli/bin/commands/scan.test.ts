import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'bun:test';
import { runFerretCli } from '../test-utils/run-ferret';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, '../ferret.ts');

function runFerret(cwd: string, args: string[]): SpawnSyncReturns<string> {
  return runFerretCli(ferretBin, args, {
    cwd,
    timeout: 240_000,
  });
}

function stableIt(name: string, fn: () => void | Promise<void>, timeout = 180_000): void {
  it(name, fn, timeout);
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

describe('ferret scan — S57 .contract.ts discovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-scan-ts-'));
    runFerret(tmpDir, ['init', '--no-hook']);
    fs.mkdirSync(path.join(tmpDir, 'contracts'), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt('discovers and processes both .contract.md and .contract.ts in the same scan', () => {
    // .contract.md — standard gray-matter contract
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'search.contract.md'),
      `---\nferret:\n  id: api.search\n  type: api\n  shape:\n    type: object\n---\n`,
      'utf-8',
    );

    // .contract.ts — output: {} is a plain empty schema-definition map; z.object({}) accepts it
    // as a valid empty Zod object schema, so extraction succeeds with no fields.
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'auth.contract.ts'),
      `export const authContract = {\n  value: 'JWT authentication contract',\n  output: {},\n};\n`,
      'utf-8',
    );

    const result = runFerret(tmpDir, ['scan']);

    assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stdout, /3 files scanned/);
    assert.match(result.stdout, /3 contracts updated/);

    // Verify context.json contains both contracts
    const contextPath = path.join(tmpDir, '.ferret', 'context.json');
    assert.ok(fs.existsSync(contextPath), 'context.json was not written');
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
    const ids = context.contracts.map((c: { id: string }) => c.id);
    assert.ok(ids.includes('api.search'), `api.search not in context: ${JSON.stringify(ids)}`);
    assert.ok(ids.includes('authContract'), `authContract not in context: ${JSON.stringify(ids)}`);
  });

  stableIt('.contract.ts with no valid exports emits a warning and is skipped without crashing', () => {
    fs.writeFileSync(path.join(tmpDir, 'contracts', 'empty.contract.ts'), `export const version = '1.0.0';\n`, 'utf-8');

    const result = runFerret(tmpDir, ['scan']);

    assert.equal(result.status, 0, `scan crashed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(result.stderr, /no ferret frontmatter — skipped/);
  });

  stableIt('opt-out via contractParsers.typescript=false skips .contract.ts discovery', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'search.contract.md'),
      `---\nferret:\n  id: api.search\n  type: api\n  shape:\n    type: object\n---\n`,
      'utf-8',
    );
    fs.writeFileSync(path.join(tmpDir, 'contracts', 'auth.contract.ts'), `export const authContract = { value: 'auth', output: {} };\n`, 'utf-8');

    // Write config with typescript discovery disabled
    const configPath = path.join(tmpDir, 'ferret.config.json');
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    existing.contractParsers = { typescript: false };
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8');

    const result = runFerret(tmpDir, ['scan']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /2 files scanned/);

    const contextPath = path.join(tmpDir, '.ferret', 'context.json');
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
    const ids = context.contracts.map((c: { id: string }) => c.id);
    assert.ok(ids.includes('api.search'));
    assert.ok(!ids.includes('authContract'), 'authContract should not be present when typescript=false');
  });
});

describe('ferret scan — #31 error handling', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-scan-errors-'));
    runFerret(tmpDir, ['init', '--no-hook']);
    fs.mkdirSync(path.join(tmpDir, 'contracts'), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt('fails fast on malformed frontmatter by default', () => {
    fs.writeFileSync(path.join(tmpDir, 'contracts', 'bad.contract.md'), `---\nferret:\n  id: api.bad\n  type: api\n---\n`, 'utf-8');

    const result = runFerret(tmpDir, ['scan']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /scan failed for contracts[\\/]bad\.contract\.md/);
    assert.match(result.stderr, /Missing required frontmatter fields/i);
    // Diagnostic must appear exactly once — no double-write
    assert.equal((result.stderr.match(/scan failed for/g) ?? []).length, 1, 'diagnostic should appear exactly once on stderr');
    // Prefix must not be doubled
    assert.doesNotMatch(result.stderr, /ferret: ferret:/);
  });

  stableIt('fails fast on YAML parser errors by default', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'broken-yaml.contract.md'),
      `---\nferret:\n  id: api.broken\n  type: api\n  shape:\n    type: object\n    properties:\n      bad: [unclosed\n---\n`,
      'utf-8',
    );

    const result = runFerret(tmpDir, ['scan']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /scan failed for contracts[\\/]broken-yaml\.contract\.md/);
    assert.match(result.stderr, /YAML|end of the stream|missed comma|unexpected/i);
    assert.doesNotMatch(result.stderr, /ferret: ferret:/);
  });

  stableIt('allows explicit partial success with --allow-partial-success', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'good.contract.md'),
      `---\nferret:\n  id: api.good\n  type: api\n  shape:\n    type: object\n---\n`,
      'utf-8',
    );
    fs.writeFileSync(path.join(tmpDir, 'contracts', 'bad.contract.md'), `---\nferret:\n  id: api.bad\n  type: api\n---\n`, 'utf-8');

    const result = runFerret(tmpDir, ['scan', '--allow-partial-success']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /1 failed\./);
    assert.match(result.stderr, /--allow-partial-success/);
    assert.match(result.stderr, /scan failed for contracts[\\/]bad\.contract\.md/);
  });
});

describe('ferret scan — auto-inference of stable status from source', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-scan-status-'));
    runFerret(tmpDir, ['init', '--no-hook']);
    fs.mkdirSync(path.join(tmpDir, 'contracts'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt(
    'source resolves clean → contract auto-promoted to stable',
    () => {
      // Implementation file in src/ (outside specDir so it is not scanned as a contract)
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'impl.contract.ts'),
        `export const implContract = { value: 'Implementation', output: {} };\n`,
        'utf-8',
      );

      // Contract with an empty declared shape pointing to the impl above
      fs.writeFileSync(
        path.join(tmpDir, 'contracts', 'main.contract.md'),
        [
          '---',
          'ferret:',
          '  id: api.main',
          '  type: api',
          '  shape: {}',
          '  source:',
          '    file: src/impl.contract.ts',
          '    symbol: implContract',
          '---',
          '',
        ].join('\n'),
        'utf-8',
      );

      const result = runFerret(tmpDir, ['scan']);
      assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

      const context = JSON.parse(fs.readFileSync(path.join(tmpDir, '.ferret', 'context.json'), 'utf-8')) as {
        contracts: Array<{ id: string; status: string }>;
      };
      const contract = context.contracts.find((c) => c.id === 'api.main');
      assert.ok(contract, 'api.main not found in context.json');
      assert.equal(contract.status, 'stable', `expected stable but got ${contract.status}`);
    },
    240_000,
  );

  stableIt(
    'source shape mismatches declared → contract stays pending',
    () => {
      // Implementation has an empty shape — does not match the declared required field
      fs.writeFileSync(path.join(tmpDir, 'src', 'impl2.contract.ts'), `export const impl2Contract = { value: 'Impl', output: {} };\n`, 'utf-8');

      // Contract declares a required field the impl does not have → breaking upward drift → stays pending
      fs.writeFileSync(
        path.join(tmpDir, 'contracts', 'mismatch.contract.md'),
        [
          '---',
          'ferret:',
          '  id: api.mismatch',
          '  type: api',
          '  shape:',
          '    type: object',
          '    properties:',
          '      name:',
          '        type: string',
          '    required:',
          '      - name',
          '  source:',
          '    file: src/impl2.contract.ts',
          '    symbol: impl2Contract',
          '---',
          '',
        ].join('\n'),
        'utf-8',
      );

      const result = runFerret(tmpDir, ['scan']);
      assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

      const context = JSON.parse(fs.readFileSync(path.join(tmpDir, '.ferret', 'context.json'), 'utf-8')) as {
        contracts: Array<{ id: string; status: string }>;
      };
      const contract = context.contracts.find((c) => c.id === 'api.mismatch');
      assert.ok(contract, 'api.mismatch not found in context.json');
      assert.equal(contract.status, 'pending', `expected pending but got ${contract.status}`);
    },
    240_000,
  );

  stableIt(
    'no source field → contract stays pending (regression guard)',
    () => {
      fs.writeFileSync(
        path.join(tmpDir, 'contracts', 'nosource.contract.md'),
        ['---', 'ferret:', '  id: api.nosource', '  type: api', '  shape: {}', '---', ''].join('\n'),
        'utf-8',
      );

      const result = runFerret(tmpDir, ['scan']);
      assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

      const context = JSON.parse(fs.readFileSync(path.join(tmpDir, '.ferret', 'context.json'), 'utf-8')) as {
        contracts: Array<{ id: string; status: string }>;
      };
      const contract = context.contracts.find((c) => c.id === 'api.nosource');
      assert.ok(contract, 'api.nosource not found in context.json');
      assert.equal(contract.status, 'pending', `expected pending but got ${contract.status}`);
    },
    240_000,
  );

  stableIt(
    '.contract.ts without explicit source stays pending (self-reference guard)',
    () => {
      // A .contract.ts without an explicit source.file has sourceFile default to the file
      // itself. The guard normalizedSourceFile !== relFile must block promotion so that
      // no contract ever auto-promotes by comparing its shape against itself.
      fs.writeFileSync(path.join(tmpDir, 'contracts', 'self.contract.ts'), `export const selfContract = { value: 'Self', output: {} };\n`, 'utf-8');

      const result = runFerret(tmpDir, ['scan']);
      assert.equal(result.status, 0, `scan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

      const context = JSON.parse(fs.readFileSync(path.join(tmpDir, '.ferret', 'context.json'), 'utf-8')) as {
        contracts: Array<{ id: string; status: string }>;
      };
      const contract = context.contracts.find((c) => c.id === 'selfContract');
      assert.ok(contract, 'selfContract not found in context.json');
      assert.equal(contract.status, 'pending', `expected pending but got ${contract.status}`);
    },
    240_000,
  );
});

describe('ferret scan — stale node pruning on full scan', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-scan-prune-'));
    runFerret(tmpDir, ['init', '--no-hook']);
    fs.mkdirSync(path.join(tmpDir, 'contracts'), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
  });

  stableIt(
    'deleted contract file is removed from context.json on next full scan',
    () => {
      // Write and scan a contract so it lands in the graph
      fs.writeFileSync(
        path.join(tmpDir, 'contracts', 'to-delete.contract.md'),
        `---\nferret:\n  id: api.to-delete\n  type: api\n  shape:\n    type: object\n---\n`,
        'utf-8',
      );

      const first = runFerret(tmpDir, ['scan']);
      assert.equal(first.status, 0, `first scan failed:\n${first.stderr}`);

      const contextAfterFirst = JSON.parse(fs.readFileSync(path.join(tmpDir, '.ferret', 'context.json'), 'utf-8')) as {
        contracts: Array<{ id: string }>;
      };
      assert.ok(
        contextAfterFirst.contracts.some((c) => c.id === 'api.to-delete'),
        'api.to-delete should be present after first scan',
      );

      // Delete the contract file
      fs.unlinkSync(path.join(tmpDir, 'contracts', 'to-delete.contract.md'));

      // Second full scan — prune should fire
      const second = runFerret(tmpDir, ['scan']);
      assert.equal(second.status, 0, `second scan failed:\n${second.stderr}`);
      assert.match(second.stderr, /pruned 1 stale node/, 'expected prune warning on stderr');

      const contextAfterSecond = JSON.parse(fs.readFileSync(path.join(tmpDir, '.ferret', 'context.json'), 'utf-8')) as {
        contracts: Array<{ id: string }>;
      };
      assert.ok(!contextAfterSecond.contracts.some((c) => c.id === 'api.to-delete'), 'api.to-delete should be absent after second scan');
    },
    240_000,
  );

  stableIt('partial scan (--changed) does not prune contracts for files not in the scan set', () => {
    // Write two contracts and full-scan them both into the graph
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'keeper.contract.md'),
      `---\nferret:\n  id: api.keeper\n  type: api\n  shape:\n    type: object\n---\n`,
      'utf-8',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'other.contract.md'),
      `---\nferret:\n  id: api.other\n  type: api\n  shape:\n    type: object\n---\n`,
      'utf-8',
    );

    const first = runFerret(tmpDir, ['scan']);
    assert.equal(first.status, 0, `first scan failed:\n${first.stderr}`);

    // Partial scan with an explicit file — should not prune api.other
    const partial = runFerret(tmpDir, ['scan', 'contracts/keeper.contract.md']);
    assert.equal(partial.status, 0, `partial scan failed:\n${partial.stderr}`);
    assert.doesNotMatch(partial.stderr, /pruned/, 'partial scan must not prune');

    const context = JSON.parse(fs.readFileSync(path.join(tmpDir, '.ferret', 'context.json'), 'utf-8')) as { contracts: Array<{ id: string }> };
    assert.ok(
      context.contracts.some((c) => c.id === 'api.other'),
      'api.other must survive a partial scan',
    );
  });

  stableIt('deleting provider contract surfaces as unresolved import on next lint', () => {
    // Provider contract
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'provider.contract.md'),
      `---\nferret:\n  id: api.provider\n  type: api\n  shape:\n    type: object\n---\n`,
      'utf-8',
    );
    // Consumer contract that imports the provider
    fs.writeFileSync(
      path.join(tmpDir, 'contracts', 'consumer.contract.md'),
      `---\nferret:\n  id: api.consumer\n  type: api\n  shape:\n    type: object\n  imports:\n    - api.provider\n---\n`,
      'utf-8',
    );

    const first = runFerret(tmpDir, ['scan']);
    assert.equal(first.status, 0, `first scan failed:\n${first.stderr}`);

    // Delete the provider
    fs.unlinkSync(path.join(tmpDir, 'contracts', 'provider.contract.md'));

    // Second full scan prunes the provider node
    const second = runFerret(tmpDir, ['scan']);
    assert.equal(second.status, 0, `second scan failed:\n${second.stderr}`);
    assert.match(second.stderr, /pruned 1 stale node/);

    // Lint should report an unresolved import (consumer still imports the gone provider)
    const lint = runFerret(tmpDir, ['lint']);
    assert.notEqual(lint.status, 0, 'lint should be non-zero when a provider is missing');
    assert.match(lint.stdout, /import integrity violations/, 'lint should report unresolved import for the deleted provider');
  });
});
