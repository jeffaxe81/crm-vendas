# C12 Deploy Real-Environment Evidence Gate — Design

## Goal

Make the remaining C12-01 production validation explicit, fail-closed and reviewable without pretending that private-network tests were executed by CI.

## Current state

- C12-01 implementation was merged in PR #107.
- Post-merge homologation tooling was merged in PR #109.
- The repository can validate Docker/Nginx/deploy contracts offline, but the private server and client-network path still require execution in the real environment.
- Existing generic release-evidence tooling intentionally does not auto-approve production.

## Design

Add a C12-specific committed tracking manifest and validator for the real-environment acceptance gates that cannot be proven by repository CI.

Required gates:

1. `C12-REAL-01` — rotate `APP_DB_PASSWORD` on an existing volume and confirm the stack becomes healthy without manual `ALTER ROLE`.
2. `C12-REAL-02` — start from a new PostgreSQL volume and confirm `axes_app` plus grants are created automatically.
3. `C12-REAL-03` — from another machine on the network, validate trusted HTTPS and authenticated login.
4. `C12-REAL-04` — validate HTTP redirects to the expected HTTPS origin.
5. `C12-REAL-05` — validate ports 3000, 3001 and 5432 are not exposed beyond loopback.
6. `C12-REAL-06` — execute `scripts/verificar-deploy.sh` on the server and obtain zero failures.

Code-level controls such as a single default Compose file, ignored TLS private keys and CI tests remain repository gates and are not duplicated as manual evidence.

## States

Only two evidence states are accepted:

- `PENDING_REAL_ENVIRONMENT`
- `EVIDENCE_SUBMITTED_FOR_REVIEW`

Submission requires an assigned owner, a valid UTC execution timestamp and an HTTPS evidence URL. Submission never means approval.

The validator always returns `productionApproved: false`. A human review and the existing release process remain mandatory.

## Security and integrity

- No passwords, tokens, cookies, private keys or raw `.env` content in evidence metadata.
- Pending records cannot contain execution timestamps or evidence URLs.
- Duplicate/missing gate IDs fail closed.
- Invalid calendar timestamps and non-HTTPS evidence URLs fail closed.
- Unknown states, including any direct `PASSED` or `APPROVED` state, fail closed.

## Files

- Create: `docs/quality/c12-deploy-real-environment-pending-2026-10-28.json`
- Create: `scripts/check-c12-deploy-pending.mjs`
- Create: `tests/c12-deploy-real-environment.test.mjs`
- Modify: `docs/backlog-do-produto.md`

## Non-goals

- Do not access `192.168.40.84` from CI.
- Do not create production approval automatically.
- Do not change deploy scripts, Nginx or database bootstrap behavior in this increment.
- Do not merge historical deployment branches into current `main`.
