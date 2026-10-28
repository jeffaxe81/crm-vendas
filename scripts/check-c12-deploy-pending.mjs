#!/usr/bin/env node
/**
 * Validate C12 deploy evidence tracking.
 *
 * This validates record consistency only. It does NOT access the private
 * environment, authenticate evidence, approve production or weaken technical
 * gates.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredIds = new Set([
  "C12-REAL-01",
  "C12-REAL-02",
  "C12-REAL-03",
  "C12-REAL-04",
  "C12-REAL-05",
  "C12-REAL-06",
]);

const requiredPolicies = [
  "development_may_continue_without_external_environment",
  "automated_code_security_tests_required",
  "manual_environment_tests_required_before_production_go",
  "do_not_claim_unperformed_tests_as_passed",
  "do_not_disable_technical_security_gates",
];

const isRecord = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const nonEmpty = value =>
  typeof value === "string" && value.trim().length > 0;

function validEvidenceUrl(value) {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      nonEmpty(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function validUtcTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  ) {
    return false;
  }

  const timestamp = Date.parse(value);
  return (
    !Number.isNaN(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}

export function checkC12DeployRecord(record) {
  const errors = [];

  if (!isRecord(record) || record.schema_version !== 1) {
    errors.push("schema_version must be 1");
  }

  if (record?.release_status !== "NOT_APPROVED_FOR_PRODUCTION") {
    errors.push("release_status must remain NOT_APPROVED_FOR_PRODUCTION");
  }

  if (!isRecord(record?.policy)) {
    errors.push("policy must be an object");
  }

  for (const key of requiredPolicies) {
    if (record?.policy?.[key] !== true) {
      errors.push("policy." + key + " must be true");
    }
  }

  const entries = Array.isArray(record?.external_environment_tests)
    ? record.external_environment_tests
    : [];

  if (entries.length !== requiredIds.size) {
    errors.push("external_environment_tests must include exactly six gates");
  }

  const seen = new Set();
  let pending = 0;
  let submittedForReview = 0;

  for (const [index, entry] of entries.entries()) {
    const id = isRecord(entry) ? entry.id : undefined;
    const prefix = typeof id === "string" ? id : "entry[" + index + "]";

    if (!requiredIds.has(id) || seen.has(id)) {
      errors.push(prefix + ": unknown or duplicate gate ID");
    }
    seen.add(id);

    if (
      !isRecord(entry) ||
      entry.gate !== "PRODUCTION_GO" ||
      !nonEmpty(entry.area) ||
      !nonEmpty(entry.procedure) ||
      !nonEmpty(entry.evidence_required) ||
      !nonEmpty(entry.owner)
    ) {
      errors.push(prefix + ": invalid gate metadata");
      continue;
    }

    if (entry.status === "PENDING_REAL_ENVIRONMENT") {
      pending++;
      if (entry.executed_at !== null || entry.evidence_url !== null) {
        errors.push(prefix + ": pending gate cannot claim execution/evidence");
      }
      continue;
    }

    if (entry.status === "EVIDENCE_SUBMITTED_FOR_REVIEW") {
      submittedForReview++;
      if (
        entry.owner.trim() === "to_be_assigned" ||
        !validUtcTime(entry.executed_at) ||
        !validEvidenceUrl(entry.evidence_url)
      ) {
        errors.push(
          prefix +
            ": submitted gate needs owner, UTC time and HTTPS evidence URL"
        );
      }
      continue;
    }

    errors.push(prefix + ": unsupported status (no auto-approval allowed)");
  }

  for (const id of requiredIds) {
    if (!seen.has(id)) {
      errors.push(id + ": required gate missing");
    }
  }

  return {
    kind: "C12_DEPLOY_REAL_ENVIRONMENT_TRACKING_CHECK",
    status: errors.length ? "INVALID_RECORD" : "TRACKING_ONLY_NO_GO",
    productionApproved: false,
    externalChecksExecuted: false,
    pending,
    submittedForReview,
    errors,
  };
}

const direct =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (direct) {
  const manifestFlag = process.argv.indexOf("--manifest");
  const defaultPath = fileURLToPath(
    new URL(
      "../docs/quality/c12-deploy-real-environment-pending-2026-10-28.json",
      import.meta.url
    )
  );
  const path =
    manifestFlag >= 0 ? process.argv[manifestFlag + 1] : defaultPath;

  let result;
  try {
    if (manifestFlag >= 0 && !path) {
      throw new Error("missing manifest path");
    }
    result = checkC12DeployRecord(JSON.parse(await readFile(path, "utf8")));
  } catch {
    result = checkC12DeployRecord(null);
    result.errors.push("manifest not readable or not valid JSON");
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.errors.length ? 1 : 0;
}
