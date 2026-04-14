import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { glob } from 'glob';
import { extractFromSpecFile, extractFromContractFile, compareSchemas, writeContext, getStore, loadConfig, findProjectRoot, hashSchema } from '@specferret/core';
import type { ExtractionResult } from '@specferret/core';
import { randomUUID } from 'node:crypto';
import pc from 'picocolors';

export const scanCommand = new Command('scan')
  .description('Advanced/manual: scan contract files and update the graph state.')
  .argument('[files...]', 'Specific files to scan (optional)')
  .option('--changed', 'Scan only git-staged files')
  .option('--force', 'Re-extract all files regardless of hash')
  .option('--allow-partial-success', 'Continue scanning after extraction failures (explicit opt-in)')
  .option('--ci', 'Machine-readable output, no colours')
  .action(async (files: string[], options) => {
    const root = findProjectRoot();
    const config = loadConfig();
    const store = await getStore();
    await store.init();

    try {
      // Resolve file list
      let filesToScan: string[] = files.length > 0 ? files : [];

      if (filesToScan.length === 0) {
        // Glob spec files from specDir
        const specDir = path.resolve(root, config.specDir);
        const pattern = config.filePattern ?? '**/*.contract.md';
        filesToScan = await glob(pattern, { cwd: specDir, absolute: false });
        filesToScan = filesToScan.map((f) => path.join(config.specDir, f));

        // Also discover .contract.ts files (opt-out model: enabled unless contractParsers.typescript === false)
        if (config.contractParsers?.typescript !== false) {
          const tsFiles = await glob('**/*.contract.ts', { cwd: specDir, absolute: false });
          const mapped = tsFiles.map((f) => path.join(config.specDir, f));
          // Deduplicate: a custom filePattern could already match .contract.ts files,
          // which would cause them to be processed twice (once via extractFromSpecFile,
          // once via extractFromContractFile). Use a Set to prevent duplicate entries.
          filesToScan = [...new Set([...filesToScan, ...mapped])];
        }
      }

      // --changed flag: filter to staged files only
      if (options.changed) {
        const staged = getStagedFiles(root);
        filesToScan = filesToScan.filter((f) => {
          const abs = path.resolve(root, f);
          const rel = path.relative(root, abs).replace(/\\/g, '/');
          return staged.has(rel) || staged.has(f);
        });
      }

      let scanned = 0;
      let changed = 0;
      let skipped = 0;
      let failed = 0;
      const seenContractIds = new Map<string, string>(); // contractId → first-seen relFile

      // Pre-seed seenContractIds from the store so unchanged files (skipped by the
      // !fileChanged continue) still participate in cross-file collision detection.
      // Filter to files in filesToScan so stale / deleted entries don't cause false positives.
      const filesToScanSet = new Set(filesToScan);
      const storedContracts = await store.getContracts();
      const storedNodes = await store.getNodes();
      const nodeFilePaths = new Map(storedNodes.map((n) => [n.id, n.file_path]));
      for (const c of storedContracts) {
        const fp = nodeFilePaths.get(c.node_id);
        if (fp && filesToScanSet.has(fp)) {
          seenContractIds.set(c.id, fp);
        }
      }

      for (const relFile of filesToScan) {
        const absFile = path.resolve(root, relFile);

        if (!fs.existsSync(absFile)) {
          skipped++;
          continue;
        }

        const content = fs.readFileSync(absFile, 'utf-8');

        let result: ExtractionResult;
        try {
          if (absFile.endsWith('.contract.ts')) {
            result = await extractFromContractFile(absFile);
          } else {
            result = extractFromSpecFile(relFile, content);
          }
        } catch (error: unknown) {
          failed++;
          const reason = error instanceof Error ? error.message : String(error);
          const diagnostic = `ferret: scan failed for ${relFile} — ${reason}`;

          if (!options.allowPartialSuccess) {
            // Throw only — caller (ferret.ts or lint) will emit to stderr.
            // Writing here would cause the message to appear twice.
            throw new Error(diagnostic);
          }

          // Partial-success: log the failure and continue to next file.
          process.stderr.write(diagnostic + '\n');
          continue;
        }

        if (result.warning === 'no-frontmatter') {
          const msg = `⚠ ${relFile} has no ferret frontmatter — skipped\n`;
          process.stderr.write(msg);
          skipped++;
          continue;
        }

        scanned++;

        const existingNode = await store.getNodeByFilePath(relFile);
        const fileHash = hashSchema(content); // hash of raw file content for change detection
        const nodeId = existingNode?.id ?? randomUUID();

        // --force: always process regardless of file hash
        // no --force: skip if file content hash unchanged (no edit detected)
        const fileChanged = options.force || !existingNode || existingNode.hash !== fileHash;

        if (!fileChanged) {
          continue;
        }

        const importIds = new Set<string>();

        for (const contract of result.contracts) {
          // Detect ID collision across files in the same scan run.
          // Intentionally advisory-only (stderr, exit 0) so scan never blocks a partial result;
          // CI pipelines that need to gate on this should parse stderr for CONFLICT.
          const existingFile = seenContractIds.get(contract.id);
          if (existingFile !== undefined && existingFile !== relFile) {
            process.stderr.write(`ferret: CONFLICT ${contract.id} — defined in both ${existingFile} and ${relFile}\n`);
          }
          seenContractIds.set(contract.id, relFile);

          // Get previous contract for comparison
          const prevContract = await store.getContract(contract.id);

          // Determine status from schema comparison
          let nodeStatus: 'stable' | 'needs-review' = 'stable';

          if (prevContract && prevContract.shape_schema) {
            let prevShape: unknown = {};
            try {
              prevShape = JSON.parse(prevContract.shape_schema);
            } catch {}

            const comparison = compareSchemas(prevShape, contract.shape);
            if (comparison.classification === 'breaking') {
              nodeStatus = 'needs-review';
              const label = options.ci ? 'BREAKING' : pc.red('BREAKING');
              process.stdout.write(`  ${label}  ${contract.id} — ${comparison.reason}\n`);
            } else if (comparison.classification === 'non-breaking') {
              const label = options.ci ? 'NON-BREAKING' : pc.yellow('NON-BREAKING');
              process.stdout.write(`  ${label}  ${contract.id} — ${comparison.reason}\n`);
            }
          }

          await store.upsertNode({
            id: nodeId,
            file_path: relFile,
            hash: fileHash,
            status: nodeStatus,
          });

          await store.upsertContract({
            id: contract.id,
            node_id: nodeId,
            shape_hash: contract.shape_hash,
            shape_schema: JSON.stringify(contract.shape),
            type: contract.type,
            status: nodeStatus,
            ...(contract.sourceFile !== undefined && {
              // Normalize to project-relative path — extractFromContractFile supplies an
              // absolute path; frontmatter extractors supply a relative one. Always store
              // relative so DB and context.json are portable across machines.
              code_source_file: path.isAbsolute(contract.sourceFile)
                ? path.relative(root, contract.sourceFile).replace(/\\/g, '/')
                : contract.sourceFile,
            }),
            ...(contract.sourceSymbol !== undefined && { code_source_symbol: contract.sourceSymbol }),
          });

          contract.imports.forEach((importId) => importIds.add(importId));

          changed++;
        }

        await store.replaceDependenciesForSourceNode(nodeId, [...importIds]);
      }

      // Always write context.json after scan
      await writeContext(store, root);

      const summary = `${scanned} file${scanned !== 1 ? 's' : ''} scanned. ${changed} changed. ${changed} contract${changed !== 1 ? 's' : ''} updated. ${failed} failed.`;
      process.stdout.write(summary + '\n');

      if (failed > 0 && options.allowPartialSuccess) {
        process.stderr.write(`ferret: scan completed with ${failed} extraction error(s) under --allow-partial-success\n`);
      }
    } finally {
      await store.close();
    }
  });

function getStagedFiles(root: string): Set<string> {
  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf8',
      cwd: root,
    }) as string;
    return new Set(output.split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}
