import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { buildAuditReport } from './index.js';
import { SqliteStore } from '../store/sqlite.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-audit-test-'));
}

describe('buildAuditReport — S63 source field upward drift', () => {
  it('matching src type → no upward drift', async () => {
    const tmpDir = makeTmpDir();
    try {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'handler.ts'), `export interface HandlerResponse {\n  name: string;\n}\n`, 'utf-8');

      const store = new SqliteStore(':memory:');
      await store.init();

      const nodeId = randomUUID();
      await store.upsertNode({
        id: nodeId,
        file_path: 'contracts/handler.contract.ts',
        hash: randomUUID(),
        status: 'stable',
      });

      await store.upsertContract({
        id: 'api.handler',
        node_id: nodeId,
        shape_hash: 'abc',
        shape_schema: JSON.stringify({
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        }),
        type: 'type',
        status: 'stable',
        code_source_file: 'src/handler.ts',
        code_source_symbol: 'HandlerResponse',
      });

      const report = await buildAuditReport(store, tmpDir);
      assert.equal(report.upwardDrift.length, 0, 'expected no upward drift when src matches declared schema');

      await store.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('diverged src type (extra required field) → BREAKING upward drift', async () => {
    const tmpDir = makeTmpDir();
    try {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      // src has an extra required field not in the declared schema
      fs.writeFileSync(path.join(srcDir, 'handler.ts'), `export interface HandlerResponse {\n  name: string;\n  email: string;\n}\n`, 'utf-8');

      const store = new SqliteStore(':memory:');
      await store.init();

      const nodeId = randomUUID();
      await store.upsertNode({
        id: nodeId,
        file_path: 'contracts/handler.contract.ts',
        hash: randomUUID(),
        status: 'stable',
      });

      await store.upsertContract({
        id: 'api.handler',
        node_id: nodeId,
        shape_hash: 'abc',
        shape_schema: JSON.stringify({
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        }),
        type: 'type',
        status: 'stable',
        code_source_file: 'src/handler.ts',
        code_source_symbol: 'HandlerResponse',
      });

      const report = await buildAuditReport(store, tmpDir);
      assert.equal(report.upwardDrift.length, 1, 'expected 1 upward drift item');
      assert.equal(report.upwardDrift[0].contractId, 'api.handler');
      assert.equal(report.upwardDrift[0].driftClass, 'BREAKING');

      await store.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('no source fields → no upward drift (behaviour identical to today)', async () => {
    const store = new SqliteStore(':memory:');
    await store.init();

    const nodeId = randomUUID();
    await store.upsertNode({
      id: nodeId,
      file_path: 'contracts/handler.contract.ts',
      hash: randomUUID(),
      status: 'stable',
    });

    await store.upsertContract({
      id: 'api.handler',
      node_id: nodeId,
      shape_hash: 'abc',
      shape_schema: JSON.stringify({ type: 'object' }),
      type: 'type',
      status: 'stable',
      // no code_source_file or code_source_symbol
    });

    const report = await buildAuditReport(store, process.cwd());
    assert.equal(report.upwardDrift.length, 0, 'contracts without source fields must not produce upward drift');

    await store.close();
  });
});
