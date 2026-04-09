// Synchronous only. No async. No await. Anywhere in this file.
// Extractor layer — turns a spec file into an ExtractionResult using gray-matter.

import matter from 'gray-matter';
import { validateFerretSchema } from './validator.js';
import { hashSchema } from './hash.js';

export const ALLOWED_TYPES = ['api', 'table', 'type', 'event', 'flow', 'config'] as const;
export type ContractType = typeof ALLOWED_TYPES[number];

export interface ExtractionResult {
  filePath: string;
  fileType: 'spec' | 'code';
  contracts: Array<{
    id: string;
    type: string;
    shape: object;
    shape_hash: string;
    imports: string[];
  }>;
  extractedBy: 'gray-matter' | 'tree-sitter';
  extractedAt: number; // unix ms
  warning?: 'no-frontmatter';
}

/**
 * Extracts a FerretContract from a spec file's YAML frontmatter.
 *
 * Rules:
 *   - No frontmatter → return empty contracts + warning: 'no-frontmatter'
 *   - Missing required field (id, type, shape) → throw with field name in message
 *   - Unsupported schema keyword → warn via validateFerretSchema, continue
 *   - Identical files → identical shape_hash (deterministic)
 */
export function extractFromSpecFile(
  filePath: string,
  fileContent: string,
): ExtractionResult {
  const { data } = matter(fileContent);
  const ferret = data?.ferret;

  if (!ferret) {
    return {
      filePath,
      fileType: 'spec',
      contracts: [],
      extractedBy: 'gray-matter',
      extractedAt: Date.now(),
      warning: 'no-frontmatter',
    };
  }

  const missingFields = ['id', 'type', 'shape'].filter(f => !ferret[f]);
  if (missingFields.length > 0) {
    throw new Error(
      `Missing required frontmatter fields in ${filePath}: ${missingFields.join(', ')}`,
    );
  }

  if (!ALLOWED_TYPES.includes(ferret.type)) {
    throw new Error(
      `Invalid ferret.type "${ferret.type}" in ${filePath}. ` +
      `Allowed values: ${ALLOWED_TYPES.join(', ')}`,
    );
  }

  // validateFerretSchema never throws — only warns on unsupported keywords
  const validation = validateFerretSchema(ferret.shape, filePath);
  validation.warnings.forEach(w => process.stderr.write(w + '\n'));

  return {
    filePath,
    fileType: 'spec',
    contracts: [{
      id: ferret.id as string,
      type: ferret.type as ContractType,
      shape: ferret.shape as object,
      shape_hash: hashSchema(ferret.shape),
      imports: Array.isArray(ferret.imports) ? ferret.imports as string[] : [],
    }],
    extractedBy: 'gray-matter',
    extractedAt: Date.now(),
  };
}
