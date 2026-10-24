import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkRealEnvironmentRecord } from "../scripts/check-real-environment-pending.mjs";

const source = new URL(
  "../docs/quality/real-environment-pending-2026-10-23.json",
  import.meta.url
);
const script = fileURLToPath(
  new URL("../scripts/check-real-environment-pending.mjs", import.meta.url)
);

async function fixture() {
  return JSON.parse(await readFile(source, "utf8"));
}

test("committed real-environment record is consistent but never approves production", async () => {
  const result = checkRealEnvironmentRecord(await fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.status, "TRACKING_ONLY_NO_GO");
  assert.equal(result.productionApproved, false);
  assert.equal(result.externalChecksExecuted, false);
  assert.equal(result.automatedTestsExecuted, false);
  assert.equal(result.pending, 4);
});

test("rejects forged GO and weakened security policy", async () => {
  const record = await fixture();
  record.release_status = "APPROVED_FOR_PRODUCTION";
  record.policy.automated_code_security_tests_required = false;
  const result = checkRealEnvironmentRecord(record);
  assert.equal(result.status, "INVALID_RECORD");
  assert.equal(result.productionApproved, false);
  assert.match(result.errors.join(" "), /release_status/);
  assert.match(
    result.errors.join(" "),
    /automated_code_security_tests_required/
  );
});

test("rejects missing and duplicate mandatory gates", async () => {
  const record = await fixture();
  record.external_environment_tests[1].id = "CRM-REAL-01";
  const result = checkRealEnvironmentRecord(record);
  assert.equal(result.status, "INVALID_RECORD");
  assert.match(result.errors.join(" "), /duplicate gate ID/);
  assert.match(result.errors.join(" "), /CRM-REAL-02: required gate missing/);
});

test("rejects a pending gate falsely claiming execution evidence", async () => {
  const record = await fixture();
  record.external_environment_tests[0].executed_at = "2026-10-23T22:00:00Z";
  record.external_environment_tests[0].evidence_url =
    "https://example.com/fake";
  const result = checkRealEnvironmentRecord(record);
  assert.equal(result.status, "INVALID_RECORD");
  assert.match(result.errors.join(" "), /cannot claim execution/);
});

test("rejects unreviewed passed states and invalid evidence submissions", async () => {
  const record = await fixture();
  const entry = record.external_environment_tests[0];
  entry.status = "PASSED_REAL_ENVIRONMENT";
  assert.match(
    checkRealEnvironmentRecord(record).errors.join(" "),
    /no auto-approval allowed/
  );
  entry.status = "EVIDENCE_SUBMITTED_FOR_REVIEW";
  entry.executed_at = "2026-10-23T22:00:00Z";
  entry.evidence_url = "http://example.com/evidence";
  assert.match(
    checkRealEnvironmentRecord(record).errors.join(" "),
    /needs owner, UTC time and HTTPS evidence URL/
  );
});

test("submitted evidence remains unverified even with complete metadata", async () => {
  const record = await fixture();
  const entry = record.external_environment_tests[0];
  entry.status = "EVIDENCE_SUBMITTED_FOR_REVIEW";
  entry.owner = "qa-engineer";
  entry.executed_at = "2026-10-23T22:00:00Z";
  entry.evidence_url = "https://github.com/jeffaxe81/crm-vendas/issues/159";
  const result = checkRealEnvironmentRecord(record);
  assert.deepEqual(result.errors, []);
  assert.equal(result.submittedForReview, 1);
  assert.equal(result.productionApproved, false);
  assert.equal(result.externalChecksExecuted, false);
});

test("missing record fails closed", () => {
  const result = checkRealEnvironmentRecord(null);
  assert.equal(result.status, "INVALID_RECORD");
  assert.equal(result.productionApproved, false);
});

test("CLI checks committed record with no false GO claim", () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "TRACKING_ONLY_NO_GO");
  assert.equal(payload.productionApproved, false);
});

test("CLI rejects a missing manifest instead of passing it", () => {
  const result = spawnSync(
    process.execPath,
    [script, "--manifest", "/nonexistent/crm-real-environment.json"],
    { encoding: "utf8", timeout: 5000 }
  );
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "INVALID_RECORD");
  assert.equal(payload.productionApproved, false);
});
