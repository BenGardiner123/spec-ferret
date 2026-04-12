// Extractor layer — turns a .contract.ts file into an ExtractionResult.
// Uses Bun's native import() — no ts-morph, no AST, no compile step.

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { isContract } from '../contract.js';
import { hashSchema } from './hash.js';
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
      fileType: 'spec',
      contracts: [],
      extractedBy: 'typescript',
      extractedAt: Date.now(),
      warning: 'no-frontmatter',
    };
  }

  const contracts: ExtractionResult['contracts'] = [];

  for (const [exportName, exportValue] of Object.entries(mod)) {
    if (!isContract(exportValue)) continue;

    const shape = zodToJsonSchema(z.object(exportValue.output), { $refStrategy: 'none' });
    const shape_hash = hashSchema(shape);

    // Pass 2: resolve consumes → import IDs
    const imports: string[] = [];
    if (exportValue.consumes) {
      for (const consumed of exportValue.consumes) {
        const samefile = exportNameMap.get(consumed);
        if (samefile !== undefined) {
          imports.push(samefile);
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
      id: exportName,
      type: 'type',
      shape,
      shape_hash,
      imports,
    });
  }

  return {
    filePath,
    fileType: 'spec',
    contracts,
    extractedBy: 'typescript',
    extractedAt: Date.now(),
  };
}
