-- Issue #40: enforce tenant-aware referential integrity for company-contact links.
-- Existing inconsistent rows intentionally make this migration fail instead of being rewritten silently.
-- The existing FORCE ROW LEVEL SECURITY policy remains unchanged; these FKs complement it at referential-integrity level.

ALTER TABLE "company_contacts"
  DROP CONSTRAINT IF EXISTS "company_contacts_company_id_fkey",
  DROP CONSTRAINT IF EXISTS "company_contacts_contact_id_fkey";

ALTER TABLE "company_contacts"
  ADD CONSTRAINT "company_contacts_company_org_fkey"
  FOREIGN KEY ("company_id", "organization_id")
  REFERENCES "companies"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "company_contacts_contact_org_fkey"
  FOREIGN KEY ("contact_id", "organization_id")
  REFERENCES "contacts"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
