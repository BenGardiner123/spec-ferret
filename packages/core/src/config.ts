import * as fs from "node:fs";
import * as path from "node:path";
import { findProjectRoot } from "./utils/paths.js";

export interface FerretConfig {
  specDir: string;
  filePattern: string;
  includes?: string[];
  store: "sqlite" | "postgres";
  importSuggestions?: {
    enabled?: boolean;
  };
  codeContracts?: {
    include: string[];
    watchNodes?: string[];
  };
}

export const DEFAULT_CONFIG: FerretConfig = {
  specDir: "contracts/",
  filePattern: "**/*.contract.md",
  includes: ["**/*.contract.md"],
  store: "sqlite",
  importSuggestions: {
    enabled: true,
  },
};

/**
 * Loads ferret.config.json from the project root.
 * Falls back to DEFAULT_CONFIG if the file is not found.
 */
export function loadConfig(): FerretConfig {
  const root = findProjectRoot();
  const configPath = path.join(root, "ferret.config.json");

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<FerretConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
