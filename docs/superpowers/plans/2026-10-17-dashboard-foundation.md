# Dashboard foundation implementation plan

**Goal:** implement the first safe increment of Phase 0 from the supplied dashboard specification.
**Spec:** Dashboard module specification supplied by the project owner on 2026-10-17. The original attachment is not included in this planning-only PR.
**Architecture:** reuse NestJS authentication, effective permissions, Prisma tenant transactions and PostgreSQL RLS. `organizationId` is the existing equivalent of `tenant_id`; no duplicate identity column.
**Tech Stack:** NestJS, TypeScript, Prisma, PostgreSQL.

## Scope and constraints

This increment covers F0-02, the initial F0-07 catalogue and tenant volume monitoring. Existing ADMIN/MANAGER report permissions remain unchanged; SELLER/VIEWER access and sharing require a separate permission design. No global superuser override: new dashboard endpoints reject superusers until break-glass is implemented. This increment accepts browser sessions only: API-key authentication currently clears the superuser attribute, so keys cannot safely satisfy that restriction. No audit purge is enabled: current CRM retention concerns expired operation previews only. The 1,000-record volume is an observation threshold for the sum of active companies, contacts, opportunities and activities, not a write limit.

## Tasks

- [ ] Add runtime tenant validation before starting Prisma tenant or maintenance transactions. Test missing, empty, padded and non-string IDs and valid UUID/text IDs.
- [ ] Add a semantic catalogue with fixed metric IDs, labels, permissions and units; no SQL expressions accepted. Add authenticated GET /dashboards/catalog and /dashboards/volume with no query parameters, reports.read required and superusers denied pending break-glass.
- [ ] Measure active record counts only within the authenticated tenant; return volume alerts at 800 and 1,000 and query duration. Use existing RLS plus explicit organizationId predicates. Test isolation for three tenants, missing authentication, reduced API-key permissions, forged tenant parameters and failed database calls.
- [ ] Run focused tests, typecheck and repository gates; document unavailable integration evidence. Submit a draft PR; do not merge or claim Gate 0 approval.

## Review focus

Tenant context must fail before any database work; effective permissions must win over role; no personal records in volume results; no cross-tenant target accepted; no claim that operational/legal gates are complete.

## Deferred gates

F0-01 full dashboard roles/shares; F0-03 real database isolation evidence; F0-04 complete break-glass (second approver, MFA, alerts, expiry/revocation, review); F0-05 cross-tenant auditing; F0-06 masking; all phases 1–4. Approval identities and notification channels must be configured before enabling break-glass. Gate 0 requires Jefferson's decision and the legal retention assessment specified by the source.

## Execution evidence (2026-10-17)

- Implemented runtime tenant validation in normal and maintenance transactions.
- Implemented authenticated catalogue and tenant volume endpoints. Initial catalogue contains four active-record count metrics; dimensions and commercial calculated metrics remain future work.
- Focused tests: 17 passing. API TypeScript check: passing after Prisma generation.
- Independent review found API-key principals erase the superuser flag. Added failing regression, then denied API keys for these new endpoints; regression passes. Existing integration endpoints are unchanged.
- Repository suite: 67 passing, one blocked (`compose defines the Cycle 0 service topology`: Docker executable unavailable).
- API full suite attempted, failed on missing database environment/restricted PostgreSQL role and terminated before completion. Real database isolation and HTTP end-to-end evidence remain outstanding.
- Local runtime is Node 24.19.0, below the repository's pinned 24.20.x. CI on the pinned runtime is still required.
- The owner authorized publication of the planning material. This PR publishes only this plan; implementation code and the original attachment remain outside its scope.
