import { randomUUID } from "node:crypto";

import { PrismaService } from "../database/prisma.service";

const expectedTables = [
  "companies",
  "contacts",
  "contact_channels",
  "company_contacts",
  "relationship_entries",
  "tags",
  "company_tags",
  "contact_tags",
  "custom_field_definitions",
  "company_custom_field_values",
  "contact_custom_field_values",
] as const;

describe("Cycle 2 CRM database schema", () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it("creates every CRM core table through versioned migrations", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = ANY(ARRAY[${expectedTables
           .map(table => `'${table}'`)
           .join(", ")}])
       ORDER BY tablename`
    );

    expect(rows.map(row => row.tablename).sort()).toEqual(
      [...expectedTables].sort()
    );
  });

  it("rejects duplicate company-contact links inside one organization", async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const companyId = randomUUID();
    const contactId = randomUUID();
    const membershipId = randomUUID();
    const suffix = organizationId.slice(0, 8);

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO organizations (id, name, slug)
         VALUES ('${organizationId}'::uuid, 'CRM Schema Org', 'crm-schema-${suffix}')`
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO users (id, email, email_normalized, display_name, password_hash)
         VALUES (
           '${userId}'::uuid,
           'schema-${suffix}@example.test',
           'schema-${suffix}@example.test',
           'Schema User',
           'not-used-by-this-test'
         )`
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO organization_memberships (id, organization_id, user_id, role)
         VALUES ('${membershipId}'::uuid, '${organizationId}'::uuid, '${userId}'::uuid, 'ADMIN')`
      );
      await prisma.withTenant(organizationId, tenant =>
        tenant.$executeRawUnsafe(
          `INSERT INTO companies (
             id, organization_id, legal_name, created_by, updated_by
           ) VALUES (
             '${companyId}'::uuid,
             '${organizationId}'::uuid,
             'Empresa Schema',
             '${userId}'::uuid,
             '${userId}'::uuid
           )`
        )
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO contacts (
           id, organization_id, full_name, created_by, updated_by
         ) VALUES (
           '${contactId}'::uuid,
           '${organizationId}'::uuid,
           'Contato Schema',
           '${userId}'::uuid,
           '${userId}'::uuid
         )`
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO company_contacts (
           organization_id, company_id, contact_id
         ) VALUES (
           '${organizationId}'::uuid,
           '${companyId}'::uuid,
           '${contactId}'::uuid
         )`
      );

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO company_contacts (
             organization_id, company_id, contact_id
           ) VALUES (
             '${organizationId}'::uuid,
             '${companyId}'::uuid,
             '${contactId}'::uuid
           )`
        )
      ).rejects.toThrow();
    } finally {
      await prisma
        .$executeRawUnsafe(
          `TRUNCATE TABLE
             contact_custom_field_values,
             company_custom_field_values,
             custom_field_definitions,
             contact_tags,
             company_tags,
             tags,
             relationship_entries,
             company_contacts,
             contact_channels,
             contacts,
             companies
           CASCADE`
        )
        .catch(() => undefined);
      await prisma
        .$executeRawUnsafe(
          `DELETE FROM organization_memberships WHERE id = '${membershipId}'::uuid`
        )
        .catch(() => undefined);
      await prisma
        .$executeRawUnsafe(`DELETE FROM users WHERE id = '${userId}'::uuid`)
        .catch(() => undefined);
      await prisma
        .$executeRawUnsafe(
          `DELETE FROM organizations WHERE id = '${organizationId}'::uuid`
        )
        .catch(() => undefined);
    }
  });
});
