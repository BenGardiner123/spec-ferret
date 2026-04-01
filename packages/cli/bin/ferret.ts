#!/usr/bin/env node
import { Command } from "commander";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  if (process.argv.includes("--version") || process.argv.includes("-V")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const program = new Command();

  program
    .name("ferret")
    .description("SpecFerret keeps your specs honest.")
    .version(VERSION);

  const [{ initCommand }, { scanCommand }, { lintCommand }] = await Promise.all(
    [
      import("./commands/init.js"),
      import("./commands/scan.js"),
      import("./commands/lint.js"),
    ],
  );

  program.addCommand(initCommand);
  program.addCommand(scanCommand);
  program.addCommand(lintCommand);

  await program.parseAsync(process.argv);
}

void main();
