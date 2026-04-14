import { Command } from 'commander';
import pc from 'picocolors';
import { getStore, findProjectRoot, buildAuditReport } from '@specferret/core';

export const auditCommand = new Command('audit')
  .description('Bidirectional drift report (read-only, always exits 0).')
  .option('--json', 'Machine-readable JSON output')
  .action(async (options) => {
    const root = findProjectRoot();
    const store = await getStore();
    try {
      await store.init();
      const report = await buildAuditReport(store, root);
      const s = report.summary;

      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        process.exit(0);
      }

      const healthy = s.needsReview === 0 && s.downwardBreaking === 0 && s.upwardBreaking === 0;
      process.stdout.write(`\n  ${healthy ? pc.green('✓') : pc.yellow('⚠')} ferret audit  ${s.totalContracts} contracts\n\n`);
      process.stdout.write(`  stable ${s.stable}  needs-review ${s.needsReview}${s.roadmap > 0 ? `  roadmap ${s.roadmap}` : ''}\n\n`);

      for (const item of report.downwardDrift) {
        process.stdout.write(`  ${pc.red('↓')} ${item.triggeredByContractId} → ${item.filePath}  (${item.impact}, depth ${item.depth})\n`);
      }
      for (const drift of report.upwardDrift) {
        const arrow = drift.driftClass === 'BREAKING' ? pc.red('↑') : pc.yellow('↑');
        process.stdout.write(`  ${arrow} ${drift.contractId}  ${drift.sourceFile}:${drift.sourceSymbol} — ${drift.reason}\n`);
      }
      if (report.downwardDrift.length > 0 || report.upwardDrift.length > 0) process.stdout.write('\n');

      if (s.integrityViolationCount > 0) {
        process.stdout.write(`  ${pc.red('!')} ${s.integrityViolationCount} integrity violation(s)\n\n`);
      }

      const totalBreaking = s.downwardBreaking + s.upwardBreaking;
      const totalNonBreaking = s.downwardNonBreaking + s.upwardNonBreaking;
      process.stdout.write(`  ${totalBreaking} breaking  ${totalNonBreaking} non-breaking  ${s.integrityViolationCount} integrity\n\n`);
      process.exit(0);
    } finally {
      await store.close();
    }
  });
