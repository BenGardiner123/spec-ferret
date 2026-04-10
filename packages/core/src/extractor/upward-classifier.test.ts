import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { classifyUpwardDrift } from './upward-classifier.js';

const FILE = 'src/auth/jwt.ts';
const SYMBOL = 'JwtPayload';
const CONTRACT_ID = 'auth.jwt';

// ─── Canonical declared schema ────────────────────────────────────────────────

const DECLARED_SCHEMA = {
  type: 'object',
  properties: {
    sub: { type: 'string' },
    role: { type: 'string', enum: ['admin', 'user'] },
    exp: { type: 'number' },
  },
  required: ['sub', 'role'],
};

describe('classifyUpwardDrift — S51: BREAKING cases', () => {
  it('required field removed from code shape → BREAKING', () => {
    const codeSchema = {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['admin', 'user'] },
        exp: { type: 'number' },
      },
      required: ['role'],
    };
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, codeSchema, FILE, SYMBOL);
    assert.equal(result.driftClass, 'BREAKING');
    assert.match(result.reason, /required field\(s\) removed: sub/);
    assert.equal(result.contractId, CONTRACT_ID);
    assert.equal(result.sourceFile, FILE);
    assert.equal(result.sourceSymbol, SYMBOL);
  });

  it('field type changed in code → BREAKING', () => {
    const codeSchema = {
      type: 'object',
      properties: {
        sub: { type: 'number' }, // was string
        role: { type: 'string', enum: ['admin', 'user'] },
        exp: { type: 'number' },
      },
      required: ['sub', 'role'],
    };
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, codeSchema, FILE, SYMBOL);
    assert.equal(result.driftClass, 'BREAKING');
    assert.match(result.reason, /type changed/);
  });

  it('required field added in code → BREAKING', () => {
    const codeSchema = {
      type: 'object',
      properties: {
        sub: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'user'] },
        exp: { type: 'number' },
        iat: { type: 'number' },
      },
      required: ['sub', 'role', 'iat'], // iat newly required
    };
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, codeSchema, FILE, SYMBOL);
    assert.equal(result.driftClass, 'BREAKING');
    assert.match(result.reason, /required field\(s\) added: iat/);
  });

  it('property removed entirely from code → BREAKING', () => {
    const codeSchema = {
      type: 'object',
      properties: {
        sub: { type: 'string' },
        exp: { type: 'number' },
        // role removed entirely
      },
      required: ['sub'],
    };
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, codeSchema, FILE, SYMBOL);
    assert.equal(result.driftClass, 'BREAKING');
    assert.match(result.reason, /property 'role' removed|required field\(s\) removed/);
  });

  it('enum value removed from code → BREAKING', () => {
    const codeSchema = {
      type: 'object',
      properties: {
        sub: { type: 'string' },
        role: { type: 'string', enum: ['admin'] }, // 'user' removed
        exp: { type: 'number' },
      },
      required: ['sub', 'role'],
    };
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, codeSchema, FILE, SYMBOL);
    assert.equal(result.driftClass, 'BREAKING');
    assert.match(result.reason, /enum value\(s\) removed/);
  });
});

describe('classifyUpwardDrift — S51: NON_BREAKING cases', () => {
  it('optional field added in code → NON_BREAKING', () => {
    const codeSchema = {
      type: 'object',
      properties: {
        sub: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'user'] },
        exp: { type: 'number' },
        nbf: { type: 'number' }, // new optional field
      },
      required: ['sub', 'role'],
    };
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, codeSchema, FILE, SYMBOL);
    assert.equal(result.driftClass, 'NON_BREAKING');
    assert.match(result.reason, /optional field\(s\) added/);
  });

  it('enum value added to code → NON_BREAKING', () => {
    const codeSchema = {
      type: 'object',
      properties: {
        sub: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'user', 'superuser'] }, // 'superuser' added
        exp: { type: 'number' },
      },
      required: ['sub', 'role'],
    };
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, codeSchema, FILE, SYMBOL);
    assert.equal(result.driftClass, 'NON_BREAKING');
    assert.match(result.reason, /enum value\(s\) added/);
  });
});

describe('classifyUpwardDrift — S51: NOOP cases', () => {
  it('identical schemas → NOOP', () => {
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, DECLARED_SCHEMA, FILE, SYMBOL);
    assert.equal(result.driftClass, 'NOOP');
    assert.match(result.reason, /semantically identical/);
  });

  it('property order change in code does not produce drift (hash-stable)', () => {
    const codeSchema = {
      type: 'object',
      properties: {
        // same properties, different key order
        exp: { type: 'number' },
        role: { type: 'string', enum: ['admin', 'user'] },
        sub: { type: 'string' },
      },
      required: ['role', 'sub'], // reordered required array
    };
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, codeSchema, FILE, SYMBOL);
    assert.equal(result.driftClass, 'NOOP');
  });

  it('empty vs empty schemas → NOOP', () => {
    const result = classifyUpwardDrift(CONTRACT_ID, {}, {}, FILE, SYMBOL);
    assert.equal(result.driftClass, 'NOOP');
  });
});

describe('classifyUpwardDrift — S51: result shape', () => {
  it('result always contains all required fields', () => {
    const result = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, DECLARED_SCHEMA, FILE, SYMBOL);
    assert.ok('contractId' in result);
    assert.ok('driftClass' in result);
    assert.ok('sourceFile' in result);
    assert.ok('sourceSymbol' in result);
    assert.ok('reason' in result);
    assert.equal(typeof result.reason, 'string');
  });

  it('is a pure function — same inputs produce same output', () => {
    const r1 = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, DECLARED_SCHEMA, FILE, SYMBOL);
    const r2 = classifyUpwardDrift(CONTRACT_ID, DECLARED_SCHEMA, DECLARED_SCHEMA, FILE, SYMBOL);
    assert.deepEqual(r1, r2);
  });

  it('does not mutate inputs', () => {
    const declared = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };
    const code = { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] };
    const declaredBefore = JSON.stringify(declared);
    const codeBefore = JSON.stringify(code);
    classifyUpwardDrift(CONTRACT_ID, declared, code, FILE, SYMBOL);
    assert.equal(JSON.stringify(declared), declaredBefore);
    assert.equal(JSON.stringify(code), codeBefore);
  });
});
