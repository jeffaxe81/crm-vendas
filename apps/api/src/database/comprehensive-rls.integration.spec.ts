import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";

/**
 * PHASE 2.1: Comprehensive RLS Coverage
 * Tests Row-Level Security isolation for all 8 tenant-scoped relationship tables.
 *
 * Tables tested:
 * 1. CompanyContact - link between Company and Contact
 * 2. CompanyTag - link between Company and Tag
 * 3. ContactTag - link between Contact and Tag
 * 4. Tag - tag reference data
 * 5. CustomFieldDefinition - metadata for custom fields
 * 6. CompanyCustomFieldValue - custom field values for companies
 * 7. ContactCustomFieldValue - custom field values for contacts
 * 8. RelationshipEntry - activity log for relationships
 */

describe("Comprehensive RLS integration - relationship tables", () => {
  let prisma: PrismaService;
  let admin: PrismaClient;

  beforeAll(() => {
    process.env.NODE_ENV ??= "test";
    process.env.PORT ??= "3001";
    process.env.LOG_LEVEL ??= "info";
    process.env.DATABASE_URL ??=
      "postgresql://axes_app:axes_app@localhost:5432/axes_crm";

    prisma = new PrismaService();
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

  describe("CompanyContact (link table)", () => {
    it("fails closed without tenant context and isolates across tenants", async () => {
      const orgA = "a0000000-0000-4000-8000-000000000001";
      const orgB = "a0000000-0000-4000-8000-000000000002";
      const userA = "a1000000-0000-4000-8000-000000000001";
      const companyA = "a2000000-0000-4000-8000-000000000001";
      const companyB = "a2000000-0000-4000-8000-000000000002";
      const contactA = "a3000000-0000-4000-8000-000000000001";
      const contactB = "a3000000-0000-4000-8000-000000000002";
      const linkA = "a4000000-0000-4000-8000-000000000001";
      const linkB = "a4000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a" },
          { id: orgB, name: "Org B", slug: "org-b" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-a@test",
          emailNormalized: "user-a@test",
          displayName: "User A",
          passwordHash: "hash",
        },
      });
      await admin.company.createMany({
        data: [
          {
            id: companyA,
            organizationId: orgA,
            legalName: "Co A",
            createdBy: userA,
            updatedBy: userA,
          },
          {
            id: companyB,
            organizationId: orgB,
            legalName: "Co B",
            createdBy: userA,
            updatedBy: userA,
          },
        ],
      });
      await admin.contact.createMany({
        data: [
          {
            id: contactA,
            organizationId: orgA,
            givenName: "Alice",
            createdBy: userA,
            updatedBy: userA,
          },
          {
            id: contactB,
            organizationId: orgB,
            givenName: "Bob",
            createdBy: userA,
            updatedBy: userA,
          },
        ],
      });
      await admin.companyContact.createMany({
        data: [
          {
            id: linkA,
            organizationId: orgA,
            companyId: companyA,
            contactId: contactA,
            isPrimary: true,
          },
          {
            id: linkB,
            organizationId: orgB,
            companyId: companyB,
            contactId: contactB,
            isPrimary: true,
          },
        ],
      });

      // SECURITY: Without tenant context, should return empty
      await expect(prisma.companyContact.findMany()).resolves.toEqual([]);

      // SECURITY: With tenant context, see only own org data
      const linksA = await prisma.withTenant(orgA, tenant =>
        tenant.companyContact.findMany()
      );
      expect(linksA).toHaveLength(1);
      expect(linksA[0]?.id).toBe(linkA);

      const linksB = await prisma.withTenant(orgB, tenant =>
        tenant.companyContact.findMany()
      );
      expect(linksB).toHaveLength(1);
      expect(linksB[0]?.id).toBe(linkB);
    });

    it("rejects cross-tenant writes via foreign key constraints", async () => {
      const orgA = "b0000000-0000-4000-8000-000000000001";
      const orgB = "b0000000-0000-4000-8000-000000000002";
      const userA = "b1000000-0000-4000-8000-000000000001";
      const companyA = "b2000000-0000-4000-8000-000000000001";
      const contactB = "b3000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a-fk" },
          { id: orgB, name: "Org B", slug: "org-b-fk" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-fk@test",
          emailNormalized: "user-fk@test",
          displayName: "User FK",
          passwordHash: "hash",
        },
      });
      await admin.company.create({
        data: {
          id: companyA,
          organizationId: orgA,
          legalName: "Co A",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.contact.create({
        data: {
          id: contactB,
          organizationId: orgB,
          givenName: "Bob",
          createdBy: userA,
          updatedBy: userA,
        },
      });

      // SECURITY: Try to create link across tenants (company from org A, contact from org B)
      await expect(
        prisma.withTenant(orgA, tenant =>
          tenant.companyContact.create({
            data: {
              organizationId: orgA,
              companyId: companyA,
              contactId: contactB, // ← Cross-tenant reference
              isPrimary: true,
            },
          })
        )
      ).rejects.toThrow("P2003"); // Foreign key constraint
    });
  });

  describe("CompanyTag (link table)", () => {
    it("fails closed and isolates across tenants", async () => {
      const orgA = "c0000000-0000-4000-8000-000000000001";
      const orgB = "c0000000-0000-4000-8000-000000000002";
      const userA = "c1000000-0000-4000-8000-000000000001";
      const companyA = "c2000000-0000-4000-8000-000000000001";
      const tagA = "c5000000-0000-4000-8000-000000000001";
      const tagB = "c5000000-0000-4000-8000-000000000002";
      const linkA = "c6000000-0000-4000-8000-000000000001";
      const linkB = "c6000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a-tag" },
          { id: orgB, name: "Org B", slug: "org-b-tag" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-tag@test",
          emailNormalized: "user-tag@test",
          displayName: "User Tag",
          passwordHash: "hash",
        },
      });
      await admin.company.create({
        data: {
          id: companyA,
          organizationId: orgA,
          legalName: "Co A",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.tag.createMany({
        data: [
          {
            id: tagA,
            organizationId: orgA,
            name: "Tag A",
            color: "#FF0000",
            createdBy: userA,
            updatedBy: userA,
          },
          {
            id: tagB,
            organizationId: orgB,
            name: "Tag B",
            color: "#00FF00",
            createdBy: userA,
            updatedBy: userA,
          },
        ],
      });
      await admin.companyTag.createMany({
        data: [
          {
            id: linkA,
            organizationId: orgA,
            companyId: companyA,
            tagId: tagA,
          },
          {
            id: linkB,
            organizationId: orgB,
            companyId: "c2000000-0000-4000-8000-000000000002", // fake company B
            tagId: tagB,
          },
        ],
      });

      // SECURITY: Without tenant context, should return empty
      await expect(prisma.companyTag.findMany()).resolves.toEqual([]);

      // SECURITY: With tenant context, see only own org data
      const tagsA = await prisma.withTenant(orgA, tenant =>
        tenant.companyTag.findMany()
      );
      expect(tagsA).toHaveLength(1);
      expect(tagsA[0]?.id).toBe(linkA);
    });
  });

  describe("ContactTag (link table)", () => {
    it("fails closed and isolates across tenants", async () => {
      const orgA = "d0000000-0000-4000-8000-000000000001";
      const orgB = "d0000000-0000-4000-8000-000000000002";
      const userA = "d1000000-0000-4000-8000-000000000001";
      const contactA = "d3000000-0000-4000-8000-000000000001";
      const tagA = "d5000000-0000-4000-8000-000000000001";
      const linkA = "d7000000-0000-4000-8000-000000000001";
      const linkB = "d7000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a-ctag" },
          { id: orgB, name: "Org B", slug: "org-b-ctag" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-ctag@test",
          emailNormalized: "user-ctag@test",
          displayName: "User CTag",
          passwordHash: "hash",
        },
      });
      await admin.contact.create({
        data: {
          id: contactA,
          organizationId: orgA,
          givenName: "Alice",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.tag.create({
        data: {
          id: tagA,
          organizationId: orgA,
          name: "Tag A",
          color: "#FF0000",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.contactTag.createMany({
        data: [
          {
            id: linkA,
            organizationId: orgA,
            contactId: contactA,
            tagId: tagA,
          },
          {
            id: linkB,
            organizationId: orgB,
            contactId: "d3000000-0000-4000-8000-000000000002",
            tagId: "d5000000-0000-4000-8000-000000000002",
          },
        ],
      });

      // SECURITY: Without tenant context, should return empty
      await expect(prisma.contactTag.findMany()).resolves.toEqual([]);

      // SECURITY: With tenant context, see only own org data
      const tagsA = await prisma.withTenant(orgA, tenant =>
        tenant.contactTag.findMany()
      );
      expect(tagsA).toHaveLength(1);
      expect(tagsA[0]?.id).toBe(linkA);
    });
  });

  describe("Tag (reference data)", () => {
    it("fails closed and isolates across tenants", async () => {
      const orgA = "e0000000-0000-4000-8000-000000000001";
      const orgB = "e0000000-0000-4000-8000-000000000002";
      const userA = "e1000000-0000-4000-8000-000000000001";
      const tagA = "e5000000-0000-4000-8000-000000000001";
      const tagB = "e5000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a-ref-tag" },
          { id: orgB, name: "Org B", slug: "org-b-ref-tag" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-ref-tag@test",
          emailNormalized: "user-ref-tag@test",
          displayName: "User Ref Tag",
          passwordHash: "hash",
        },
      });
      await admin.tag.createMany({
        data: [
          {
            id: tagA,
            organizationId: orgA,
            name: "Tag A",
            color: "#FF0000",
            createdBy: userA,
            updatedBy: userA,
          },
          {
            id: tagB,
            organizationId: orgB,
            name: "Tag B",
            color: "#00FF00",
            createdBy: userA,
            updatedBy: userA,
          },
        ],
      });

      // SECURITY: Without tenant context, should return empty
      await expect(prisma.tag.findMany()).resolves.toEqual([]);

      // SECURITY: With tenant context, see only own org data
      const tagsA = await prisma.withTenant(orgA, tenant =>
        tenant.tag.findMany()
      );
      expect(tagsA).toHaveLength(1);
      expect(tagsA[0]?.id).toBe(tagA);
    });
  });

  describe("CustomFieldDefinition (metadata)", () => {
    it("fails closed and isolates across tenants", async () => {
      const orgA = "f0000000-0000-4000-8000-000000000001";
      const orgB = "f0000000-0000-4000-8000-000000000002";
      const userA = "f1000000-0000-4000-8000-000000000001";
      const defA = "f8000000-0000-4000-8000-000000000001";
      const defB = "f8000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a-cfd" },
          { id: orgB, name: "Org B", slug: "org-b-cfd" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-cfd@test",
          emailNormalized: "user-cfd@test",
          displayName: "User CFD",
          passwordHash: "hash",
        },
      });
      await admin.customFieldDefinition.createMany({
        data: [
          {
            id: defA,
            organizationId: orgA,
            label: "Phone Ext",
            type: "TEXT",
            targetType: "COMPANY",
            createdBy: userA,
            updatedBy: userA,
          },
          {
            id: defB,
            organizationId: orgB,
            label: "Website",
            type: "URL",
            targetType: "COMPANY",
            createdBy: userA,
            updatedBy: userA,
          },
        ],
      });

      // SECURITY: Without tenant context, should return empty
      await expect(prisma.customFieldDefinition.findMany()).resolves.toEqual(
        []
      );

      // SECURITY: With tenant context, see only own org data
      const defsA = await prisma.withTenant(orgA, tenant =>
        tenant.customFieldDefinition.findMany()
      );
      expect(defsA).toHaveLength(1);
      expect(defsA[0]?.id).toBe(defA);
    });
  });

  describe("CompanyCustomFieldValue (values)", () => {
    it("fails closed and isolates across tenants", async () => {
      const orgA = "g0000000-0000-4000-8000-000000000001";
      const orgB = "g0000000-0000-4000-8000-000000000002";
      const userA = "g1000000-0000-4000-8000-000000000001";
      const companyA = "g2000000-0000-4000-8000-000000000001";
      const defA = "g8000000-0000-4000-8000-000000000001";
      const valueA = "g9000000-0000-4000-8000-000000000001";
      const valueB = "g9000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a-ccfv" },
          { id: orgB, name: "Org B", slug: "org-b-ccfv" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-ccfv@test",
          emailNormalized: "user-ccfv@test",
          displayName: "User CCFV",
          passwordHash: "hash",
        },
      });
      await admin.company.create({
        data: {
          id: companyA,
          organizationId: orgA,
          legalName: "Co A",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.customFieldDefinition.create({
        data: {
          id: defA,
          organizationId: orgA,
          label: "Phone",
          type: "TEXT",
          targetType: "COMPANY",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.companyCustomFieldValue.createMany({
        data: [
          {
            id: valueA,
            organizationId: orgA,
            companyId: companyA,
            definitionId: defA,
            value: "555-1234",
          },
          {
            id: valueB,
            organizationId: orgB,
            companyId: "g2000000-0000-4000-8000-000000000002",
            definitionId: "g8000000-0000-4000-8000-000000000002",
            value: "555-5678",
          },
        ],
      });

      // SECURITY: Without tenant context, should return empty
      await expect(prisma.companyCustomFieldValue.findMany()).resolves.toEqual(
        []
      );

      // SECURITY: With tenant context, see only own org data
      const valuesA = await prisma.withTenant(orgA, tenant =>
        tenant.companyCustomFieldValue.findMany()
      );
      expect(valuesA).toHaveLength(1);
      expect(valuesA[0]?.id).toBe(valueA);
    });
  });

  describe("ContactCustomFieldValue (values)", () => {
    it("fails closed and isolates across tenants", async () => {
      const orgA = "h0000000-0000-4000-8000-000000000001";
      const orgB = "h0000000-0000-4000-8000-000000000002";
      const userA = "h1000000-0000-4000-8000-000000000001";
      const contactA = "h3000000-0000-4000-8000-000000000001";
      const defA = "h8000000-0000-4000-8000-000000000001";
      const valueA = "ha000000-0000-4000-8000-000000000001";
      const valueB = "ha000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a-conctfv" },
          { id: orgB, name: "Org B", slug: "org-b-conctfv" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-conctfv@test",
          emailNormalized: "user-conctfv@test",
          displayName: "User ConctFV",
          passwordHash: "hash",
        },
      });
      await admin.contact.create({
        data: {
          id: contactA,
          organizationId: orgA,
          givenName: "Alice",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.customFieldDefinition.create({
        data: {
          id: defA,
          organizationId: orgA,
          label: "Phone",
          type: "TEXT",
          targetType: "CONTACT",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.contactCustomFieldValue.createMany({
        data: [
          {
            id: valueA,
            organizationId: orgA,
            contactId: contactA,
            definitionId: defA,
            value: "555-1234",
          },
          {
            id: valueB,
            organizationId: orgB,
            contactId: "h3000000-0000-4000-8000-000000000002",
            definitionId: "h8000000-0000-4000-8000-000000000002",
            value: "555-5678",
          },
        ],
      });

      // SECURITY: Without tenant context, should return empty
      await expect(
        prisma.contactCustomFieldValue.findMany()
      ).resolves.toEqual([]);

      // SECURITY: With tenant context, see only own org data
      const valuesA = await prisma.withTenant(orgA, tenant =>
        tenant.contactCustomFieldValue.findMany()
      );
      expect(valuesA).toHaveLength(1);
      expect(valuesA[0]?.id).toBe(valueA);
    });
  });

  describe("RelationshipEntry (activity log)", () => {
    it("fails closed and isolates across tenants", async () => {
      const orgA = "i0000000-0000-4000-8000-000000000001";
      const orgB = "i0000000-0000-4000-8000-000000000002";
      const userA = "i1000000-0000-4000-8000-000000000001";
      const companyA = "i2000000-0000-4000-8000-000000000001";
      const contactA = "i3000000-0000-4000-8000-000000000001";
      const entryA = "ib000000-0000-4000-8000-000000000001";
      const entryB = "ib000000-0000-4000-8000-000000000002";

      await admin.organization.createMany({
        data: [
          { id: orgA, name: "Org A", slug: "org-a-rel" },
          { id: orgB, name: "Org B", slug: "org-b-rel" },
        ],
      });
      await admin.user.create({
        data: {
          id: userA,
          email: "user-rel@test",
          emailNormalized: "user-rel@test",
          displayName: "User Rel",
          passwordHash: "hash",
        },
      });
      await admin.company.create({
        data: {
          id: companyA,
          organizationId: orgA,
          legalName: "Co A",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.contact.create({
        data: {
          id: contactA,
          organizationId: orgA,
          givenName: "Alice",
          createdBy: userA,
          updatedBy: userA,
        },
      });
      await admin.relationshipEntry.createMany({
        data: [
          {
            id: entryA,
            organizationId: orgA,
            companyId: companyA,
            contactId: contactA,
            type: "NOTE",
            content: "Follow up next week",
            authorUserId: userA,
          },
          {
            id: entryB,
            organizationId: orgB,
            companyId: "i2000000-0000-4000-8000-000000000002",
            contactId: "i3000000-0000-4000-8000-000000000002",
            type: "CALL",
            content: "Discussed partnership",
            authorUserId: userA,
          },
        ],
      });

      // SECURITY: Without tenant context, should return empty
      await expect(prisma.relationshipEntry.findMany()).resolves.toEqual([]);

      // SECURITY: With tenant context, see only own org data
      const entriesA = await prisma.withTenant(orgA, tenant =>
        tenant.relationshipEntry.findMany()
      );
      expect(entriesA).toHaveLength(1);
      expect(entriesA[0]?.id).toBe(entryA);
    });
  });
});
