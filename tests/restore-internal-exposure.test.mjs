import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/api/src/", import.meta.url));

// Runtime wiring is restricted to the explicit, default-disabled recovery
// service. This source boundary complements HTTP/transaction safety tests;
// it is not operational approval to enable recovery in production.
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

test("the restore transaction is imported only by the controlled recovery service", () => {
  const offenders = productionSources()
    .filter(({ path, content }) => {
      if (path.endsWith(sep + "restore-transaction.ts")) return false;
      if (path.endsWith(sep + "recovery-execution.service.ts")) return false;
      if (path.endsWith(sep + "delete-transaction.ts")) return false;
      return transactionImport.test(content);
    })
    .map(({ path }) => path.slice(root.length))
    .sort();

  assert.deepEqual(
    offenders,
    [],
    "Restore wiring must remain inside the guarded recovery service"
  );
});

test("business graph replacement has no direct runtime caller", () => {
  const offenders = productionSources()
    .filter(({ path, content }) => {
      if (
        path.endsWith(sep + "restore-executor.ts") ||
        path.endsWith(sep + "restore-transaction.ts") ||
        path.endsWith(sep + "delete-transaction.ts")
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
