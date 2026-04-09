import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { validateFerretSchema, compareSchemas, validateContractType } from './validator.js';
import { CONTRACT_TYPES } from './contract-types.js';

// ─── validateFerretSchema ────────────────────────────────────────────────────

describe('validateFerretSchema', () => {
  it('warns on every unsupported keyword when present', () => {
    const UNSUPPORTED = ['$ref', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', '$defs', 'definitions', 'patternProperties', 'dependencies'];

    for (const keyword of UNSUPPORTED) {
      const shape = { type: 'object', [keyword]: {} };
      const result = validateFerretSchema(shape, 'contracts/test.contract.md');
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], new RegExp(keyword.replace('$', '\\$')));
      assert.match(result.warnings[0], /contracts\/test\.contract\.md/);
      assert.equal(result.valid, true);
    }
  });

  it('does not warn on valid supported keywords', () => {
    const shape = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        score: { type: 'number' },
        active: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['pending', 'active', 'cancelled'] },
      },
      required: ['id', 'name'],
      additionalProperties: false,
    };
    const result = validateFerretSchema(shape, 'contracts/valid.contract.md');
    assert.equal(result.warnings.length, 0);
    assert.equal(result.valid, true);
  });

  it('warns on multiple unsupported keywords in a single schema', () => {
    const shape = {
      type: 'object',
      allOf: [{}],
      anyOf: [{}],
      $ref: '#/definitions/Foo',
    };
    const result = validateFerretSchema(shape, 'contracts/complex.contract.md');
    assert.ok(result.warnings.length >= 3);
    assert.equal(result.valid, true);
  });

  it('does not warn on null or primitive shape', () => {
    assert.equal(validateFerretSchema(null, 'f.md').warnings.length, 0);
    assert.equal(validateFerretSchema('string shape', 'f.md').warnings.length, 0);
    assert.equal(validateFerretSchema(42, 'f.md').warnings.length, 0);
  });
});

describe('validateContractType', () => {
  it('accepts all six supported contract types', () => {
    for (const contractType of CONTRACT_TYPES) {
      const result = validateContractType(contractType, 'contracts/test.contract.md');
      assert.equal(result.valid, true);
      if (result.valid) {
        assert.equal(result.value, contractType);
      }
    }
  });

  it('rejects unknown contract types and lists allowed values', () => {
    const result = validateContractType('service', 'contracts/test.contract.md');
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /Invalid contract type 'service'/);
    assert.match(result.error ?? '', /Allowed types: api, table, type, event, flow, config/);
  });

  it('keeps shared constants aligned with expected six core types', () => {
    assert.deepEqual(CONTRACT_TYPES, ['api', 'table', 'type', 'event', 'flow', 'config']);
  });
});

// ─── compareSchemas ──────────────────────────────────────────────────────────

describe('compareSchemas — breaking changes', () => {
  it('required field removed → breaking', () => {
    const prev = {
      type: 'object',
      properties: { id: { type: 'string' }, email: { type: 'string' } },
      required: ['id', 'email'],
    };
    const curr = {
      type: 'object',
      properties: { id: { type: 'string' }, email: { type: 'string' } },
      required: ['id'],
    };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'breaking');
    assert.match(result.reason, /email/);
  });

  it('field type changed → breaking', () => {
    const prev = { type: 'object', properties: { count: { type: 'string' } } };
    const curr = { type: 'object', properties: { count: { type: 'integer' } } };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'breaking');
  });

  it('required field added → breaking', () => {
    const prev = {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id'],
    };
    const curr = {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'],
    };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'breaking');
    assert.match(result.reason, /name/);
  });

  it('enum value removed → breaking', () => {
    const prev = { type: 'string', enum: ['pending', 'active', 'cancelled'] };
    const curr = { type: 'string', enum: ['pending', 'active'] };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'breaking');
    assert.match(result.reason, /cancelled/);
  });

  it('response type changed → breaking', () => {
    const prev = { response: { type: 'array', items: { type: 'string' } } };
    const curr = { response: { type: 'object', properties: {} } };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'breaking');
  });

  it('property removed → breaking', () => {
    const prev = {
      type: 'object',
      properties: { id: { type: 'string' }, secret: { type: 'string' } },
      required: ['id'],
    };
    const curr = {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'breaking');
    assert.match(result.reason, /secret/);
  });
});

describe('compareSchemas — non-breaking changes', () => {
  it('optional field added → non-breaking', () => {
    const prev = {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    };
    const curr = {
      type: 'object',
      properties: { id: { type: 'string' }, description: { type: 'string' } },
      required: ['id'],
    };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'non-breaking');
    assert.match(result.reason, /description/);
  });

  it('enum value added → non-breaking', () => {
    const prev = { type: 'string', enum: ['pending', 'active'] };
    const curr = { type: 'string', enum: ['pending', 'active', 'cancelled'] };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'non-breaking');
    assert.match(result.reason, /cancelled/);
  });
});

describe('compareSchemas — no-change', () => {
  it('property order changed → no-change', () => {
    const prev = {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'],
    };
    const curr = {
      type: 'object',
      properties: { name: { type: 'string' }, id: { type: 'string' } }, // order swapped
      required: ['id', 'name'],
    };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'no-change');
  });

  it('required array reordered → no-change', () => {
    const prev = {
      type: 'object',
      properties: { id: { type: 'string' }, email: { type: 'string' } },
      required: ['id', 'email'],
    };
    const curr = {
      type: 'object',
      properties: { id: { type: 'string' }, email: { type: 'string' } },
      required: ['email', 'id'], // same fields, different order
    };
    const result = compareSchemas(prev, curr);
    assert.equal(result.classification, 'no-change');
  });

  it('identical schemas → no-change', () => {
    const schema = {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' } },
      required: ['id'],
    };
    const result = compareSchemas(schema, { ...schema });
    assert.equal(result.classification, 'no-change');
  });

  it('empty schemas compared → no-change', () => {
    const result = compareSchemas({}, {});
    assert.equal(result.classification, 'no-change');
  });
});
