import { PrismaService } from "../../database/prisma.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { EmailProviderPreferenceService } from "./email-provider-preference.service";
import { DisabledEmailProvider } from "./email-provider";

describe("F4.3-04A per-tenant provider catalog and preference PostgreSQL RLS", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let preferences: EmailProviderPreferenceService;
  let tenantA: string;
  let tenantB: string;
  let admin: string;
  let seller: string;

  const context = () => ({
    organizationId: tenantA,
    actorUserId: admin,
    requestId: "provider-preference-test",
    ipAddress: "127.0.0.1",
  });

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    preferences = new EmailProviderPreferenceService(app);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    admin = (
      await owner.user.create({
        data: {
          email: "provider-admin@example.test",
          emailNormalized: "provider-admin@example.test",
          displayName: "Provider Admin",
          passwordHash: "synthetic",
        },
      })
    ).id;
    seller = (
      await owner.user.create({
        data: {
          email: "provider-seller@example.test",
          emailNormalized: "provider-seller@example.test",
          displayName: "Provider Seller",
          passwordHash: "synthetic",
        },
      })
    ).id;
    tenantA = (
      await owner.organization.create({
        data: { name: "Provider A", slug: "provider-a" },
      })
    ).id;
    tenantB = (
      await owner.organization.create({
        data: { name: "Provider B", slug: "provider-b" },
      })
    ).id;
    await owner.organizationMembership.createMany({
      data: [
        { organizationId: tenantA, userId: admin, role: "ADMIN" },
        { organizationId: tenantB, userId: admin, role: "ADMIN" },
        { organizationId: tenantA, userId: seller, role: "SELLER" },
      ],
    });
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
  });

  it("starts at NONE, remains disconnected, and lists multiple market providers", async () => {
    const state = await preferences.read(context());
    expect(state).toMatchObject({
      version: 0,
      providerCode: "NONE",
      connectionStatus: "NOT_CONNECTED",
      sendingEnabled: false,
    });
    expect(state.providers.map(item => item.code)).toContain("GMAIL");
    expect(state.providers.map(item => item.code)).toContain("MICROSOFT_365");
    expect(state.providers.map(item => item.code)).toContain("SMTP");
    expect(state.providers.map(item => item.code)).toContain("RESEND");
  });

  it("allows admin to change provider with audit but never enables sending", async () => {
    const gmail = await preferences.update(
      { version: 0, providerCode: "GMAIL" },
      context()
    );
    expect(gmail).toMatchObject({
      version: 1,
      providerCode: "GMAIL",
      sendingEnabled: false,
      connectionStatus: "NOT_CONNECTED",
    });
    const outlook = await preferences.update(
      { version: 1, providerCode: "MICROSOFT_365" },
      context()
    );
    expect(outlook).toMatchObject({
      version: 2,
      providerCode: "MICROSOFT_365",
      sendingEnabled: false,
    });
    const audits = await app.withTenant(tenantA, tx =>
      tx.auditLog.findMany({
        where: { action: "email.provider_preference.updated" },
        orderBy: { createdAt: "asc" },
      })
    );
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toContain("token");
    expect(
      await new EmailDispatchService(new DisabledEmailProvider()).attempt({
        organizationId: tenantA,
        referenceId: tenantA,
        idempotencyKey: "provider-preference-no-send",
        purpose: "SLA_DUE_SOON",
        recipient: "recipient@example.test",
        subject: "Test",
        text: "Test",
        html: "<p>Test</p>",
      })
    ).toEqual({ status: "FAILED", errorCode: "PROVIDER_NOT_CONFIGURED" });
  });

  it("enforces tenant isolation and administrator role", async () => {
    await expect(
      preferences.update(
        { version: 0, providerCode: "GMAIL" },
        { ...context(), actorUserId: seller }
      )
    ).rejects.toThrow();
    await preferences.update({ version: 0, providerCode: "RESEND" }, context());
    expect(await app.emailProviderPreference.findMany()).toEqual([]);
    expect(
      await preferences.read({ ...context(), organizationId: tenantB })
    ).toMatchObject({ version: 0, providerCode: "NONE" });
    await expect(
      app.withTenant(tenantB, tx =>
        tx.emailProviderPreference.create({
          data: { organizationId: tenantA, providerCode: "GMAIL" },
        })
      )
    ).rejects.toThrow();
    await owner.organizationMembership.updateMany({
      where: { userId: admin, organizationId: tenantA },
      data: { isActive: false },
    });
    await expect(preferences.read(context())).rejects.toThrow();
  });

  it("rejects an outdated version and forbidden or malformed provider", async () => {
    await preferences.update({ version: 0, providerCode: "GMAIL" }, context());
    await expect(
      preferences.update({ version: 0, providerCode: "SMTP" }, context())
    ).rejects.toThrow();
    await expect(
      preferences.update(
        { version: 1, providerCode: "UNLISTED" as "GMAIL" },
        context()
      )
    ).rejects.toThrow();
    await expect(
      app.withTenant(tenantA, tx =>
        tx.emailProviderPreference.updateMany({
          where: { organizationId: tenantA },
          data: { providerCode: "EVIL_SERVICE" },
        })
      )
    ).rejects.toThrow();
    expect(await preferences.read(context())).toMatchObject({
      version: 1,
      providerCode: "GMAIL",
    });
  });
});
