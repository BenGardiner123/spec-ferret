#!/usr/bin/env node
const originalEmitWarning = process.emitWarning.bind(process);

process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const warningName =
    warning instanceof Error
      ? warning.name
      : typeof args[0] === "string"
        ? args[0]
        : typeof args[0] === "object" &&
            args[0] !== null &&
            "type" in args[0] &&
            typeof (args[0] as { type?: unknown }).type === "string"
          ? (args[0] as { type: string }).type
          : "Warning";
  const warningMessage =
    warning instanceof Error ? warning.message : String(warning);

  if (
    warningName === "ExperimentalWarning" &&
    warningMessage.includes("SQLite")
  ) {
    return;
  }

  return originalEmitWarning(warning as never, ...(args as never[]));
}) as typeof process.emitWarning;

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
