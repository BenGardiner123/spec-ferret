import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process';

const DEFAULT_CLI_TIMEOUT_MS = 240_000;

export function runFerretCli(
  ferretBin: string,
  args: string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, 'encoding'> = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [ferretBin, ...args], {
    ...options,
    encoding: 'utf-8',
    timeout: options.timeout ?? DEFAULT_CLI_TIMEOUT_MS,
  });
}