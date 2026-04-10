// Pure function. No I/O. No side effects. Ever.
// Upward drift classifier — detects when a TypeScript implementation diverges from
// its declared contract schema (code → spec direction).

import { compareSchemas } from './validator.js';

export type UpwardDriftClass = 'BREAKING' | 'NON_BREAKING' | 'NOOP';

export interface UpwardDriftResult {
  contractId: string;
  driftClass: UpwardDriftClass;
  sourceFile: string;
  sourceSymbol: string;
  reason: string;
}

/**
 * Classifies the drift between a declared contract schema and the live code-derived schema.
 *
 * Input:
 *   - declaredSchema: the schema declared in the .contract.md frontmatter (the spec)
 *   - codeSchema:     the schema extracted from the TypeScript source at lint time
 *
 * Output:
 *   - BREAKING:     code change breaks the declared contract (required field removed, type changed, etc.)
 *   - NON_BREAKING: code change is additive but not declared (optional field added, enum value added)
 *   - NOOP:         code and declared schema are semantically identical (hash-stable, no action needed)
 *
 * Uses the same classification taxonomy as compareSchemas for consistency.
 * No-op formatting changes (property reorder with stable hash) return NOOP.
 */
export function classifyUpwardDrift(
  contractId: string,
  declaredSchema: unknown,
  codeSchema: unknown,
  sourceFile: string,
  sourceSymbol: string,
): UpwardDriftResult {
  const comparison = compareSchemas(declaredSchema, codeSchema);

  if (comparison.classification === 'no-change') {
    return {
      contractId,
      driftClass: 'NOOP',
      sourceFile,
      sourceSymbol,
      reason: comparison.reason,
    };
  }

  if (comparison.classification === 'breaking') {
    return {
      contractId,
      driftClass: 'BREAKING',
      sourceFile,
      sourceSymbol,
      reason: comparison.reason,
    };
  }

  return {
    contractId,
    driftClass: 'NON_BREAKING',
    sourceFile,
    sourceSymbol,
    reason: comparison.reason,
  };
}
