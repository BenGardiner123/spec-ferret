import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { findProjectRoot, getStore, buildStatusReport, buildStatusMarkdown } from '@specferret/core';

export const statusCommand = new Command('status')
  .description('Report current contract drift state (read-only, always exits 0).')
  .option('--json', 'Machine-readable JSON output, no ANSI codes')
  .option('--export', 'Write STATUS.md to the project root')
  .action(async (options) => {
    const root = findProjectRoot();
    const store = await getStore();
    try {
      await store.init();
      const report = await buildStatusReport(store);

      if (options.export) {
        const markdown = buildStatusMarkdown(report);
        fs.writeFileSync(path.join(root, 'STATUS.md'), markdown, 'utf-8');
        process.stdout.write('ferret status  STATUS.md written\n');
        process.exit(0);
      }

      if (options.json) {
        const output = { ...report, contracts: report.contracts.filter((c) => c.status === 'needs-review') };
        process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        process.exit(0);
      }

      process.stdout.write(`ferret status  ${report.total} contract${report.total !== 1 ? 's' : ''}\n`);
      process.stdout.write(`\n  stable        ${report.stable}\n`);
      if (report.roadmap > 0) process.stdout.write(`  roadmap       ${report.roadmap}\n`);
      process.stdout.write(`  needs-review  ${report.needsReview}\n`);
      const needsReview = report.contracts.filter((c) => c.status === 'needs-review');
      if (needsReview.length > 0) {
        process.stdout.write('\n  NEEDS REVIEW\n');
        for (const c of needsReview) {
          process.stdout.write(`  ${pc.red(c.id)}  ${c.driftClass} — ${c.dependentCount} dependent${c.dependentCount !== 1 ? 's' : ''}\n`);
        }
      }
      process.stdout.write('\n');
      process.exit(0);
    } finally {
      await store.close();
    }
  });
