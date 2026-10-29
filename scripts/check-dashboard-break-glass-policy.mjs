#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const isRecord = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;

export function checkDashboardBreakGlassPolicy(policy) {
  const errors = [];
  if (!isRecord(policy) || policy.schema_version !== 1)
    errors.push("schema_version must be 1");
  if (policy?.status !== "POLICY_DEFINED_NOT_ENABLED")
    errors.push("status must remain POLICY_DEFINED_NOT_ENABLED");

  const controls = isRecord(policy?.controls) ? policy.controls : {};
  for (const key of [
    "mfa_required",
    "second_approver_required",
    "requester_must_differ_from_approver",
    "explicit_scopes_only",
    "audit_required",
  ])
    if (controls[key] !== true)
      errors.push("controls." + key + " must be true");
  if (controls.wildcard_scope_allowed !== false)
    errors.push("wildcard scope must remain disabled");
  if (
    !Number.isSafeInteger(controls.max_duration_minutes) ||
    controls.max_duration_minutes < 1 ||
    controls.max_duration_minutes > 30
  )
    errors.push("max duration must be between 1 and 30 minutes");

  const request = isRecord(policy?.sample_request) ? policy.sample_request : {};
  if (!nonEmpty(request.requester) || !nonEmpty(request.approver))
    errors.push("requester and approver are required");
  if (
    controls.requester_must_differ_from_approver === true &&
    request.requester === request.approver
  )
    errors.push("requester and approver must differ");
  if (
    !Array.isArray(request.scopes) ||
    request.scopes.length === 0 ||
    request.scopes.some(
      scope =>
        !nonEmpty(scope) || scope === "*" || !/^[a-z][a-z0-9.-]*$/.test(scope)
    )
  )
    errors.push("explicit non-wildcard scopes are required");
  if (
    !Number.isSafeInteger(request.duration_minutes) ||
    request.duration_minutes < 1 ||
    request.duration_minutes > 30 ||
    (Number.isSafeInteger(controls.max_duration_minutes) &&
      request.duration_minutes > controls.max_duration_minutes)
  )
    errors.push("requested duration exceeds policy");
  if (request.mfa_verified !== true)
    errors.push("MFA verification is required");
  if (request.audit_enabled !== true) errors.push("audit trail is required");

  return {
    valid: errors.length === 0,
    breakGlassEnabled: false,
    productionApproved: false,
    errors,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  let result;
  try {
    result = checkDashboardBreakGlassPolicy(
      JSON.parse(await readFile(path, "utf8"))
    );
  } catch {
    result = checkDashboardBreakGlassPolicy(null);
    result.errors.push("policy file not readable");
    result.valid = false;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.valid ? 0 : 1;
}
