import { PrismaService } from "../../database/prisma.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { DisabledEmailProvider } from "./email-provider";
import { EmailRelaySettingsService } from "./email-relay-settings.service";

describe("F4.3-02D1 tenant relay staging with PostgreSQL RLS", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let settings: EmailRelaySettingsService;
  let tenantA: string;
  let tenantB: string;
  let adminId: string;
  let sellerId: string;
  const token = "exampleBearerToken0123456789";
  const endpoint = "https://relay.example.test/v1/transactional";
  const prior = {
    key: process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY,
    host: process.env.EMAIL_RELAY_ALLOWED_HOSTNAME,
  };
  const context = () => ({
    organizationId: tenantA,
    actorUserId: adminId,
    requestId: "email-settings-request-123",
    ipAddress: "127.0.0.1",
  });

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    settings = new EmailRelaySettingsService(app);
  });

  beforeEach(async () => {
    process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY =
      Buffer.alloc(32, 12).toString("base64");
    process.env.EMAIL_RELAY_ALLOWED_HOSTNAME = "relay.example.test";
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    adminId = (
      await owner.user.create({
        data: {
          email: "relay-admin@example.test",
          emailNormalized: "relay-admin@example.test",
          displayName: "Relay Admin",
          passwordHash: "synthetic",
        },
      })
    ).id;
    sellerId = (
      await owner.user.create({
        data: {
          email: "relay-seller@example.test",
          emailNormalized: "relay-seller@example.test",
          displayName: "Relay Seller",
          passwordHash: "synthetic",
        },
      })
    ).id;
    tenantA = (
      await owner.organization.create({
        data: { name: "Relay A", slug: "relay-a" },
      })
    ).id;
    tenantB = (
      await owner.organization.create({
        data: { name: "Relay B", slug: "relay-b" },
      })
    ).id;
    await owner.organizationMembership.createMany({
      data: [
        { organizationId: tenantA, userId: adminId, role: "ADMIN" },
        { organizationId: tenantB, userId: adminId, role: "ADMIN" },
        { organizationId: tenantA, userId: sellerId, role: "SELLER" },
      ],
    });
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
    if (prior.key === undefined)
      delete process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY;
    else process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY = prior.key;
    if (prior.host === undefined)
      delete process.env.EMAIL_RELAY_ALLOWED_HOSTNAME;
    else process.env.EMAIL_RELAY_ALLOWED_HOSTNAME = prior.host;
  });

  it("is disabled by default, even when no tenant row exists", async () => {
    expect(await settings.read(context())).toEqual({
      version: 0,
      mode: "DISABLED",
      endpoint: null,
      hasCredential: false,
      sendingEnabled: false,
    });
  });

  it("stores encrypted token, never returns it, and audits only metadata", async () => {
    const result = await settings.update(
      { version: 0, mode: "PREPARED", endpoint, bearerToken: token },
      context()
    );
    expect(result).toEqual({
      version: 1,
      mode: "PREPARED",
      endpoint,
      hasCredential: true,
      sendingEnabled: false,
    });
    const row = await owner.emailRelaySettings.findFirstOrThrow({
      where: { organizationId: tenantA },
    });
    expect(row.encryptedBearerToken).toBeTruthy();
    expect(row.encryptedBearerToken).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(await app.emailRelaySettings.findMany()).toEqual([]);
    const audit = await app.withTenant(tenantA, tx =>
      tx.auditLog.findMany({
        where: { action: "email.relay_settings.updated" },
      })
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorUserId).toBe(adminId);
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(
      await new EmailDispatchService(new DisabledEmailProvider()).attempt({
        organizationId: tenantA,
        referenceId: tenantA,
        idempotencyKey: "stage-only",
        purpose: "SLA_DUE_SOON",
        recipient: "internal@example.test",
        subject: "Internal",
        text: "Internal",
        html: "<p>Internal</p>",
      })
    ).toEqual({ status: "FAILED", errorCode: "PROVIDER_NOT_CONFIGURED" });
  });

  it("requires active admin membership, and isolates organizations", async () => {
    await expect(
      settings.update(
        { version: 0, mode: "PREPARED", endpoint, bearerToken: token },
        { ...context(), actorUserId: sellerId }
      )
    ).rejects.toThrow();
    await settings.update(
      { version: 0, mode: "DISABLED", endpoint, bearerToken: token },
      context()
    );
    expect(
      await settings.read({ ...context(), organizationId: tenantB })
    ).toEqual({
      version: 0,
      mode: "DISABLED",
      endpoint: null,
      hasCredential: false,
      sendingEnabled: false,
    });
    await expect(
      app.withTenant(tenantB, tx =>
        tx.emailRelaySettings.create({
          data: {
            organizationId: tenantA,
            mode: "DISABLED",
          },
        })
      )
    ).rejects.toThrow();
    await owner.organizationMembership.updateMany({
      where: { userId: adminId, organizationId: tenantA },
      data: { isActive: false },
    });
    await expect(settings.read(context())).rejects.toThrow();
  });

  it("rejects unsafe endpoints and missing allowlist or encryption key", async () => {
    const invalid = [
      "http://relay.example.test/v1/send",
      "https://127.0.0.1/v1/send",
      "https://evil.example.test/v1/send",
      "https://relay.example.test:444/v1/send",
      "https://user:password@relay.example.test/v1/send",
      "https://relay.example.test/v1/send?token=123",
      "https://relay.example.test/v1/send#top",
    ];
    for (const url of invalid) {
      await expect(
        settings.update(
          { version: 0, mode: "DISABLED", endpoint: url },
          context()
        )
      ).rejects.toThrow();
    }
    delete process.env.EMAIL_RELAY_ALLOWED_HOSTNAME;
    await expect(
      settings.update(
        { version: 0, mode: "PREPARED", endpoint, bearerToken: token },
        context()
      )
    ).rejects.toThrow();
    process.env.EMAIL_RELAY_ALLOWED_HOSTNAME = "relay.example.test";
    delete process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY;
    await expect(
      settings.update(
        { version: 0, mode: "PREPARED", endpoint, bearerToken: token },
        context()
      )
    ).rejects.toThrow();
    expect(await owner.emailRelaySettings.count()).toBe(0);
  });

  it("requires version CAS and prevents preparing without credentials", async () => {
    await expect(
      settings.update({ version: 0, mode: "PREPARED", endpoint }, context())
    ).rejects.toThrow();
    const first = await settings.update(
      { version: 0, mode: "DISABLED", endpoint, bearerToken: token },
      context()
    );
    expect(first.version).toBe(1);
    await expect(
      settings.update({ version: 0, mode: "PREPARED" }, context())
    ).rejects.toThrow();
    const prepared = await settings.update(
      { version: 1, mode: "PREPARED" },
      context()
    );
    expect(prepared.version).toBe(2);
    const revoked = await settings.update(
      { version: 2, mode: "DISABLED", clearCredential: true },
      context()
    );
    expect(revoked).toMatchObject({
      mode: "DISABLED",
      hasCredential: false,
      sendingEnabled: false,
      version: 3,
    });
    await expect(
      settings.update({ version: 3, mode: "PREPARED" }, context())
    ).rejects.toThrow();
  });
});
