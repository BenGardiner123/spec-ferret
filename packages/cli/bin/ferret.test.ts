import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'bun:test';
import pkg from '../package.json' with { type: 'json' };
import { runFerretCli } from './test-utils/run-ferret';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, './ferret.ts');

describe('ferret version', () => {
  it('prints the current CLI package version', () => {
    const result = runFerretCli(ferretBin, ['--version'], {
      timeout: 10_000,
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), pkg.version);
    assert.equal(result.stderr, '');
  });
});
