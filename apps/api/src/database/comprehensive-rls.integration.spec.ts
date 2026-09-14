import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";

describe("Issue #40 — comprehensive relationship RLS", () => {
  let prisma: PrismaService;
  let admin: PrismaClient;

  beforeAll(() => {
    process.env.NODE_ENV ??= "test";
    process.env.PORT ??= "3001";
    process.env.LOG_LEVEL ??= "info";
    process.env.DATABASE_URL ??=
      "postgresql://axes:axes@localhost:5432/axes_crm";

    prisma = new PrismaService(process.env.RLS_DATABASE_URL);
    admin = new PrismaClient({
      adapter: new PrismaPg({
        connectionString:
          process.env.MIGRATION_DATABASE_URL ??
          "postgresql://axes:axes@localhost:5432/axes_crm",
      }),
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await admin.$disconnect();
  });

  it("fails closed and isolates all relationship tables between two tenants", async () => {
    const orgA = "71000000-0000-4000-8000-000000000001";
    const orgB = "71000000-0000-4000-8000-000000000002";
    const userId = "72000000-0000-4000-8000-000000000001";
    const companyA = "73000000-0000-4000-8000-000000000001";
    const companyB = "73000000-0000-4000-8000-000000000002";
    const contactA = "74000000-0000-4000-8000-000000000001";
    const contactB = "74000000-0000-4000-8000-000000000002";
    const tagA = "75000000-0000-4000-8000-000000000001";
    const tagB = "75000000-0000-4000-8000-000000000002";
    const companyDefA = "76000000-0000-4000-8000-000000000001";
    const companyDefB = "76000000-0000-4000-8000-000000000002";
    const contactDefA = "76100000-0000-4000-8000-000000000001";
    const contactDefB = "76100000-0000-4000-8000-000000000002";
    const companyContactA = "77000000-0000-4000-8000-000000000001";
    const companyContactB = "77000000-0000-4000-8000-000000000002";
    const companyTagA = "77100000-0000-4000-8000-000000000001";
    const companyTagB = "77100000-0000-4000-8000-000000000002";
    const contactTagA = "77200000-0000-4000-8000-000000000001";
    const contactTagB = "77200000-0000-4000-8000-000000000002";
    const companyValueA = "77300000-0000-4000-8000-000000000001";
    const companyValueB = "77300000-0000-4000-8000-000000000002";
    const contactValueA = "77400000-0000-4000-8000-000000000001";
    const contactValueB = "77400000-0000-4000-8000-000000000002";
    const entryA = "77500000-0000-4000-8000-000000000001";
    const entryB = "77500000-0000-4000-8000-000000000002";

    await admin.organization.createMany({
      data: [
        {
          id: orgA,
          name: "Comprehensive RLS A",
          slug: "comprehensive-rls-a",
        },
        {
          id: orgB,
          name: "Comprehensive RLS B",
          slug: "comprehensive-rls-b",
        },
      ],
    });
    await admin.user.create({
      data: {
        id: userId,
        email: "comprehensive-rls@example.test",
        emailNormalized: "comprehensive-rls@example.test",
        displayName: "Comprehensive RLS User",
        passwordHash: "not-used-by-this-test",
      },
    });
    await admin.company.createMany({
      data: [
        {
          id: companyA,
          organizationId: orgA,
          legalName: "Company A",
          createdBy: userId,
          updatedBy: userId,
        },
        {
          id: companyB,
          organizationId: orgB,
          legalName: "Company B",
          createdBy: userId,
          updatedBy: userId,
        },
      ],
    });
    await admin.contact.createMany({
      data: [
        {
          id: contactA,
          organizationId: orgA,
          fullName: "Contact A",
          createdBy: userId,
          updatedBy: userId,
        },
        {
          id: contactB,
          organizationId: orgB,
          fullName: "Contact B",
          createdBy: userId,
          updatedBy: userId,
        },
      ],
    });
    await admin.tag.createMany({
      data: [
        {
          id: tagA,
          organizationId: orgA,
          name: "Tag A",
          normalizedName: "tag a",
        },
        {
          id: tagB,
          organizationId: orgB,
          name: "Tag B",
          normalizedName: "tag b",
        },
      ],
    });
    await admin.customFieldDefinition.createMany({
      data: [
        {
          id: companyDefA,
          organizationId: orgA,
          scope: "COMPANY",
          key: "company_key_a",
          label: "Company field A",
          type: "TEXT",
        },
        {
          id: companyDefB,
          organizationId: orgB,
          scope: "COMPANY",
          key: "company_key_b",
          label: "Company field B",
          type: "TEXT",
        },
        {
          id: contactDefA,
          organizationId: orgA,
          scope: "CONTACT",
          key: "contact_key_a",
          label: "Contact field A",
          type: "TEXT",
        },
        {
          id: contactDefB,
          organizationId: orgB,
          scope: "CONTACT",
          key: "contact_key_b",
          label: "Contact field B",
          type: "TEXT",
        },
      ],
    });
    await admin.companyContact.createMany({
      data: [
        {
          id: companyContactA,
          organizationId: orgA,
          companyId: companyA,
          contactId: contactA,
        },
        {
          id: companyContactB,
          organizationId: orgB,
          companyId: companyB,
          contactId: contactB,
        },
      ],
    });
    await admin.companyTag.createMany({
      data: [
        {
          id: companyTagA,
          organizationId: orgA,
          companyId: companyA,
          tagId: tagA,
        },
        {
          id: companyTagB,
          organizationId: orgB,
          companyId: companyB,
          tagId: tagB,
        },
      ],
    });
    await admin.contactTag.createMany({
      data: [
        {
          id: contactTagA,
          organizationId: orgA,
          contactId: contactA,
          tagId: tagA,
        },
        {
          id: contactTagB,
          organizationId: orgB,
          contactId: contactB,
          tagId: tagB,
        },
      ],
    });
    await admin.companyCustomFieldValue.createMany({
      data: [
        {
          id: companyValueA,
          organizationId: orgA,
          companyId: companyA,
          definitionId: companyDefA,
          value: "Value A",
        },
        {
          id: companyValueB,
          organizationId: orgB,
          companyId: companyB,
          definitionId: companyDefB,
          value: "Value B",
        },
      ],
    });
    await admin.contactCustomFieldValue.createMany({
      data: [
        {
          id: contactValueA,
          organizationId: orgA,
          contactId: contactA,
          definitionId: contactDefA,
          value: "Value A",
        },
        {
          id: contactValueB,
          organizationId: orgB,
          contactId: contactB,
          definitionId: contactDefB,
          value: "Value B",
        },
      ],
    });
    await admin.relationshipEntry.createMany({
      data: [
        {
          id: entryA,
          organizationId: orgA,
          companyId: companyA,
          contactId: contactA,
          authorUserId: userId,
          kind: "NOTE",
          content: "Tenant A note",
          occurredAt: new Date("2026-09-13T12:00:00Z"),
        },
        {
          id: entryB,
          organizationId: orgB,
          companyId: companyB,
          contactId: contactB,
          authorUserId: userId,
          kind: "NOTE",
          content: "Tenant B note",
          occurredAt: new Date("2026-09-13T12:00:00Z"),
        },
      ],
    });

    await expect(prisma.companyContact.findMany()).resolves.toEqual([]);
    await expect(prisma.companyTag.findMany()).resolves.toEqual([]);
    await expect(prisma.contactTag.findMany()).resolves.toEqual([]);
    await expect(prisma.tag.findMany()).resolves.toEqual([]);
    await expect(prisma.customFieldDefinition.findMany()).resolves.toEqual([]);
    await expect(prisma.companyCustomFieldValue.findMany()).resolves.toEqual(
      []
    );
    await expect(prisma.contactCustomFieldValue.findMany()).resolves.toEqual(
      []
    );
    await expect(prisma.relationshipEntry.findMany()).resolves.toEqual([]);

    const tenantA = await prisma.withTenant(orgA, async tenant =>
      Promise.all([
        tenant.companyContact.findMany({ select: { id: true } }),
        tenant.companyTag.findMany({ select: { id: true } }),
        tenant.contactTag.findMany({ select: { id: true } }),
        tenant.tag.findMany({ select: { id: true } }),
        tenant.customFieldDefinition.findMany({ select: { id: true } }),
        tenant.companyCustomFieldValue.findMany({ select: { id: true } }),
        tenant.contactCustomFieldValue.findMany({ select: { id: true } }),
        tenant.relationshipEntry.findMany({ select: { id: true } }),
      ])
    );

    expect(tenantA).toEqual([
      [{ id: companyContactA }],
      [{ id: companyTagA }],
      [{ id: contactTagA }],
      [{ id: tagA }],
      expect.arrayContaining([{ id: companyDefA }, { id: contactDefA }]),
      [{ id: companyValueA }],
      [{ id: contactValueA }],
      [{ id: entryA }],
    ]);

    const tenantB = await prisma.withTenant(orgB, async tenant =>
      Promise.all([
        tenant.companyContact.findMany({ select: { id: true } }),
        tenant.companyTag.findMany({ select: { id: true } }),
        tenant.contactTag.findMany({ select: { id: true } }),
        tenant.tag.findMany({ select: { id: true } }),
        tenant.customFieldDefinition.findMany({ select: { id: true } }),
        tenant.companyCustomFieldValue.findMany({ select: { id: true } }),
        tenant.contactCustomFieldValue.findMany({ select: { id: true } }),
        tenant.relationshipEntry.findMany({ select: { id: true } }),
      ])
    );

    expect(tenantB).toEqual([
      [{ id: companyContactB }],
      [{ id: companyTagB }],
      [{ id: contactTagB }],
      [{ id: tagB }],
      expect.arrayContaining([{ id: companyDefB }, { id: contactDefB }]),
      [{ id: companyValueB }],
      [{ id: contactValueB }],
      [{ id: entryB }],
    ]);
  });

  it("rejects a relationship row that points to an entity from another tenant", async () => {
    const orgA = "78000000-0000-4000-8000-000000000001";
    const orgB = "78000000-0000-4000-8000-000000000002";
    const userId = "78100000-0000-4000-8000-000000000001";
    const companyA = "78200000-0000-4000-8000-000000000001";
    const contactB = "78300000-0000-4000-8000-000000000002";

    await admin.organization.createMany({
      data: [
        {
          id: orgA,
          name: "Integrity Tenant A",
          slug: "integrity-tenant-a",
        },
        {
          id: orgB,
          name: "Integrity Tenant B",
          slug: "integrity-tenant-b",
        },
      ],
    });
    await admin.user.create({
      data: {
        id: userId,
        email: "integrity-rls@example.test",
        emailNormalized: "integrity-rls@example.test",
        displayName: "Integrity RLS User",
        passwordHash: "not-used-by-this-test",
      },
    });
    await admin.company.create({
      data: {
        id: companyA,
        organizationId: orgA,
        legalName: "Integrity Company A",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await admin.contact.create({
      data: {
        id: contactB,
        organizationId: orgB,
        fullName: "Integrity Contact B",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await expect(
      prisma.withTenant(orgA, tenant =>
        tenant.companyContact.create({
          data: {
            organizationId: orgA,
            companyId: companyA,
            contactId: contactB,
          },
        })
      )
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
