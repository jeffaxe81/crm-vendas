import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkC12DeployRecord } from "../scripts/check-c12-deploy-pending.mjs";

const source = new URL(
  "../docs/quality/c12-deploy-real-environment-pending-2026-10-28.json",
  import.meta.url
);
const script = fileURLToPath(
  new URL("../scripts/check-c12-deploy-pending.mjs", import.meta.url)
);

async function fixture() {
  return JSON.parse(await readFile(source, "utf8"));
}

test("committed C12 record stays tracking-only and never approves production", async () => {
  const result = checkC12DeployRecord(await fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.status, "TRACKING_ONLY_NO_GO");
  assert.equal(result.productionApproved, false);
  assert.equal(result.externalChecksExecuted, false);
  assert.equal(result.pending, 6);
  assert.equal(result.submittedForReview, 0);
});

test("rejects forged production approval", async () => {
  const record = await fixture();
  record.release_status = "APPROVED_FOR_PRODUCTION";
  const result = checkC12DeployRecord(record);
  assert.equal(result.status, "INVALID_RECORD");
  assert.equal(result.productionApproved, false);
  assert.match(result.errors.join(" "), /release_status/);
});

test("rejects duplicate and missing mandatory C12 gates", async () => {
  const record = await fixture();
  record.external_environment_tests[1].id = "C12-REAL-01";
  const result = checkC12DeployRecord(record);
  assert.equal(result.status, "INVALID_RECORD");
  assert.match(result.errors.join(" "), /duplicate gate ID/);
  assert.match(result.errors.join(" "), /C12-REAL-02: required gate missing/);
});

test("rejects pending evidence that claims execution", async () => {
  const record = await fixture();
  Object.assign(record.external_environment_tests[0], {
    executed_at: "2026-10-28T21:00:00Z",
    evidence_url: "https://example.com/c12-evidence",
  });
  const result = checkC12DeployRecord(record);
  assert.equal(result.status, "INVALID_RECORD");
  assert.match(result.errors.join(" "), /cannot claim execution/);
});

test("rejects direct passed state and invalid submitted evidence", async () => {
  const record = await fixture();
  const entry = record.external_environment_tests[0];

  entry.status = "PASSED_REAL_ENVIRONMENT";
  assert.match(
    checkC12DeployRecord(record).errors.join(" "),
    /no auto-approval allowed/
  );

  entry.status = "EVIDENCE_SUBMITTED_FOR_REVIEW";
  entry.executed_at = "2026-02-30T12:00:00Z";
  entry.evidence_url = "http://example.com/evidence";
  assert.match(
    checkC12DeployRecord(record).errors.join(" "),
    /needs owner, UTC time and HTTPS evidence URL/
  );
});

test("valid submitted metadata remains unapproved and requires review", async () => {
  const record = await fixture();
  Object.assign(record.external_environment_tests[0], {
    status: "EVIDENCE_SUBMITTED_FOR_REVIEW",
    owner: "qa-engineer",
    executed_at: "2026-10-28T21:00:00Z",
    evidence_url: "https://github.com/jeffaxe81/crm-vendas/issues/318",
  });
  const result = checkC12DeployRecord(record);
  assert.deepEqual(result.errors, []);
  assert.equal(result.submittedForReview, 1);
  assert.equal(result.productionApproved, false);
  assert.equal(result.externalChecksExecuted, false);
});

test("CLI rejects a missing manifest instead of passing it", () => {
  const result = spawnSync(
    process.execPath,
    [script, "--manifest", "/nonexistent/c12-deploy-evidence.json"],
    { encoding: "utf8", timeout: 5000 }
  );
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "INVALID_RECORD");
  assert.equal(payload.productionApproved, false);
});
