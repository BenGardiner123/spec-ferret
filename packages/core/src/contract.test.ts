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
});

describe('defineContract', () => {
  it('returns the exact object passed to it when valid', () => {
    const contract = { value: 'x', output: {} };
    expect(defineContract(contract)).toBe(contract);
  });

  it('does not throw when id is omitted', () => {
    expect(() => defineContract({ value: 'x', output: {} })).not.toThrow();
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
});
