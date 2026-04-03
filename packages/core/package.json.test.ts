import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import pkg from "./package.json";

describe("@specferret/core package.json integrity", () => {
  it("keeps exported entrypoints inside published files", () => {
    const publishedRoots = pkg.files.map((entry) => entry.replace(/\/$/, ""));
    const packageExports = pkg.exports["."];

    for (const [condition, exportPath] of Object.entries(packageExports)) {
      if (typeof exportPath !== "string") {
        continue;
      }

      const normalized = exportPath.replace(/^\.\//, "");
      const exportRoot = normalized.split("/")[0];
      const isPublished = publishedRoots.some(
        (publishedRoot) => publishedRoot === exportRoot,
      );

      assert.ok(
        isPublished,
        `Export condition \"${condition}\" points to ${exportPath}, but ${exportRoot}/ is not in package.json files`,
      );
    }
  });
});
