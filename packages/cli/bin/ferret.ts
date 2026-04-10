#!/usr/bin/env bun
import { Command } from 'commander';

const VERSION = '0.2.0';

async function main(): Promise<void> {
  if (process.argv.includes('--version') || process.argv.includes('-V')) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const program = new Command();

  program.name('ferret').description('SpecFerret keeps your specs honest.').version(VERSION);

  const [{ initCommand }, { scanCommand }, { lintCommand }, { extractCommand }, { reviewCommand }] = await Promise.all([
    import('./commands/init.js'),
    import('./commands/scan.js'),
    import('./commands/lint.js'),
    import('./commands/extract.js'),
    import('./commands/review.js'),
  ]);

  program.addCommand(initCommand);
  program.addCommand(scanCommand);
  program.addCommand(lintCommand);
  program.addCommand(extractCommand);
  program.addCommand(reviewCommand);

  await program.parseAsync(process.argv);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic = message.startsWith('ferret:') ? message : `ferret: ${message}`;
  process.stderr.write(diagnostic + '\n');
  process.exit(2);
});
