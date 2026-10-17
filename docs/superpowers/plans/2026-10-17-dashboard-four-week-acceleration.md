# CRM dashboard — four-week roadmap acceleration (2026-10-17)

This pull request advances the next **four planned weekly workstreams** as a bounded, reviewable increment. It does **not** represent four elapsed weeks of work or production approval.

## Dependency

Stacked on PR #245 (dashboard API foundation and three-tenant RLS tests), which remains draft. Do not deploy or merge this PR independently of that reviewed foundation.

## Incremental weekly scope

| Workstream | Deliverable | Evidence |
| --- | --- | --- |
| Week 1 — typed data contract | Validate closed metric catalog and volume response, reject malformed data | Contracts schemas + contract tests |
| Week 2 — read-only UX | Expose a dedicated `Volume de dados` tab inside existing management reporting | Responsive four-metric cards, manual refresh, empty/error/loading states |
| Week 3 — tenant and cache security | Never display stale numbers after credential changes; disable HTTP/browser cache | Keyed tenant remount, request cancellation guard, no-store HTTP headers, simulated delayed-response tests |
| Week 4 — hardening and release handoff | Verify role restriction, RLS, HTTP E2E, browser test and Docker builds | PR CI evidence and manual QA checklist |

## Acceptance criteria

1. Only a human session with effective `reports.read` can read API data; API keys and global superusers denied until an approved break-glass process exists.
2. Requests never take tenant from URL/query, and persisted UI cannot leak another organization's counts.
3. Catalog is fixed to four active-record metrics; no arbitrary SQL, filters or custom calculations.
4. `800` / `1000` thresholds are **informational**, not storage allocations, quotas, billing or automatic deletion triggers.
5. Refresh failures do not silently show the old snapshot as current. No personally identifying rows in dashboard payloads.
6. Test output and deployment checklist do not contain credentials or tenant personal data.

## Manual operational QA, still pending after CI

- [ ] Test on an isolated Docker staging server, not production; validate restricted PostgreSQL role and three independent tenants
- [ ] Verify mobile/desktop layout, keyboard accessibility, loading/error/offline behavior, retry and refresh
- [ ] Sign in as different organizations in consecutive sessions; confirm no flash of the preceding tenant's counts
- [ ] Verify API responses contain `Cache-Control: private, no-store` with a proxy in front of the server
- [ ] Verify 800 and 1000 count thresholds are not presented as hard caps and do not affect record creation
- [ ] Verify automatic backups, tenant retention, tenant capacity and expurgo flows remain unchanged
- [ ] Record owner/QA/security approvals, retention/legal review and Gate 0 break-glass/MFA/dual authorization decisions

## Release decision

CI success alone is not Gate 0 approval. Both PR #245 and this stacked PR remain drafts until security and operational evidence is signed off. No automatic production deployment or merge is authorized by this plan.
