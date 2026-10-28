# C12 Deploy Real-Environment Evidence Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track C12-01 real-environment acceptance evidence in a fail-closed form without allowing CI or submitted artifacts to auto-approve production.

**Architecture:** Add a C12-specific JSON tracking record plus a small Node validator modeled on the repository's existing real-environment evidence checks. Keep external execution separate from CI and update the backlog to distinguish code completion from production homologation.

**Tech Stack:** Node.js 24, node:test, JSON, existing GitHub Actions/repository gate.

**Spec:** `docs/superpowers/specs/2026-10-28-c12-deploy-real-evidence-gate-design.md`

## Global Constraints

- Never claim external tests were executed when they were not.
- `productionApproved` must always remain `false` in this validator.
- Only `PENDING_REAL_ENVIRONMENT` and `EVIDENCE_SUBMITTED_FOR_REVIEW` are accepted states.
- Evidence URLs must be HTTPS and contain no embedded credentials.
- Submitted evidence requires an assigned owner and valid UTC timestamp.
- Do not change deployment/Nginx/database behavior in this increment.
- Work only on `test/c12-deploy-real-evidence-gate-20261028`; do not implement on `main`.

## Review Focus

- Forged PASSED/APPROVED states must fail closed.
- Impossible UTC timestamps must be rejected.
- Duplicate or missing required gate IDs must be rejected.
- Pending gates must not carry evidence/timestamps.
- Submitted evidence must not be interpreted as human approval.

---

### Task 1: C12 evidence validator

**Files:**
- Create: `tests/c12-deploy-real-environment.test.mjs`
- Create: `scripts/check-c12-deploy-pending.mjs`
- Create: `docs/quality/c12-deploy-real-environment-pending-2026-10-28.json`

**Interfaces:**
- Produces: `checkC12DeployRecord(record)`
- CLI: `node scripts/check-c12-deploy-pending.mjs [--manifest <path>]`

- [ ] **Step 1: Write failing tests**

Cover:
- committed manifest is valid tracking but `productionApproved === false`;
- forged `APPROVED_FOR_PRODUCTION` fails;
- duplicate/missing IDs fail;
- pending gate with evidence fails;
- direct `PASSED_REAL_ENVIRONMENT` fails;
- submitted evidence with bad URL/time/unassigned owner fails;
- complete submitted metadata remains unapproved;
- missing manifest fails closed.

- [ ] **Step 2: Run RED**

Run: `node --test tests/c12-deploy-real-environment.test.mjs`

Expected: FAIL because the C12 validator/manifest do not yet exist.

- [ ] **Step 3: Implement validator and pending manifest**

Required IDs:
- `C12-REAL-01`
- `C12-REAL-02`
- `C12-REAL-03`
- `C12-REAL-04`
- `C12-REAL-05`
- `C12-REAL-06`

Return shape includes:
- `kind: "C12_DEPLOY_REAL_ENVIRONMENT_TRACKING_CHECK"`
- `status: "TRACKING_ONLY_NO_GO" | "INVALID_RECORD"`
- `productionApproved: false`
- `externalChecksExecuted: false`
- `pending`
- `submittedForReview`
- `errors`

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/c12-deploy-real-environment.test.mjs`

Expected: PASS.

### Task 2: Backlog truthfulness and repository gate

**Files:**
- Modify: `docs/backlog-do-produto.md`

- [ ] **Step 1: Update C12-01 status**

Use: `Implementado; homologação externa pendente`.

Document that PR #107/#109 delivered code and smoke tooling while the six real-environment gates remain pending until evidence is reviewed.

- [ ] **Step 2: Run repository regression**

Run: `pnpm test:repo`

Expected: PASS, including the new C12 evidence tests if repository test discovery includes `tests/*.test.mjs`; otherwise run both commands explicitly.

- [ ] **Step 3: Run full gate**

Run: `pnpm verify`

Expected: PASS.

- [ ] **Step 4: Open/update draft PR and report**

Do not merge automatically. Report exact SHA and gate evidence; keep production status NO-GO until real evidence is reviewed.
