import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { createContractWatcher, loadConfig, findProjectRoot } from '@specferret/core';

export const watchCommand = new Command('watch')
  .description('Watch contract files and re-lint on changes.')
  .option('--debounce <ms>', 'Debounce interval in ms', '300')
  .action(async (options) => {
    const root = findProjectRoot();
    const config = loadConfig();
    const debounceMs = Math.max(100, parseInt(options.debounce, 10) || 300);

    process.stdout.write(pc.green('ferret watch') + `  watching ${config.specDir} for changes...\n`);

    const watcher = createContractWatcher({
      specDir: config.specDir,
      projectRoot: root,
      debounceMs,
      onChange: (files) => {
        const label = files.length === 1 ? files[0] : `${files.length} files`;
        process.stdout.write(`\n${pc.cyan('→')} ${label} changed\n`);
        spawnSync(process.execPath, [process.argv[1], 'lint'], {
          cwd: root,
          stdio: 'inherit',
        });
      },
    });

    process.on('SIGINT', () => {
      watcher.close();
      process.stdout.write('\nferret watch  stopped\n');
      process.exit(0);
    });
  });
