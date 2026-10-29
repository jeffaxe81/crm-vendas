import assert from "node:assert/strict";
import test from "node:test";

import { checkDashboardBreakGlassPolicy } from "../scripts/check-dashboard-break-glass-policy.mjs";

function validPolicy() {
  return {
    schema_version: 1,
    status: "POLICY_DEFINED_NOT_ENABLED",
    controls: {
      mfa_required: true,
      second_approver_required: true,
      requester_must_differ_from_approver: true,
      max_duration_minutes: 30,
      explicit_scopes_only: true,
      wildcard_scope_allowed: false,
      audit_required: true,
    },
    sample_request: {
      requester: "operator-a",
      approver: "operator-b",
      scopes: ["dashboards.read"],
      duration_minutes: 15,
      mfa_verified: true,
      audit_enabled: true,
    },
  };
}

test("valid tracking policy remains fail-closed", () => {
  const result = checkDashboardBreakGlassPolicy(validPolicy());
  assert.equal(result.valid, true);
  assert.equal(result.breakGlassEnabled, false);
  assert.equal(result.productionApproved, false);
  assert.deepEqual(result.errors, []);
});

test("policy rejects weakened or self-approved emergency access", () => {
  const cases = [
    policy => (policy.controls.mfa_required = false),
    policy => (policy.sample_request.approver = policy.sample_request.requester),
    policy => (policy.sample_request.scopes = ["*"]),
    policy => (policy.sample_request.duration_minutes = 31),
    policy => (policy.controls.audit_required = false),
    policy => (policy.status = "APPROVED_FOR_PRODUCTION"),
  ];
  for (const mutate of cases) {
    const policy = validPolicy();
    mutate(policy);
    const result = checkDashboardBreakGlassPolicy(policy);
    assert.equal(result.valid, false);
    assert.equal(result.breakGlassEnabled, false);
    assert.equal(result.productionApproved, false);
    assert(result.errors.length > 0);
  }
});
