import { PrismaService } from "../../database/prisma.service";
import { EmailRelayEvidenceService } from "./email-relay-evidence.service";
import { EmailRelayReadinessService } from "./email-relay-readiness.service";

describe("F4.3-02D3 append-only email evidence under PostgreSQL RLS", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let service: EmailRelayEvidenceService;
  let readiness: EmailRelayReadinessService;
  let tenantId: string;
  let otherTenantId: string;
  let adminId: string;
  let sellerId: string;
  const context = () => ({
    organizationId: tenantId,
    actorUserId: adminId,
    requestId: "email-evidence-test-2026",
  });

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    service = new EmailRelayEvidenceService(app);
    readiness = new EmailRelayReadinessService(app);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    adminId = (
      await owner.user.create({
        data: {
          email: "evidence-admin@example.test",
          emailNormalized: "evidence-admin@example.test",
          displayName: "Evidence Administrator",
          passwordHash: "synthetic",
        },
      })
    ).id;
    sellerId = (
      await owner.user.create({
        data: {
          email: "evidence-seller@example.test",
          emailNormalized: "evidence-seller@example.test",
          displayName: "Evidence Seller",
          passwordHash: "synthetic",
        },
      })
    ).id;
    tenantId = (
      await owner.organization.create({
        data: { name: "Evidence A", slug: "evidence-a" },
      })
    ).id;
    otherTenantId = (
      await owner.organization.create({
        data: { name: "Evidence B", slug: "evidence-b" },
      })
    ).id;
    await owner.organizationMembership.createMany({
      data: [
        { organizationId: tenantId, userId: adminId, role: "ADMIN" },
        { organizationId: otherTenantId, userId: adminId, role: "ADMIN" },
        { organizationId: tenantId, userId: sellerId, role: "SELLER" },
      ],
    });
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
  });

  it("records immutable audit evidence without approval or secret payload", async () => {
    const recorded = await service.record(
      {
        type: "DURABLE_IDEMPOTENCY",
        reference: "TICKET-2026-1001",
      },
      context()
    );
    expect(recorded).toMatchObject({
      reference: "TICKET-2026-1001",
      verification: "SUBMITTED_UNVERIFIED",
      actorUserId: adminId,
    });
    const rows = await service.list(context());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(recorded);
    const audit = await app.withTenant(tenantId, tx =>
      tx.auditLog.findFirstOrThrow({ where: { id: recorded.id } })
    );
    expect(audit.action).toBe("email.relay_evidence.recorded");
    expect(audit.requestId).toBe(context().requestId);
    expect(audit.metadata).toEqual({
      type: "DURABLE_IDEMPOTENCY",
      reference: "TICKET-2026-1001",
      verification: "SUBMITTED_UNVERIFIED",
    });
    const readinessReport = await readiness.inspect(context());
    expect(readinessReport.activationEligible).toBe(false);
    expect(readinessReport.sendingEnabled).toBe(false);
    expect(
      readinessReport.checks.durableProviderIdempotency
    ).toBe("NOT_VERIFIED");
  });

  it("blocks seller and inactive administrator", async () => {
    await expect(
      service.record(
        { type: "EGRESS_POLICY", reference: "TICKET-2026-1002" },
        { ...context(), actorUserId: sellerId }
      )
    ).rejects.toThrow();
    await expect(
      service.list({ ...context(), actorUserId: sellerId })
    ).rejects.toThrow();
    await owner.organizationMembership.updateMany({
      where: { organizationId: tenantId, userId: adminId },
      data: { isActive: false },
    });
    await expect(service.list(context())).rejects.toThrow();
  });

  it("keeps references private to their organization", async () => {
    await service.record(
      { type: "TLS_DNS_POLICY", reference: "TICKET-2026-1003" },
      context()
    );
    expect(
      await service.list({ ...context(), organizationId: otherTenantId })
    ).toEqual([]);
    expect(await app.auditLog.findMany()).toEqual([]);
  });

  it("rejects URLs, emails, whitespace and control characters", async () => {
    const invalid = [
      "https://example.test/receipt",
      "email@example.test",
      "short",
      "TICKET 2026 001",
      "TICKET-2026-0001\nsecret",
      "TICKET-2026/0001",
    ];
    for (const reference of invalid) {
      await expect(
        service.record(
          { type: "OPERATIONAL_REVIEW", reference },
          context()
        )
      ).rejects.toThrow();
    }
    expect(await service.list(context())).toHaveLength(0);
  });

  it("does not treat a recorded operational review as authorization", async () => {
    await service.record(
      { type: "OPERATIONAL_REVIEW", reference: "CHANGE-2026-0099" },
      context()
    );
    const report = await readiness.inspect(context());
    expect(report.checks.externalApproval).toBe("NOT_VERIFIED");
    expect(report.checks.senderRegistration).toBe("BLOCKED");
    expect(report.activationEligible).toBe(false);
  });
});
