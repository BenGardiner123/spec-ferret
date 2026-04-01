import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targets = process.argv.slice(2);

if (targets.length === 0) {
  process.stderr.write("clean-dist.ts requires at least one path\n");
  process.exit(1);
}

for (const target of targets) {
  rmSync(resolve(process.cwd(), target), { recursive: true, force: true });
}
