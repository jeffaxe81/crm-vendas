import { createHmac } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { TENANT_DATA_REGISTRY } from "../../data-management/tenant-data-registry";

// Test identifiers are synthetic. Real external IDs must be HMACed only after
// provider authentication and authoritative tenant resolution (future phase).
const secret = Buffer.alloc(32, 19);
const hash = (externalId: string) =>
  createHmac("sha256", secret).update(externalId).digest("hex");

describe("F4.3-03A inbound email quarantine PostgreSQL RLS", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let organizationId: string;
  let otherOrganizationId: string;

  const incoming = (organization: string, externalId = "synthetic-message-1") => ({
    organizationId: organization,
    channel: "EMAIL",
    sourceKey: "approved-relay",
    externalIdHash: hash(externalId),
  });

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    organizationId = (
      await owner.organization.create({
        data: { name: "Inbound A", slug: "inbound-a" },
      })
    ).id;
    otherOrganizationId = (
      await owner.organization.create({
        data: { name: "Inbound B", slug: "inbound-b" },
      })
    ).id;
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
  });

  it("enforces FORCE RLS for reads and refuses cross-tenant writes", async () => {
    const [flags] = await owner.$queryRaw<
      { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'inbound_messages'`;
    expect(flags).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
    const [role] = await app.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });

    const inserted = await app.withTenant(organizationId, tx =>
      tx.inboundMessage.create({ data: incoming(organizationId) })
    );
    expect(inserted.status).toBe("QUARANTINED");
    expect(await app.inboundMessage.findMany()).toEqual([]);
    expect(
      await app.withTenant(otherOrganizationId, tx =>
        tx.inboundMessage.findMany()
      )
    ).toEqual([]);
    await expect(
      app.withTenant(otherOrganizationId, tx =>
        tx.inboundMessage.create({
          data: incoming(organizationId, "unauthorized-message"),
        })
      )
    ).rejects.toThrow();
    expect(
      await app.withTenant(organizationId, tx => tx.inboundMessage.count())
    ).toBe(1);
  });

  it("deduplicates within the same tenant, channel and approved source", async () => {
    const data = incoming(organizationId);
    const initial = await app.withTenant(organizationId, tx =>
      tx.inboundMessage.createMany({ data: [data], skipDuplicates: true })
    );
    const duplicate = await app.withTenant(organizationId, tx =>
      tx.inboundMessage.createMany({ data: [data], skipDuplicates: true })
    );
    expect(initial.count).toBe(1);
    expect(duplicate.count).toBe(0);

    await app.withTenant(otherOrganizationId, tx =>
      tx.inboundMessage.create({ data: incoming(otherOrganizationId) })
    );
    await app.withTenant(organizationId, tx =>
      tx.inboundMessage.create({
        data: { ...data, sourceKey: "secondary-relay" },
      })
    );
    expect(
      await app.withTenant(organizationId, tx => tx.inboundMessage.count())
    ).toBe(2);
    expect(
      await app.withTenant(otherOrganizationId, tx =>
        tx.inboundMessage.count()
      )
    ).toBe(1);
  });

  it("rejects unsupported channels, unsafe sources and malformed external IDs", async () => {
    const invalid = [
      { channel: "WHATSAPP" },
      { sourceKey: "https://not-trusted.example/relay" },
      { sourceKey: "UPPERCASE" },
      { externalIdHash: "raw-email-message-id@example.test" },
    ];
    for (const fields of invalid) {
      await expect(
        app.withTenant(organizationId, tx =>
          tx.inboundMessage.create({
            data: { ...incoming(organizationId), ...fields },
          })
        )
      ).rejects.toThrow();
    }
    expect(
      await app.withTenant(organizationId, tx => tx.inboundMessage.count())
    ).toBe(0);
  });

  it("does not allow messages to leave quarantine through ORM updates", async () => {
    const row = await app.withTenant(organizationId, tx =>
      tx.inboundMessage.create({ data: incoming(organizationId) })
    );
    await expect(
      app.withTenant(organizationId, tx =>
        tx.inboundMessage.update({
          where: { id: row.id },
          data: { status: "ACCEPTED" },
        })
      )
    ).rejects.toThrow();
    const unchanged = await app.withTenant(organizationId, tx =>
      tx.inboundMessage.findFirstOrThrow({ where: { id: row.id } })
    );
    expect(unchanged.status).toBe("QUARANTINED");
  });

  it("stores neither plaintext IDs, payload nor address fields", async () => {
    const rawId = "private-synthetic-message-id";
    const record = await app.withTenant(organizationId, tx =>
      tx.inboundMessage.create({
        data: incoming(organizationId, rawId),
      })
    );
    expect(record.externalIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(record)).not.toContain(rawId);
    for (const field of ["payload", "sender", "recipient", "subject"]) {
      expect(record).not.toHaveProperty(field);
    }
    expect(
      TENANT_DATA_REGISTRY.find(p => p.model === "InboundMessage")
    ).toMatchObject({ export: "EXCLUDE", restore: "PRESERVE" });
  });
});
