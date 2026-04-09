// Pure function. No I/O. No side effects. Ever.
// Validator layer — validates JSON Schema subset, classifies breaking/non-breaking/no-change.

import { CONTRACT_TYPES, formatAllowedContractTypes, isContractType, type ContractType } from './contract-types.js';

export type ChangeClassification = 'breaking' | 'non-breaking' | 'no-change';

export interface SchemaValidationResult {
  valid: boolean;
  warnings: string[];
}

export interface SchemaComparisonResult {
  classification: ChangeClassification;
  reason: string;
}

export type ContractTypeValidationResult = { valid: true; value: ContractType } | { valid: false; error: string };

export function validateContractType(contractType: unknown, filePath: string): ContractTypeValidationResult {
  if (isContractType(contractType)) {
    return { valid: true, value: contractType };
  }

  return {
    valid: false,
    error: `Invalid contract type '${String(contractType)}' in ${filePath}. Allowed types: ${formatAllowedContractTypes()}.`,
  };
}

/**
 * JSON Schema keywords that are explicitly NOT supported by Ferret.
 * If any appear in a schema, a warning is emitted but the schema is still accepted.
 * See: spec/CONTRACT-SCHEMA.md — Part 3
 */
const UNSUPPORTED_KEYWORDS = [
  '$ref',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  '$defs',
  'definitions',
  'patternProperties',
  'dependencies',
];

/**
 * Validates a schema object against the Ferret JSON Schema subset.
 * Always returns valid: true — unsupported keywords produce warnings, not errors.
 */
export function validateFerretSchema(shape: unknown, filePath: string): SchemaValidationResult {
  const warnings: string[] = [];

  if (shape === null || typeof shape !== 'object') {
    return { valid: true, warnings };
  }

  const serialised = JSON.stringify(shape);

  for (const keyword of UNSUPPORTED_KEYWORDS) {
    // Match the keyword as a JSON object key (surrounded by quotes)
    if (serialised.includes(`"${keyword}"`)) {
      warnings.push(
        `⚠ Unsupported JSON Schema keyword: ${keyword} in ${filePath}\n` +
          `  Ferret supports a subset of JSON Schema.\n` +
          `  See: spec/CONTRACT-SCHEMA.md — Part 3`,
      );
    }
  }

  return { valid: true, warnings };
}

/**
 * Compares two schema objects and classifies the change.
 *
 * Breaking:     required field removed, field type changed, enum value removed,
 *               response/array type changed, required field added
 * Non-breaking: optional field added, enum value added
 * No-change:    property order changed, whitespace, required array reordered
 */
export function compareSchemas(previous: unknown, current: unknown): SchemaComparisonResult {
  // Normalise: work with plain objects only
  const prev = (typeof previous === 'object' && previous !== null ? previous : {}) as Record<string, unknown>;
  const curr = (typeof current === 'object' && current !== null ? current : {}) as Record<string, unknown>;

  // 1. Check type change at this level
  if (prev.type !== undefined && curr.type !== undefined && prev.type !== curr.type) {
    return { classification: 'breaking', reason: `type changed from '${prev.type}' to '${curr.type}'` };
  }

  // 2. Check required fields
  const prevRequired = normaliseRequired(prev.required);
  const currRequired = normaliseRequired(curr.required);

  const removedRequired = prevRequired.filter((f) => !currRequired.includes(f));
  if (removedRequired.length > 0) {
    return { classification: 'breaking', reason: `required field(s) removed: ${removedRequired.join(', ')}` };
  }

  const addedRequired = currRequired.filter((f) => !prevRequired.includes(f));
  if (addedRequired.length > 0) {
    return { classification: 'breaking', reason: `required field(s) added: ${addedRequired.join(', ')}` };
  }

  // 3. Check enum changes
  const prevEnum = normaliseEnum(prev.enum);
  const currEnum = normaliseEnum(curr.enum);

  if (prevEnum !== null && currEnum !== null) {
    const removedEnum = prevEnum.filter((v) => !currEnum.includes(v));
    if (removedEnum.length > 0) {
      return { classification: 'breaking', reason: `enum value(s) removed: ${removedEnum.join(', ')}` };
    }
    const addedEnum = currEnum.filter((v) => !prevEnum.includes(v));
    if (addedEnum.length > 0) {
      return { classification: 'non-breaking', reason: `enum value(s) added: ${addedEnum.join(', ')}` };
    }
  }

  // 4. Check properties — look for type changes in existing properties, or optional additions
  const prevProps = (prev.properties ?? {}) as Record<string, unknown>;
  const currProps = (curr.properties ?? {}) as Record<string, unknown>;

  for (const key of Object.keys(currProps)) {
    if (!(key in prevProps)) {
      // New property — only breaking if it's also in required (already caught above)
      if (currRequired.includes(key)) {
        return { classification: 'breaking', reason: `required field added: ${key}` };
      }
      // Not required — non-breaking addition
      continue;
    }
    // Property exists in both — check for type change recursively
    const nested = compareSchemas(prevProps[key], currProps[key]);
    if (nested.classification === 'breaking') {
      return { classification: 'breaking', reason: `property '${key}': ${nested.reason}` };
    }
    if (nested.classification === 'non-breaking') {
      return { classification: 'non-breaking', reason: `property '${key}': ${nested.reason}` };
    }
  }

  // 5. Check for property removals (any removal is breaking — even "optional" fields
  //    that consumers may depend on)
  for (const key of Object.keys(prevProps)) {
    if (!(key in currProps)) {
      return { classification: 'breaking', reason: `property '${key}' removed` };
    }
  }

  // 6. Check request/response top-level wrappers (Ferret API extension)
  for (const wrapper of ['request', 'response'] as const) {
    if (prev[wrapper] !== undefined || curr[wrapper] !== undefined) {
      const nested = compareSchemas(prev[wrapper] ?? {}, curr[wrapper] ?? {});
      if (nested.classification === 'breaking') {
        return { classification: 'breaking', reason: `${wrapper}: ${nested.reason}` };
      }
      if (nested.classification === 'non-breaking') {
        return { classification: 'non-breaking', reason: `${wrapper}: ${nested.reason}` };
      }
    }
  }

  // 7. Check array items type change
  if (prev.items !== undefined && curr.items !== undefined) {
    const nested = compareSchemas(prev.items, curr.items);
    if (nested.classification === 'breaking') {
      return { classification: 'breaking', reason: `array items: ${nested.reason}` };
    }
    if (nested.classification === 'non-breaking') {
      return { classification: 'non-breaking', reason: `array items: ${nested.reason}` };
    }
  }

  // 8. Check if a new optional property was added (non-breaking)
  const newOptionalKeys = Object.keys(currProps).filter((k) => !(k in prevProps) && !currRequired.includes(k));
  if (newOptionalKeys.length > 0) {
    return { classification: 'non-breaking', reason: `optional field(s) added: ${newOptionalKeys.join(', ')}` };
  }

  return { classification: 'no-change', reason: 'schemas are semantically identical' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseRequired(required: unknown): string[] {
  if (!Array.isArray(required)) return [];
  return required.filter((v): v is string => typeof v === 'string');
}

function normaliseEnum(enumVal: unknown): string[] | null {
  if (!Array.isArray(enumVal)) return null;
  return enumVal.map((v) => String(v));
}
