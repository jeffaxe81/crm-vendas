import { PrismaService } from "../../database/prisma.service";
import { EmailRelayReadinessService } from "./email-relay-readiness.service";
import { EmailRelaySettingsService } from "./email-relay-settings.service";

describe("F4.3-02D2 relay readiness without outbound network", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let readiness: EmailRelayReadinessService;
  let settings: EmailRelaySettingsService;
  let organizationId: string;
  let otherOrganizationId: string;
  let administratorId: string;
  let sellerId: string;

  const endpoint = "https://relay.example.test/v1/transactional";
  const credential = "test-relay-bearer-credential-2026";
  const previousKey = process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY;
  const previousHostname = process.env.EMAIL_RELAY_ALLOWED_HOSTNAME;
  const context = () => ({
    organizationId,
    actorUserId: administratorId,
    requestId: "readiness-check-20261010",
  });

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    readiness = new EmailRelayReadinessService(app);
    settings = new EmailRelaySettingsService(app);
  });

  beforeEach(async () => {
    process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(
      32,
      15
    ).toString("base64");
    process.env.EMAIL_RELAY_ALLOWED_HOSTNAME = "relay.example.test";
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    administratorId = (
      await owner.user.create({
        data: {
          email: "readiness-admin@example.test",
          emailNormalized: "readiness-admin@example.test",
          displayName: "Relay Readiness Admin",
          passwordHash: "synthetic",
        },
      })
    ).id;
    sellerId = (
      await owner.user.create({
        data: {
          email: "readiness-seller@example.test",
          emailNormalized: "readiness-seller@example.test",
          displayName: "Relay Readiness Seller",
          passwordHash: "synthetic",
        },
      })
    ).id;
    organizationId = (
      await owner.organization.create({
        data: { name: "Readiness Tenant A", slug: "readiness-a" },
      })
    ).id;
    otherOrganizationId = (
      await owner.organization.create({
        data: { name: "Readiness Tenant B", slug: "readiness-b" },
      })
    ).id;
    await owner.organizationMembership.createMany({
      data: [
        { organizationId, userId: administratorId, role: "ADMIN" },
        {
          organizationId: otherOrganizationId,
          userId: administratorId,
          role: "ADMIN",
        },
        { organizationId, userId: sellerId, role: "SELLER" },
      ],
    });
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
    if (previousKey === undefined) {
      delete process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.EMAIL_RELAY_SETTINGS_ENCRYPTION_KEY = previousKey;
    }
    if (previousHostname === undefined) {
      delete process.env.EMAIL_RELAY_ALLOWED_HOSTNAME;
    } else {
      process.env.EMAIL_RELAY_ALLOWED_HOSTNAME = previousHostname;
    }
  });

  it("blocks an organization without relay staging configuration", async () => {
    const report = await readiness.inspect(context());
    expect(report).toMatchObject({
      mode: "DISABLED",
      version: 0,
      sendingEnabled: false,
      activationEligible: false,
      checks: {
        relayConfigured: "BLOCKED",
        hostnameAllowlisted: "BLOCKED",
        credentialIntegrity: "BLOCKED",
        durableProviderIdempotency: "NOT_VERIFIED",
        networkEgressPolicy: "NOT_VERIFIED",
        tlsAndDnsPinning: "NOT_VERIFIED",
        senderRegistration: "BLOCKED",
      },
    });
    expect(report.blockers).toContain("senderRegistration");
  });

  it("checks staged encryption without claiming remote verification", async () => {
    await settings.update(
      {
        version: 0,
        mode: "PREPARED",
        endpoint,
        bearerToken: credential,
      },
      context()
    );
    const report = await readiness.inspect(context());
    expect(report).toMatchObject({
      mode: "PREPARED",
      version: 1,
      sendingEnabled: false,
      activationEligible: false,
      checks: {
        relayConfigured: "PASS",
        hostnameAllowlisted: "PASS",
        encryptionKeyPresent: "PASS",
        credentialIntegrity: "PASS",
        providerContractCompatible: "PASS",
        durableProviderIdempotency: "NOT_VERIFIED",
        networkEgressPolicy: "NOT_VERIFIED",
        tlsAndDnsPinning: "NOT_VERIFIED",
        externalApproval: "NOT_VERIFIED",
        senderRegistration: "BLOCKED",
      },
    });
    expect(JSON.stringify(report)).not.toContain(credential);
    expect(JSON.stringify(report)).not.toContain("encryptedBearerToken");
  });

  it("fails closed when hostname changes or ciphertext is altered", async () => {
    await settings.update(
      {
        version: 0,
        mode: "PREPARED",
        endpoint,
        bearerToken: credential,
      },
      context()
    );
    process.env.EMAIL_RELAY_ALLOWED_HOSTNAME = "other.example.test";
    let report = await readiness.inspect(context());
    expect(report.checks.hostnameAllowlisted).toBe("BLOCKED");
    expect(report.checks.providerContractCompatible).toBe("BLOCKED");

    process.env.EMAIL_RELAY_ALLOWED_HOSTNAME = "relay.example.test";
    await owner.emailRelaySettings.update({
      where: { organizationId },
      data: { encryptedBearerToken: "v1.invalid.invalid.invalid" },
    });
    report = await readiness.inspect(context());
    expect(report.checks.credentialIntegrity).toBe("BLOCKED");
    expect(report.checks.providerContractCompatible).toBe("BLOCKED");
    expect(report.sendingEnabled).toBe(false);
    expect(JSON.stringify(report)).not.toContain(credential);
  });

  it("requires an active tenant administrator and isolates results", async () => {
    await settings.update(
      {
        version: 0,
        mode: "PREPARED",
        endpoint,
        bearerToken: credential,
      },
      context()
    );
    await expect(
      readiness.inspect({ ...context(), actorUserId: sellerId })
    ).rejects.toThrow();

    const otherReport = await readiness.inspect({
      ...context(),
      organizationId: otherOrganizationId,
    });
    expect(otherReport.mode).toBe("DISABLED");
    expect(otherReport.checks.credentialIntegrity).toBe("BLOCKED");

    await owner.organizationMembership.updateMany({
      where: { organizationId, userId: administratorId },
      data: { isActive: false },
    });
    await expect(readiness.inspect(context())).rejects.toThrow();
  });

  it("never marks remote guarantees as verified from local configuration", async () => {
    await settings.update(
      { version: 0, mode: "DISABLED", endpoint, bearerToken: credential },
      context()
    );
    const report = await readiness.inspect(context());
    expect(report.checks.relayConfigured).toBe("BLOCKED");
    expect(report.checks.durableProviderIdempotency).toBe("NOT_VERIFIED");
    expect(report.checks.networkEgressPolicy).toBe("NOT_VERIFIED");
    expect(report.activationEligible).toBe(false);
  });
});
