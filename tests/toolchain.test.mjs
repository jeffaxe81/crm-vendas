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

test("CI verifies PRs and merged main commits", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /^on:\n  push:\n    branches:\n      - main\n/m);
  assert.match(workflow, /^  pull_request:\n    branches:\n      - main\n/m);
  assert.match(workflow, /^  workflow_dispatch:\s*$/m);
});
