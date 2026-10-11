import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { evaluate } from "../scripts/release-evidence-check.mjs";

const sha = "a".repeat(40);
const fields = [
  "serverDiagnostics",
  "httpsTrustedCa",
  "loginSession",
  "commercialFlow",
  "tenantIsolation",
  "backupRestore",
  "rollbackDrill",
  "securityReview",
  "operationalApproval",
];

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "crm-evidence-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "evidence"));
  const evidence = {};
  for (const field of fields) {
    const name = field + ".txt";
    await writeFile(join(root, "evidence", name), "Mock only\n");
    evidence[field] = { status: "passed", file: "evidence/" + name };
  }
  const manifest = {
    schemaVersion: 1,
    candidate: {
      sha,
      ciHeadSha: sha,
      ciEvent: "push",
      ciConclusion: "success",
      ciRunUrl: "https://github.com/jeffaxe81/crm-vendas/actions/runs/1234",
    },
    evidence,
  };
  const path = join(root, "manifest.json");
  const save = () => writeFile(path, JSON.stringify(manifest));
  await save();
  return { root, manifest, path, save };
}

test("missing manifest is fail closed", async () => {
  const result = await evaluate("/unavailable/crm-rc-evidence.json");
  assert.equal(result.status, "NO_GO");
  assert.equal(result.productionApproved, false);
});

test("complete evidence index is still NOT release approval", async t => {
  const { path } = await fixture(t);
  const result = await evaluate(path, sha);
  assert.equal(result.status, "EVIDENCE_PRESENT_UNVERIFIED");
  assert.equal(result.productionApproved, false);
  assert.equal(result.humanVerificationRequired, true);
  assert.equal(result.externalChecksExecuted, false);
  assert.deepEqual(result.errors, []);
});

test("missing restore, wrong CI commit and absent signoff block", async t => {
  const { path, manifest, save } = await fixture(t);
  manifest.candidate.ciHeadSha = "b".repeat(40);
  manifest.evidence.backupRestore.file = "evidence/missing.txt";
  manifest.evidence.operationalApproval.status = "pending";
  await save();
  const result = await evaluate(path, sha);
  assert.equal(result.status, "NO_GO");
  assert.match(result.errors.join(" "), /CI declarado/);
  assert.match(result.errors.join(" "), /backupRestore/);
  assert.match(result.errors.join(" "), /operationalApproval/);
});

test("rejects mismatched expected SHA and untrusted CI link", async t => {
  const { path, manifest, save } = await fixture(t);
  manifest.candidate.ciRunUrl = "https://evil.invalid/actions/runs/42";
  await save();
  const result = await evaluate(path, "b".repeat(40));
  assert.equal(result.status, "NO_GO");
  assert.match(result.errors.join(" "), /commit esperado/);
  assert.match(result.errors.join(" "), /CI declarado/);
});

test("rejects traversal and symbolic links", async t => {
  const { root, path, manifest, save } = await fixture(t);
  manifest.evidence.serverDiagnostics.file = "../outside.txt";
  await symlink(
    join(root, "evidence", "rollbackDrill.txt"),
    join(root, "evidence", "symlink.txt")
  );
  manifest.evidence.rollbackDrill.file = "evidence/symlink.txt";
  await save();
  const result = await evaluate(path, sha);
  assert.equal(result.status, "NO_GO");
  assert.match(result.errors.join(" "), /serverDiagnostics/);
  assert.match(result.errors.join(" "), /rollbackDrill/);
});
