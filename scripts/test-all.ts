import { spawnSync } from 'node:child_process';

const TEST_FILES = [
  'packages/core/package.json.test.ts',
  'packages/core/src/context/index.test.ts',
  'packages/core/src/contract.test.ts',
  'packages/core/src/store/sqlite.test.ts',
  'packages/core/src/audit/index.test.ts',
  'packages/core/src/reconciler/index.test.ts',
  'packages/core/src/reconciler/import-suggestions.test.ts',
  'packages/core/src/extractor/typescript.test.ts',
  'packages/core/src/extractor/typescript-contract.test.ts',
  'packages/core/src/extractor/frontmatter.test.ts',
  'packages/core/src/extractor/upward-classifier.test.ts',
  'packages/core/src/extractor/validator.test.ts',
  'packages/cli/bin/ferret.test.ts',
  'packages/cli/bin/commands/watch.test.ts',
  'packages/cli/bin/commands/status.test.ts',
  'packages/cli/bin/commands/scan.test.ts',
  'packages/cli/bin/commands/review.test.ts',
  'packages/cli/bin/commands/performance.test.ts',
  'packages/cli/bin/commands/lint.test.ts',
  'packages/cli/bin/commands/lint.ci.test.ts',
  'packages/cli/bin/commands/init.test.ts',
  'packages/cli/bin/commands/init.hook.test.ts',
  'packages/cli/bin/commands/extract.test.ts',
  'packages/cli/bin/commands/audit.test.ts',
];

for (const testFile of TEST_FILES) {
  process.stdout.write(`\n==> bun test ${testFile}\n`);

  const result = spawnSync(
    process.execPath,
    ['test', '--timeout', '240000', '--max-concurrency', '1', testFile],
    {
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}