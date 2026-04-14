// Watch layer — file system watcher with debounce for contract files.
// No business logic. No parsing. No traversal.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WatcherOptions {
  specDir: string;
  projectRoot: string;
  debounceMs?: number;
  onChange: (changedFiles: string[]) => void | Promise<void>;
}

export interface ContractWatcher {
  close: () => void;
}

export function createContractWatcher(options: WatcherOptions): ContractWatcher {
  const { specDir, projectRoot, debounceMs = 300, onChange } = options;
  const watchDir = path.resolve(projectRoot, specDir);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFiles = new Set<string>();
  let running = false;

  const watcher = fs.watch(watchDir, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const normalized = filename.replace(/\\/g, '/');
    if (!normalized.endsWith('.contract.md') && !normalized.endsWith('.contract.ts')) return;

    pendingFiles.add(path.join(specDir, normalized).replace(/\\/g, '/'));

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (running) return;
      running = true;
      const files = [...pendingFiles];
      pendingFiles = new Set();
      try {
        await onChange(files);
      } finally {
        running = false;
      }
    }, debounceMs);
  });

  return {
    close: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
    },
  };
}
