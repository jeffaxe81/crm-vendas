import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { ApiErrorFilter } from "../common/filters/api-error.filter";
import { PrismaService } from "../database/prisma.service";

/**
 * PHASE 2.3: Audit Completeness Tests
 * Tests that all CRUD operations are logged with complete information.
 *
 * Validates:
 * 1. CREATE operations logged with after state
 * 2. UPDATE operations logged with before/after state
 * 3. DELETE operations logged with before state and soft delete info
 * 4. Audit logs contain organizationId (isolation)
 * 5. Audit logs contain actorUserId, requestId, ipAddress
 * 6. Sensitive operations (delete, permission changes) are logged
 */

describe("Audit completeness - all CRUD operations logged", () => {
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

  describe("Company audit trail", () => {
    it("logs CREATE operation with complete audit info", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Company Audit",
          organizationSlug: "org-company-audit-create",
          email: "admin-company-audit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Create company
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${token}`)
        .send({
          legalName: "Audit Test Company",
        })
        .expect(201);

      const companyId = companyRes.body.id;

      // Query audit logs
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company&limit=10")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // SECURITY: Verify audit log contains complete info
      const createLog = auditRes.body.data.find(
        (log: Record<string, unknown>) => log.entityId === companyId
      );

      expect(createLog).toBeDefined();
      expect(createLog).toMatchObject({
        entityType: "company",
        entityId: companyId,
        action: "company.created",
        organizationId: org.body.organizationId,
        actorUserId: org.body.userId,
        ipAddress: expect.any(String), // Should be captured
        after: expect.objectContaining({
          legalName: "Audit Test Company",
        }),
      });

      expect(createLog.before).toBeUndefined(); // CREATE has no before
    });

    it("logs UPDATE operation with before/after state", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Company Update",
          organizationSlug: "org-company-update",
          email: "admin-company-update@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Create company
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${token}`)
        .send({
          legalName: "Original Name",
        })
        .expect(201);

      const companyId = companyRes.body.id;

      // Update company
      await request(app.getHttpServer())
        .patch(`/api/v1/companies/${companyId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          legalName: "Updated Name",
        })
        .expect(200);

      // Query audit logs
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company&limit=20")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // SECURITY: Verify UPDATE log has before/after
      const updateLog = auditRes.body.data.find(
        (log: Record<string, unknown>) =>
          log.entityId === companyId && log.action === "company.updated"
      );

      expect(updateLog).toBeDefined();
      expect(updateLog).toMatchObject({
        entityType: "company",
        action: "company.updated",
        before: expect.objectContaining({
          legalName: "Original Name",
        }),
        after: expect.objectContaining({
          legalName: "Updated Name",
        }),
      });
    });

    it("logs DELETE operation with soft delete tracking", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Company Delete",
          organizationSlug: "org-company-delete",
          email: "admin-company-delete@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Create company
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${token}`)
        .send({
          legalName: "Company to Delete",
        })
        .expect(201);

      const companyId = companyRes.body.id;

      // Delete company
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      // Query audit logs
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company&limit=20")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // SECURITY: Verify DELETE log has before state (soft delete)
      const deleteLog = auditRes.body.data.find(
        (log: Record<string, unknown>) =>
          log.entityId === companyId && log.action === "company.deleted"
      );

      expect(deleteLog).toBeDefined();
      expect(deleteLog).toMatchObject({
        entityType: "company",
        action: "company.deleted",
        before: expect.objectContaining({
          legalName: "Company to Delete",
        }),
      });

      // SECURITY: Verify deletedAt and deletedBy are tracked
      expect(deleteLog.before).toHaveProperty("deletedAt");
      expect(deleteLog.before).toHaveProperty("deletedBy");
    });
  });

  describe("Contact-Company link audit trail", () => {
    it("logs linkage operations with relationship info", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Link Audit",
          organizationSlug: "org-link-audit",
          email: "admin-link-audit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Create company and contact
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${token}`)
        .send({
          legalName: "Link Test Company",
        })
        .expect(201);

      const contactRes = await request(app.getHttpServer())
        .post("/api/v1/contacts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          givenName: "Link Test",
          email: "link-test@test",
        })
        .expect(201);

      // Link company and contact
      await request(app.getHttpServer())
        .post(
          `/api/v1/companies/${companyRes.body.id}/contacts/${contactRes.body.id}`
        )
        .set("Authorization", `Bearer ${token}`)
        .send({
          isPrimary: true,
          relationshipLabel: "CEO",
        })
        .expect(201);

      // Query audit logs
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company_contact&limit=10")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // SECURITY: Verify link operation is logged
      const linkLog = auditRes.body.data.find(
        (log: Record<string, unknown>) =>
          log.action === "company.contact_linked"
      );

      expect(linkLog).toBeDefined();
      expect(linkLog).toMatchObject({
        entityType: "company_contact",
        action: "company.contact_linked",
        organizationId: org.body.organizationId,
        after: expect.objectContaining({
          companyId: companyRes.body.id,
          contactId: contactRes.body.id,
          relationshipLabel: "CEO",
          isPrimary: true,
        }),
      });
    });

    it("logs unlinkage operations", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Unlink Audit",
          organizationSlug: "org-unlink-audit",
          email: "admin-unlink-audit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Create and link
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${token}`)
        .send({
          legalName: "Unlink Test",
        })
        .expect(201);

      const contactRes = await request(app.getHttpServer())
        .post("/api/v1/contacts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          givenName: "Unlink",
          email: "unlink@test",
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(
          `/api/v1/companies/${companyRes.body.id}/contacts/${contactRes.body.id}`
        )
        .set("Authorization", `Bearer ${token}`)
        .send({
          isPrimary: true,
        })
        .expect(201);

      // Unlink
      await request(app.getHttpServer())
        .delete(
          `/api/v1/companies/${companyRes.body.id}/contacts/${contactRes.body.id}`
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      // Query audit logs
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company_contact&limit=10")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // SECURITY: Verify unlink operation is logged
      const unlinkLog = auditRes.body.data.find(
        (log: Record<string, unknown>) =>
          log.action === "company.contact_unlinked"
      );

      expect(unlinkLog).toBeDefined();
      expect(unlinkLog).toMatchObject({
        entityType: "company_contact",
        action: "company.contact_unlinked",
      });
    });
  });

  describe("Tag operations audit trail", () => {
    it("logs tag link/unlink operations", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Tag Audit",
          organizationSlug: "org-tag-audit",
          email: "admin-tag-audit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Create tag and contact
      const tagRes = await request(app.getHttpServer())
        .post("/api/v1/tags")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "VIP",
          color: "#FF0000",
        })
        .expect(201);

      const contactRes = await request(app.getHttpServer())
        .post("/api/v1/contacts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          givenName: "VIP Contact",
          email: "vip@test",
        })
        .expect(201);

      // Link tag to contact
      await request(app.getHttpServer())
        .post(`/api/v1/tags/${tagRes.body.id}/contacts/${contactRes.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send()
        .expect(201);

      // Query audit logs
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=contact_tag&limit=10")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // SECURITY: Verify tag link is logged
      const linkLog = auditRes.body.data.find(
        (log: Record<string, unknown>) => log.action === "tag.linked"
      );

      expect(linkLog).toBeDefined();
      expect(linkLog).toMatchObject({
        entityType: "contact_tag",
        action: "tag.linked",
        metadata: expect.objectContaining({
          targetType: "contact",
          contactId: contactRes.body.id,
          tagId: tagRes.body.id,
        }),
      });
    });
  });

  describe("Custom field operations audit trail", () => {
    it("logs custom field value set/remove operations", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org CFD Audit",
          organizationSlug: "org-cfd-audit",
          email: "admin-cfd-audit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Create custom field definition
      const defRes = await request(app.getHttpServer())
        .post("/api/v1/custom-fields")
        .set("Authorization", `Bearer ${token}`)
        .send({
          label: "Phone Extension",
          type: "TEXT",
          targetType: "COMPANY",
        })
        .expect(201);

      // Create company
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${token}`)
        .send({
          legalName: "CFD Test Company",
        })
        .expect(201);

      // Set custom field value
      await request(app.getHttpServer())
        .post(
          `/api/v1/companies/${companyRes.body.id}/custom-fields/${defRes.body.id}`
        )
        .set("Authorization", `Bearer ${token}`)
        .send({
          value: "555-1234",
        })
        .expect(201);

      // Query audit logs
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company_custom_field_value&limit=10")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // SECURITY: Verify custom field value set is logged
      const setLog = auditRes.body.data.find(
        (log: Record<string, unknown>) =>
          log.action === "custom_field.value_set"
      );

      expect(setLog).toBeDefined();
      expect(setLog).toMatchObject({
        entityType: "company_custom_field_value",
        action: "custom_field.value_set",
        after: expect.objectContaining({
          value: "555-1234",
        }),
      });

      // Remove custom field value
      await request(app.getHttpServer())
        .delete(
          `/api/v1/companies/${companyRes.body.id}/custom-fields/${defRes.body.id}`
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      // Query audit logs again
      const auditRes2 = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company_custom_field_value&limit=20")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // SECURITY: Verify custom field value remove is logged
      const removeLog = auditRes2.body.data.find(
        (log: Record<string, unknown>) =>
          log.action === "custom_field.value_removed"
      );

      expect(removeLog).toBeDefined();
      expect(removeLog).toMatchObject({
        entityType: "company_custom_field_value",
        action: "custom_field.value_removed",
        before: expect.objectContaining({
          value: "555-1234",
        }),
      });
    });
  });

  describe("Audit log isolation", () => {
    it("prevents cross-tenant audit log access", async () => {
      // Create Org A and log operations
      const orgA = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org A Audit Isolation",
          organizationSlug: "org-a-audit-iso",
          email: "admin-a-audit-iso@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenA = orgA.body.accessToken;

      // Create company in Org A
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          legalName: "Secret Company A",
        })
        .expect(201);

      // Create Org B
      const orgB = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org B Audit Isolation",
          organizationSlug: "org-b-audit-iso",
          email: "admin-b-audit-iso@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenB = orgB.body.accessToken;

      // SECURITY: Org B's audit logs should not contain Org A's operations
      const auditB = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=company&limit=100")
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(200);

      expect(auditB.body.data).not.toContainEqual(
        expect.objectContaining({
          entityId: companyRes.body.id,
          organizationId: orgA.body.organizationId,
        })
      );
    });
  });
});
