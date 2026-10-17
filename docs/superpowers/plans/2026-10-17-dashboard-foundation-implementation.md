# Dashboard foundation implementation increment

Follow-up to the planning-only PR #242. API foundations only; no dashboards UI yet.

- `GET /api/v1/dashboards/catalog`: fixed metrics, labels, units and permission
- `GET /api/v1/dashboards/volume`: active companies, contacts, opportunities and activities in one tenant-scoped repeatable-read snapshot, with 800/1,000 observation thresholds
- Existing `reports.read` permission; only normal user sessions accepted pending break-glass (API keys and superusers rejected)
- Reject query parameters, cross-tenant overrides and malformed tenant context before opening Prisma transactions
- No raw SQL, user-selected calculations, personal data lists or data purge changes

## Review and release gates

Not Gate 0 approval. Still pending: PostgreSQL RLS integration/E2E with three tenants, full CI, QA Docker verification, break-glass MFA/dual approval, legal retention assessment, masking and sharing model.

The earlier planning PR #242 CI failed before checkout because the PostgreSQL image registry returned `toomanyrequests: Data limit exceeded`. This is infrastructure failure, **not** a passing source test.
