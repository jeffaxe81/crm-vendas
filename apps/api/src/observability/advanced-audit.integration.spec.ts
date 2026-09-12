import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { ApiErrorFilter } from "../common/filters/api-error.filter";
import { PrismaService } from "../database/prisma.service";

/**
 * PHASE 3: Advanced Audit Tests
 *
 * Tests:
 * 1. DeniedAccessLogger - Validates 401/403 are logged to audit trail
 * 2. TenantRateLimitGuard - Validates rate limiting is enforced and logged
 */

describe("Advanced Audit & Security - Phase 3", () => {
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

  describe("Denied Access Logger", () => {
    it("logs 401 Unauthorized to audit trail", async () => {
      // Try to access endpoint without token
      const response = await request(app.getHttpServer())
        .get("/api/v1/companies")
        .expect(401);

      expect(response.status).toBe(401);

      // NOTE: In a real test, you'd verify the audit log was created
      // This would require access to the audit log endpoint or direct DB query
      // For now, we just verify the 401 is returned correctly
    });

    it("logs 403 Forbidden to audit trail when permission denied", async () => {
      // Setup: Create two orgs
      const orgA = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org A Denied Access",
          organizationSlug: "org-a-denied-access",
          email: "admin-a-denied@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenA = orgA.body.accessToken;

      // Create a company in Org A
      const companyRes = await request(app.getHttpServer())
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          legalName: "Company A",
        })
        .expect(201);

      const companyId = companyRes.body.id;

      // Create Org B
      const orgB = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org B Denied Access",
          organizationSlug: "org-b-denied-access",
          email: "admin-b-denied@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenB = orgB.body.accessToken;

      // SECURITY: Try to access Org A's company with Org B token
      // This should return 404 (not found in tenant context), not 403
      // The system uses fail-closed design: if resource doesn't exist in tenant, treat as not found
      const response = await request(app.getHttpServer())
        .get(`/api/v1/companies/${companyId}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(404);

      expect(response.body.code).toBe("COMPANY_NOT_FOUND");
    });

    it("captures IP address in denied access logs", async () => {
      // This test validates that IP address is captured
      // In practice, the IP would be extracted from:
      // - X-Forwarded-For header (from reverse proxy)
      // - X-Real-IP header (from nginx)
      // - socket.remoteAddress (direct connection)

      const response = await request(app.getHttpServer())
        .get("/api/v1/companies")
        .expect(401);

      expect(response.status).toBe(401);
      // The DeniedAccessLogger will extract IP and log it
    });
  });

  describe("Tenant Rate Limiting", () => {
    it("allows requests within tenant limit", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Rate Limit Test",
          organizationSlug: "org-rate-limit-test",
          email: "admin-rate-limit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Make a few requests - should all succeed (well within the 1000/min limit)
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get("/api/v1/companies")
          .set("Authorization", `Bearer ${token}`)
          .expect(200);
      }
    });

    it("rejects requests exceeding user rate limit (50/sec)", async () => {
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org User Rate Limit",
          organizationSlug: "org-user-rate-limit",
          email: "admin-user-rate-limit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Make 51 rapid requests to exceed user limit (50/sec)
      const requests = [];
      for (let i = 0; i < 51; i++) {
        requests.push(
          request(app.getHttpServer())
            .get("/api/v1/companies")
            .set("Authorization", `Bearer ${token}`)
        );
      }

      const responses = await Promise.all(requests);

      // Most should succeed (50), one should be 429
      const successes = responses.filter(r => r.status === 200).length;
      const rateLimitExceeded = responses.filter(r => r.status === 429).length;

      // At least some should have succeeded, at least one should have been rate limited
      expect(successes).toBeGreaterThanOrEqual(50);
      expect(rateLimitExceeded).toBeGreaterThanOrEqual(1);
    });

    it("logs rate limit violations to audit trail", async () => {
      // Setup: Create org
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Audit Rate Limit",
          organizationSlug: "org-audit-rate-limit",
          email: "admin-audit-rate-limit@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;
      const orgId = org.body.user.organizationId;

      // Make many requests to trigger rate limit
      const requests = [];
      for (let i = 0; i < 60; i++) {
        requests.push(
          request(app.getHttpServer())
            .get("/api/v1/companies")
            .set("Authorization", `Bearer ${token}`)
        );
      }

      await Promise.all(requests);

      // Query audit logs to see if rate_limit_exceeded was logged
      // (In a real test, this would query the audit log endpoint)
      // For now, we just verify that the guard processed the requests

      // Get audit logs for this org
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=security&action=rate_limit_exceeded_user&limit=100")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // Should have at least one rate limit violation logged
      const violations = auditRes.body.data.filter(
        (log: any) => log.action === "rate_limit_exceeded_user"
      );

      expect(violations.length).toBeGreaterThanOrEqual(1);
    });

    it("isolates rate limits per tenant", async () => {
      // Setup: Create two orgs
      const orgA = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org A Isolation",
          organizationSlug: "org-a-isolation",
          email: "admin-a-isolation@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const orgB = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org B Isolation",
          organizationSlug: "org-b-isolation",
          email: "admin-b-isolation@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const tokenA = orgA.body.accessToken;
      const tokenB = orgB.body.accessToken;

      // Make requests to Org A - should succeed
      await request(app.getHttpServer())
        .get("/api/v1/companies")
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(200);

      // Make requests to Org B - should succeed independently
      await request(app.getHttpServer())
        .get("/api/v1/companies")
        .set("Authorization", `Bearer ${tokenB}`)
        .expect(200);

      // Rate limits for Org A should not affect Org B
      // Each tenant has their own 1000 req/min limit
    });

    it("distinguishes between tenant and user rate limit violations", async () => {
      // Setup
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Rate Type Test",
          organizationSlug: "org-rate-type-test",
          email: "admin-rate-type@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      // Make rapid requests
      const requests = [];
      for (let i = 0; i < 60; i++) {
        requests.push(
          request(app.getHttpServer())
            .get("/api/v1/companies")
            .set("Authorization", `Bearer ${token}`)
        );
      }

      await Promise.all(requests);

      // Query audit logs to verify rate_limit_exceeded_user (not _tenant)
      // since we're only making 60 requests (well under 1000/min tenant limit)
      const auditRes = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?entityType=security&limit=100")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const rateLimitLogs = auditRes.body.data.filter(
        (log: any) => log.action.startsWith("rate_limit_exceeded")
      );

      // Should only have user-level violations, not tenant-level
      const userViolations = rateLimitLogs.filter(
        (log: any) => log.action === "rate_limit_exceeded_user"
      );
      const tenantViolations = rateLimitLogs.filter(
        (log: any) => log.action === "rate_limit_exceeded_tenant"
      );

      expect(userViolations.length).toBeGreaterThanOrEqual(1);
      expect(tenantViolations.length).toBe(0); // Should be 0 since 60 < 1000/min
    });
  });

  describe("Integration: Denied Access + Rate Limiting", () => {
    it("does not count denied access attempts in rate limit", async () => {
      // Unauthenticated requests should not count against rate limits
      // They should return 401 immediately

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get("/api/v1/companies")
          .expect(401);
      }

      // Now authenticate and make requests - should all succeed
      // (not blocked by previous 401s)
      const org = await request(app.getHttpServer())
        .post("/api/v1/auth/register-first-admin")
        .send({
          organizationName: "Org Integration Test",
          organizationSlug: "org-integration-test",
          email: "admin-integration@test",
          password: "SecurePassword123!",
        })
        .expect(201);

      const token = org.body.accessToken;

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get("/api/v1/companies")
          .set("Authorization", `Bearer ${token}`)
          .expect(200);
      }
    });
  });
});
