import assert from 'node:assert/strict';
import { describe, expect, it, spyOn } from 'bun:test';
import { join } from 'node:path';
import { extractFromContractFile } from './typescript-contract.js';

const fixtures = (name: string) => join(import.meta.dir, '__fixtures__', name);

describe('extractFromContractFile', () => {
  it('single valid export → one contract with correct id, shape, shape_hash, imports', async () => {
    const result = await extractFromContractFile(fixtures('one-contract.fixture.ts'));

    assert.equal(result.contracts.length, 1);
    assert.equal(result.contracts[0].id, 'userContract');
    assert.equal(typeof result.contracts[0].shape, 'object');
    assert.equal(typeof result.contracts[0].shape_hash, 'string');
    assert.equal(result.contracts[0].shape_hash.length, 64);
    assert.deepEqual(result.contracts[0].imports, []);
    assert.equal(result.warning, undefined);
  });

  it('multiple exports — only valid contracts extracted, non-contracts skipped', async () => {
    const result = await extractFromContractFile(fixtures('mixed.fixture.ts'));

    const ids = result.contracts.map((c) => c.id);
    assert.equal(result.contracts.length, 2);
    assert.ok(ids.includes('validContract'));
    assert.ok(ids.includes('anotherValid'));
  });

  it('no ferret contracts → empty contracts array + warning: no-frontmatter', async () => {
    const result = await extractFromContractFile(fixtures('empty.fixture.ts'));

    assert.equal(result.contracts.length, 0);
    assert.equal(result.warning, 'no-frontmatter');
  });

  it('extractedBy is always "typescript"', async () => {
    const a = await extractFromContractFile(fixtures('one-contract.fixture.ts'));
    const b = await extractFromContractFile(fixtures('empty.fixture.ts'));

    assert.equal(a.extractedBy, 'typescript');
    assert.equal(b.extractedBy, 'typescript');
  });

  it('extractedAt is a unix ms timestamp within 1s of Date.now()', async () => {
    const before = Date.now();
    const result = await extractFromContractFile(fixtures('one-contract.fixture.ts'));
    const after = Date.now();

    assert.ok(result.extractedAt >= before - 1000);
    assert.ok(result.extractedAt <= after + 1000);
  });

  it('shape hash is deterministic — two runs on same file produce identical hash', async () => {
    // Clear module cache by using a unique query approach isn't possible cleanly in Bun,
    // but the hash must be stable across calls even with the cached module.
    const r1 = await extractFromContractFile(fixtures('one-contract.fixture.ts'));
    const r2 = await extractFromContractFile(fixtures('one-contract.fixture.ts'));

    assert.equal(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });

  it('zod schema with optional fields extracts without throwing', async () => {
    await assert.doesNotReject(() =>
      extractFromContractFile(fixtures('optional-fields.fixture.ts')),
    );

    const result = await extractFromContractFile(fixtures('optional-fields.fixture.ts'));
    assert.equal(result.contracts.length, 1);
    assert.equal(result.contracts[0].id, 'optionalFieldsContract');
  });

  it('same-file consumes reference resolves to the correct export name', async () => {
    const result = await extractFromContractFile(fixtures('same-file-consumes.fixture.ts'));

    const dependent = result.contracts.find((c) => c.id === 'dependentContract');
    assert.ok(dependent, 'dependentContract not found in result');
    assert.deepEqual(dependent.imports, ['baseContract']);
  });

  it('cross-file reference with explicit id resolves to c.id', async () => {
    const result = await extractFromContractFile(fixtures('cross-file-id.fixture.ts'));

    assert.equal(result.contracts.length, 1);
    assert.deepEqual(result.contracts[0].imports, ['external.known.id']);
  });

  it('cross-file reference without id emits exactly one warning and returns [unresolved]', async () => {
    const spy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = await extractFromContractFile(fixtures('cross-file-unresolved.fixture.ts'));

      expect(spy.mock.calls.length).toBe(1);
      assert.deepEqual(result.contracts[0].imports, ['[unresolved]']);
    } finally {
      spy.mockRestore();
    }
  });

  it('three contracts each with unresolvable cross-file ref → three warnings emitted', async () => {
    const spy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const result = await extractFromContractFile(fixtures('three-unresolved.fixture.ts'));

      expect(spy.mock.calls.length).toBe(3);
      assert.equal(result.contracts.length, 3);
      result.contracts.forEach((c) => {
        assert.deepEqual(c.imports, ['[unresolved]']);
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('filePath is set correctly in the result', async () => {
    const path = fixtures('one-contract.fixture.ts');
    const result = await extractFromContractFile(path);

    assert.equal(result.filePath, path);
    assert.equal(result.fileType, 'spec');
  });
});
