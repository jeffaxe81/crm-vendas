import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("repository pins the supported toolchain", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  const nodeVersion = (
    await readFile(new URL("../.node-version", import.meta.url), "utf8")
  ).trim();

  assert.equal(pkg.packageManager, "pnpm@11.3.0");
  assert.equal(pkg.engines.node, "24.20.x");
  assert.equal(nodeVersion, "24.20.0");
  assert.equal(pkg.private, true);
});
