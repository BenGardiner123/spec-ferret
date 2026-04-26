import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { defineContract, isContract } from './contract.js';

describe('isContract', () => {
  it('returns true for a minimal valid object', () => {
    expect(isContract({ value: 'x', output: {} })).toBe(true);
  });

  it('returns true for object with id set', () => {
    expect(isContract({ id: 'auth.jwt', value: 'x', output: {} })).toBe(true);
  });

  it('returns true for object without id — id is optional and not checked', () => {
    expect(isContract({ value: 'x', output: { name: z.string() } })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isContract(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isContract(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isContract(42)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isContract('string')).toBe(false);
  });

  it('returns false for object missing value', () => {
    expect(isContract({ output: {} })).toBe(false);
  });

  it('returns false for object missing output', () => {
    expect(isContract({ value: 'x' })).toBe(false);
  });

  it('returns false when value is not a string', () => {
    expect(isContract({ value: 42, output: {} })).toBe(false);
  });

  it('returns false when output is null', () => {
    expect(isContract({ value: 'x', output: null })).toBe(false);
  });

  it('returns false when output is an array', () => {
    expect(isContract({ value: 'x', output: [] })).toBe(false);
  });
});

describe('defineContract', () => {
  it('returns the same object reference with schema added in-place', () => {
    const contract = { value: 'x', output: {} };
    const result = defineContract(contract);
    expect(result === contract).toBe(true);
    expect(result.schema).toBeDefined();
  });

  it('does not throw when id is omitted', () => {
    expect(() => defineContract({ value: 'x', output: {} })).not.toThrow();
  });

  it('does not throw when id is explicitly undefined', () => {
    expect(() => defineContract({ id: undefined, value: 'x', output: {} })).not.toThrow();
  });

  it('does not throw when id is a valid non-empty string', () => {
    expect(() => defineContract({ id: 'auth.jwt', value: 'x', output: {} })).not.toThrow();
  });

  it('throws when id is an empty string', () => {
    expect(() => defineContract({ id: '', value: 'x', output: {} })).toThrow(
      'id must be a non-empty string',
    );
  });

  it('throws when id is whitespace only', () => {
    expect(() => defineContract({ id: '   ', value: 'x', output: {} })).toThrow(
      'id must be a non-empty string',
    );
  });

  it('enforces typed invariant argument — compile-time check via typed fixture', () => {
    // If r is not typed as { name: string }, the _: string assignment below is a compile error.
    const contract = defineContract({
      value: 'typed invariant test',
      output: { name: z.string() },
      invariants: [
        (r) => {
          const _: string = r.name;
          return _.length > 0;
        },
      ],
    });
    expect(isContract(contract)).toBe(true);
  });

  it('schema is present on the returned object', () => {
    const result = defineContract({ value: 'x', output: { ok: z.boolean() } });
    expect(result.schema).toBeDefined();
  });

  it('schema is a ZodObject that validates the output shape', () => {
    const contract = defineContract({ value: 'x', output: { name: z.string(), age: z.number() } });
    expect(contract.schema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
    expect(contract.schema.safeParse({ name: 'Alice' }).success).toBe(false);
  });

  it('schema enables composition — z.array(contract.schema) parses correctly', () => {
    const item = defineContract({ value: 'item', output: { id: z.string() } });
    const list = z.array(item.schema);
    expect(list.safeParse([{ id: 'a' }, { id: 'b' }]).success).toBe(true);
  });

  it('consumes accepts contracts with distinct output shapes without casting', () => {
    const a = defineContract({ id: 'a', value: 'a', output: { x: z.string() } });
    const b = defineContract({ id: 'b', value: 'b', output: { y: z.number() } });
    // TypeScript must accept this without error — this is the variance regression test
    const c = defineContract({ id: 'c', value: 'c', output: {}, consumes: [a, b] });
    expect(c.consumes).toHaveLength(2);
  });
});
