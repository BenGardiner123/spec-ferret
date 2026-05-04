// Extractor layer — turns a .contract.ts file into an ExtractionResult.
// Uses Bun's native import() — no ts-morph, no AST, no compile step.

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { isContract } from '../contract.js';
import { hashSchema } from './hash.js';
import { mapToContractStatus } from './frontmatter.js';
import type { ExtractionResult } from './frontmatter.js';

export async function extractFromContractFile(filePath: string): Promise<ExtractionResult> {
  const mod = (await import(filePath)) as Record<string, unknown>;

  // Pass 1: build Map<contract object reference → export name> for same-file resolution
  const exportNameMap = new Map<object, string>();
  for (const [exportName, exportValue] of Object.entries(mod)) {
    if (isContract(exportValue)) {
      exportNameMap.set(exportValue, exportName);
    }
  }

  if (exportNameMap.size === 0) {
    return {
      filePath,
      fileType: 'code',
      contracts: [],
      extractedBy: 'typescript',
      extractedAt: Date.now(),
      warning: 'no-frontmatter',
    };
  }

  const contracts: ExtractionResult['contracts'] = [];

  for (const [exportName, exportValue] of Object.entries(mod)) {
    if (!isContract(exportValue)) continue;

    // zod-to-json-schema@3 types reference zod@3's ZodTypeDef; cast is safe — runtime supports zod@4
    const shape = zodToJsonSchema(z.object(exportValue.output) as any, { $refStrategy: 'none' });
    const shape_hash = hashSchema(shape);

    // Pass 2: resolve consumes → import IDs
    const imports: string[] = [];
    if (exportValue.consumes) {
      for (const consumed of exportValue.consumes) {
        const samefile = exportNameMap.get(consumed);
        if (samefile !== undefined) {
          imports.push(consumed.id ?? samefile);
        } else if (consumed.id !== undefined) {
          imports.push(consumed.id);
        } else {
          process.stderr.write(
            `[specferret] warning: unresolvable consumes reference in '${filePath}' — export '${exportName}' references a contract with no id and no matching same-file export\n`,
          );
          imports.push('[unresolved]');
        }
      }
    }

    contracts.push({
      id: exportValue.id ?? exportName,
      type: 'type',
      shape,
      shape_hash,
      imports,
      contractStatus: mapToContractStatus(exportValue.status),
      sourceFile: filePath,
      sourceSymbol: exportName,
    });
  }

  return {
    filePath,
    fileType: 'code',
    contracts,
    extractedBy: 'typescript',
    extractedAt: Date.now(),
  };
}
