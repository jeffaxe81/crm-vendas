import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/api/src/", import.meta.url));

// Until #250 and #159 have signed operational evidence, the destructive
// executor must remain an internal, transaction-only primitive.
// This is a source exposure guard, NOT approval to execute RESTORE.
function productionSources(directory = root) {
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "generated") {
        entries.push(...productionSources(join(directory, entry.name)));
      }
      continue;
    }
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".ts") ||
      entry.name.endsWith(".spec.ts") ||
      entry.name.endsWith(".test.ts") ||
      entry.name.endsWith(".d.ts")
    ) {
      continue;
    }
    const path = join(directory, entry.name);
    entries.push({ path, content: readFileSync(path, "utf8") });
  }
  return entries;
}

const transactionImport =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["'][^"']*restore-transaction(?:\.[cm]?js|\.ts)?["']/;

test("the internal restore transaction has no production importer", () => {
  const offenders = productionSources()
    .filter(({ path, content }) => {
      if (path.endsWith(sep + "restore-transaction.ts")) return false;
      return transactionImport.test(content);
    })
    .map(({ path }) => path.slice(root.length))
    .sort();

  assert.deepEqual(
    offenders,
    [],
    "Do not wire RESTORE into runtime before #250/#159 approval"
  );
});

test("business graph replacement has no direct runtime caller", () => {
  const offenders = productionSources()
    .filter(({ path, content }) => {
      if (
        path.endsWith(sep + "restore-executor.ts") ||
        path.endsWith(sep + "restore-transaction.ts")
      ) {
        return false;
      }
      return /\brestoreTenantSnapshot\s*\(/.test(content);
    })
    .map(({ path }) => path.slice(root.length))
    .sort();

  assert.deepEqual(
    offenders,
    [],
    "RESTORE must pass confirmation, preventive backup and fencing"
  );
});

test("exposure guard detects an attempted runtime import", () => {
  assert.equal(
    transactionImport.test(
      'import { executeConfirmedRestoreLocked } from "./restore-transaction";'
    ),
    true
  );
  assert.equal(
    transactionImport.test(
      'const restore = await import("../data-management/restore-transaction.js")'
    ),
    true
  );
});
