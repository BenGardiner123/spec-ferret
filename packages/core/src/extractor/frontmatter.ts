// Synchronous only. No async. No await. Anywhere in this file.
// Extractor layer — turns a spec file into an ExtractionResult using gray-matter.

import matter from 'gray-matter';
import { validateContractType, validateFerretSchema } from './validator.js';
import { hashSchema } from './hash.js';
import type { ContractType } from './contract-types.js';
import type { ContractStatus } from '../store/types.js';

/**
 * Maps a raw `ferret.status` string value to a normalised ContractStatus.
 * `active` and `complete` map to `'stable'`; anything else (including `undefined`) maps to `'pending'`.
 */
export function mapToContractStatus(rawStatus: unknown): ContractStatus {
  return rawStatus === 'active' || rawStatus === 'complete' ? 'stable' : 'pending';
}

export interface ExtractionResult {
  filePath: string;
  fileType: 'spec' | 'code';
  contracts: Array<{
    id: string;
    type: ContractType;
    shape: object;
    shape_hash: string;
    imports: string[];
    contractStatus?: ContractStatus;
    /** Path to the TypeScript source file (code-first contracts only). */
    sourceFile?: string;
    /** TypeScript symbol name (code-first contracts only). */
    sourceSymbol?: string;
  }>;
  extractedBy: 'gray-matter' | 'tree-sitter' | 'typescript';
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
export function extractFromSpecFile(filePath: string, fileContent: string): ExtractionResult {
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

  const missingFields = ['id', 'type', 'shape'].filter((f) => !ferret[f]);
  if (missingFields.length > 0) {
    throw new Error(`Missing required frontmatter fields in ${filePath}: ${missingFields.join(', ')}`);
  }

  const typeValidation = validateContractType(ferret.type, filePath);
  if (!typeValidation.valid) {
    throw new Error(typeValidation.error);
  }

  // validateFerretSchema never throws — only warns on unsupported keywords
  const validation = validateFerretSchema(ferret.shape, filePath);
  validation.warnings.forEach((w) => process.stderr.write(w + '\n'));

  const source = ferret.source as { file?: unknown; symbol?: unknown } | undefined;
  const sourceFile = typeof source?.file === 'string' ? source.file : undefined;
  const sourceSymbol = typeof source?.symbol === 'string' ? source.symbol : undefined;

  const rawStatus = ferret.status as string | undefined;
  const contractStatus: ContractStatus = mapToContractStatus(rawStatus);

  return {
    filePath,
    fileType: 'spec',
    contracts: [
      {
        id: ferret.id as string,
        type: typeValidation.value,
        shape: ferret.shape as object,
        shape_hash: hashSchema(ferret.shape),
        imports: Array.isArray(ferret.imports) ? (ferret.imports as string[]) : [],
        contractStatus,
        ...(sourceFile !== undefined && { sourceFile }),
        ...(sourceSymbol !== undefined && { sourceSymbol }),
      },
    ],
    extractedBy: 'gray-matter',
    extractedAt: Date.now(),
  };
}
