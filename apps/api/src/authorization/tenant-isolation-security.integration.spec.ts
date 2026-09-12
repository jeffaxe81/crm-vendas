import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { ApiErrorFilter } from "../common/filters/api-error.filter";
import { PrismaService } from "../database/prisma.service";

/**
 * PHASE 2.2: Tenant Isolation Security Tests
 * Tests HTTP-level tenant isolation via endpoints.
 *
 * Validates:
 * 1. Cross-tenant company-contact unlink rejection
 * 2. Cross-tenant custom field value operations
 * 3. Cross-tenant tag operations
 * 4. Soft delete isolation (deletedAt not visible cross-tenant)
 * 5. Audit log isolation
 */

describe("Tenant isolation security - HTTP endpoints", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Company-Contact isolation", () => {
    it("rejects unlinking company-contact from different tenant", async () => {
      // Setup: Create two organizations with users and entities
      const orgA = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org A",
          organizationSlug: "org-a-unlink",
          email: "admin-a-unlink@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenA = orgA.body.accessToken;

      const orgB = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org B",
          organizationSlug: "org-b-unlink",
          email: "admin-b-unlink@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      // Create company in Org A
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          legalName: "Company A",
        })
        .expect(201);

      const companyId = companyRes.body.id;

      // Create contact in Org A
      const contactRes = await request(app.getHttpServer())
        .post("/api/v1/contacts")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          givenName: "Alice",
          email: "alice@test",
        })
        .expect(201);

      const contactId = contactRes.body.id;

      // Link them in Org A
      await request(app.getHttpServer())
        .post(`/api/v1/companies/${companyId}/contacts/${contactId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          isPrimary: true,
        })
        .expect(201);

      // SECURITY: Try to unlink with Org B token (should fail)
      // We try to unlink the company-contact pair, but the contactId is from Org A
      // so Org B's context should not find it
      const unlinkRes = await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}/contacts/${contactId}`)
        .set("Authorization", `Bearer ${orgB.body.accessToken}`)
        .expect(404);

      expect(unlinkRes.body.code).toBe("COMPANY_NOT_FOUND"); // Org B can't see company from Org A
    });
  });

  describe("Tag operations isolation", () => {
    it("rejects linking contact to tag from different tenant", async () => {
      const orgA = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org A Tag",
          organizationSlug: "org-a-tag-iso",
          email: "admin-a-tag@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenA = orgA.body.accessToken;

      // Create contact and tag in Org A
      const contactRes = await request(app.getHttpServer())
        .post("/api/v1/contacts")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          givenName: "Alice",
          email: "alice-tag@test",
        })
        .expect(201);

      const tagRes = await request(app.getHttpServer())
        .post("/api/v1/tags")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          name: "VIP",
          color: "#FF0000",
        })
        .expect(201);

      const contactId = contactRes.body.id;
      const tagId = tagRes.body.id;

      // Link successfully in Org A
      await request(app.getHttpServer())
        .post(`/api/v1/tags/${tagId}/contacts/${contactId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send()
        .expect(201);

      // SECURITY: Org B cannot unlink (doesn't see the entities)
      const orgB = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org B Tag",
          organizationSlug: "org-b-tag-iso",
          email: "admin-b-tag@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const unlinkRes = await request(app.getHttpServer())
        .delete(`/api/v1/tags/${tagId}/contacts/${contactId}`)
        .set("Authorization", `Bearer ${orgB.body.accessToken}`)
        .expect(404);

      expect(unlinkRes.body.code).toBe("TAG_NOT_FOUND");
    });
  });

  describe("Custom field operations isolation", () => {
    it("rejects setting company custom field value from different tenant", async () => {
      const orgA = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org A CFD",
          organizationSlug: "org-a-cfd-iso",
          email: "admin-a-cfd@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenA = orgA.body.accessToken;

      // Create company and field definition in Org A
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          legalName: "Company CFD",
        })
        .expect(201);

      const defRes = await request(app.getHttpServer())
        .post("/api/v1/custom-fields")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          label: "Phone Ext",
          type: "TEXT",
          targetType: "COMPANY",
        })
        .expect(201);

      const companyId = companyRes.body.id;
      const defId = defRes.body.id;

      // Set value in Org A
      await request(app.getHttpServer())
        .post(`/api/v1/companies/${companyId}/custom-fields/${defId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          value: "555-1234",
        })
        .expect(201);

      // SECURITY: Org B cannot modify (doesn't see company)
      const orgB = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org B CFD",
          organizationSlug: "org-b-cfd-iso",
          email: "admin-b-cfd@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const modifyRes = await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}/custom-fields/${defId}`)
        .set("Authorization", `Bearer ${orgB.body.accessToken}`)
        .expect(404);

      expect(modifyRes.body.code).toBe("COMPANY_NOT_FOUND");
    });
  });

  describe("Soft delete isolation", () => {
    it("does not expose deleted companies across tenants", async () => {
      const orgA = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org A Soft Delete",
          organizationSlug: "org-a-soft-del",
          email: "admin-a-softdel@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenA = orgA.body.accessToken;

      // Create and delete company in Org A
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          legalName: "Company to Delete",
        })
        .expect(201);

      const companyId = companyRes.body.id;

      // Delete in Org A
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(204);

      // Verify deleted in Org A
      await request(app.getHttpServer())
        .get(`/api/v1/companies/${companyId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(404);

      // SECURITY: Org B doesn't know about the deleted company
      const orgB = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org B Soft Delete",
          organizationSlug: "org-b-soft-del",
          email: "admin-b-softdel@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const viewRes = await request(app.getHttpServer())
        .get(`/api/v1/companies/${companyId}`)
        .set("Authorization", `Bearer ${orgB.body.accessToken}`)
        .expect(404);

      // Should fail because company doesn't exist in Org B (not because it's deleted)
      expect(viewRes.body.code).toBe("COMPANY_NOT_FOUND");
    });
  });

  describe("Audit log isolation", () => {
    it("does not expose audit logs from different tenant", async () => {
      const orgA = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org A Audit",
          organizationSlug: "org-a-audit-iso",
          email: "admin-a-audit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenA = orgA.body.accessToken;

      // Create company (generates audit log)
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          legalName: "Company Audit A",
        })
        .expect(201);

      // Get audit logs for Org A
      const auditA = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company&limit=10")
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(200);

      expect(auditA.body.data).toContainEqual(
        expect.objectContaining({
          entityId: companyRes.body.id,
          action: "company.created",
        })
      );

      // Create Org B and verify it sees no audit logs from Org A
      const orgB = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org B Audit",
          organizationSlug: "org-b-audit-iso",
          email: "admin-b-audit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const auditB = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company&limit=10")
        .set("Authorization", `Bearer ${orgB.body.accessToken}`)
        .expect(200);

      // SECURITY: Org B's audit logs should not contain Org A's company
      expect(auditB.body.data).not.toContainEqual(
        expect.objectContaining({
          entityId: companyRes.body.id,
        })
      );
    });
  });

  describe("Foreign key constraint enforcement", () => {
    it("database prevents cross-tenant foreign key relationships", async () => {
      // This test validates that the RLS policies + foreign keys work together
      // even at the database level

      const orgA = "j0000000-0000-4000-8000-000000000001";
      const orgB = "j0000000-0000-4000-8000-000000000002";
      const userId = "j1000000-0000-4000-8000-000000000001";
      const companyA = "j2000000-0000-4000-8000-000000000001";
      const contactB = "j3000000-0000-4000-8000-000000000002";

      // Create via admin (bypasses RLS)
      const adminClient = prisma;

      // Create both orgs and entities
      await adminClient.organization.createMany({
        data: [
          { id: orgA, name: "Org A FK", slug: "org-a-fk-enforce" },
          { id: orgB, name: "Org B FK", slug: "org-b-fk-enforce" },
        ],
      });

      await adminClient.user.create({
        data: {
          id: userId,
          email: "user-fk@test",
          emailNormalized: "user-fk@test",
          displayName: "User FK",
          passwordHash: "hash",
        },
      });

      await adminClient.company.create({
        data: {
          id: companyA,
          organizationId: orgA,
          legalName: "Co A",
          createdBy: userId,
          updatedBy: userId,
        },
      });

      await adminClient.contact.create({
        data: {
          id: contactB,
          organizationId: orgB,
          givenName: "Bob",
          createdBy: userId,
          updatedBy: userId,
        },
      });

      // SECURITY: Try to create link across tenants (should fail)
      await expect(
        adminClient.withTenant(orgA, tenant =>
          tenant.companyContact.create({
            data: {
              organizationId: orgA,
              companyId: companyA,
              contactId: contactB, // ← Cross-tenant
              isPrimary: true,
            },
          })
        )
      ).rejects.toThrow("P2003"); // Foreign key constraint
    });
  });
});
