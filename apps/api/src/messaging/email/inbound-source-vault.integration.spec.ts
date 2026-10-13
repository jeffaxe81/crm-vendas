import { PrismaService } from "../../database/prisma.service";
import { decryptWebhookSecret } from "../../webhooks/webhook-secret";
import { InboundSourceVault } from "./inbound-source-vault";

const key = Buffer.alloc(32, 91).toString("base64");
const secretOne = Buffer.alloc(32, 72).toString("base64");
const secretTwo = Buffer.alloc(32, 73).toString("base64");

describe("F4.3-03B2 inbound source vault offline/PostgreSQL RLS", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let vault: InboundSourceVault;
  let organizationId: string;
  let otherOrganizationId: string;
  let adminId: string;
  let sellerId: string;

  const context = () => ({
    organizationId,
    actorUserId: adminId,
    requestId: "source-vault-test",
  });
  const created = () => ({
    routeKey: "route-alpha",
    sourceKey: "relay-inbound",
    keyId: "key-one",
    secretBase64: secretOne,
  });

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL) {
      throw Error("Restricted PostgreSQL role required");
    }
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    vault = new InboundSourceVault(app, key);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    adminId = (
      await owner.user.create({
        data: {
          email: "source-admin@example.test",
          emailNormalized: "source-admin@example.test",
          displayName: "Source admin",
          passwordHash: "synthetic",
        },
      })
    ).id;
    sellerId = (
      await owner.user.create({
        data: {
          email: "source-seller@example.test",
          emailNormalized: "source-seller@example.test",
          displayName: "Source seller",
          passwordHash: "synthetic",
        },
      })
    ).id;
    organizationId = (
      await owner.organization.create({
        data: { name: "Source vault A", slug: "source-a" },
      })
    ).id;
    otherOrganizationId = (
      await owner.organization.create({
        data: { name: "Source vault B", slug: "source-b" },
      })
    ).id;
    await owner.organizationMembership.createMany({
      data: [
        { organizationId, userId: adminId, role: "ADMIN" },
        { organizationId, userId: sellerId, role: "SELLER" },
      ],
    });
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
  });

  it("forces RLS, disables every route, encrypts all secrets and stores only metadata in audit", async () => {
    const flags = await owner.$queryRaw<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >`SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class WHERE relname IN ('inbound_email_sources', 'inbound_email_source_keys')`;
    expect(flags).toHaveLength(2);
    for (const flag of flags) {
      expect(flag.relrowsecurity).toBe(true);
      expect(flag.relforcerowsecurity).toBe(true);
    }
    const saved = await vault.register(created(), context());
    expect(saved).toEqual({
      routeKey: "route-alpha",
      sourceKey: "relay-inbound",
      version: 1,
      enabled: false,
      keys: [{ keyId: "key-one", revoked: false }],
    });
    const rows = await app.withTenant(
      organizationId,
      tx =>
        tx.$queryRaw<{ encrypted_secret: string; revoked: boolean }[]>`
        SELECT encrypted_secret, revoked FROM public.inbound_email_source_keys
      `
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(secretOne);
    expect(rows[0]?.encrypted_secret).toMatch(/^v1\./);
    expect(
      decryptWebhookSecret(
        rows[0]!.encrypted_secret,
        key,
        `inbound-email-source:v1:${organizationId}:route-alpha:key-one`
      )
    ).toBe(secretOne);
    expect(
      await app.$queryRaw`SELECT * FROM public.inbound_email_sources`
    ).toEqual([]);
    expect(
      await app.withTenant(
        otherOrganizationId,
        tx => tx.$queryRaw`SELECT * FROM public.inbound_email_source_keys`
      )
    ).toEqual([]);
    const audit = await app.withTenant(organizationId, tx =>
      tx.auditLog.findMany({
        where: { action: "email.inbound_source.registered" },
      })
    );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(secretOne);
    expect(JSON.stringify(audit)).not.toContain(key);
  });

  it("rejects seller, untrusted tenant, route alias collision and invalid key", async () => {
    await expect(
      vault.register(created(), {
        ...context(),
        actorUserId: sellerId,
      })
    ).rejects.toThrow();
    await expect(
      vault.register(created(), {
        ...context(),
        organizationId: otherOrganizationId,
      })
    ).rejects.toThrow();
    await expect(
      vault.register(
        {
          ...created(),
          secretBase64: "plaintext-is-not-a-secret",
        },
        context()
      )
    ).rejects.toThrow();
    await vault.register(created(), context());
    await expect(vault.register(created(), context())).rejects.toThrow();
    await owner.organizationMembership.create({
      data: {
        organizationId: otherOrganizationId,
        userId: adminId,
        role: "ADMIN",
      },
    });
    await expect(
      vault.register(
        {
          ...created(),
          sourceKey: "spoofed-owner",
        },
        { ...context(), organizationId: otherOrganizationId }
      )
    ).rejects.toThrow();
    expect(await vault.list(context())).toHaveLength(1);
    expect(
      await vault.list({ ...context(), organizationId: otherOrganizationId })
    ).toEqual([]);
  });

  it("rotates with CAS, refuses replay and revocation cannot be reversed", async () => {
    await vault.register(created(), context());
    const rotated = await vault.rotate(
      {
        routeKey: "route-alpha",
        keyId: "key-two",
        expectedVersion: 1,
        secretBase64: secretTwo,
      },
      context()
    );
    expect(rotated.version).toBe(2);
    expect(rotated.enabled).toBe(false);
    expect(rotated.keys).toHaveLength(2);
    await expect(
      vault.rotate(
        {
          routeKey: "route-alpha",
          keyId: "key-three",
          expectedVersion: 1,
          secretBase64: secretTwo,
        },
        context()
      )
    ).rejects.toThrow();
    await expect(
      vault.rotate(
        {
          routeKey: "route-alpha",
          keyId: "key-one",
          expectedVersion: 2,
          secretBase64: secretTwo,
        },
        context()
      )
    ).rejects.toThrow();
    const revoked = await vault.revoke(
      {
        routeKey: "route-alpha",
        keyId: "key-one",
        expectedVersion: 2,
      },
      context()
    );
    expect(revoked.version).toBe(3);
    expect(revoked.keys).toEqual([
      { keyId: "key-one", revoked: true },
      { keyId: "key-two", revoked: false },
    ]);
    await expect(
      vault.revoke(
        {
          routeKey: "route-alpha",
          keyId: "key-one",
          expectedVersion: 3,
        },
        context()
      )
    ).rejects.toThrow();
    await expect(
      app.withTenant(
        organizationId,
        tx =>
          tx.$executeRaw`UPDATE public.inbound_email_source_keys
        SET revoked = FALSE, revoked_at = NULL
        WHERE route_key = 'route-alpha' AND key_id = 'key-one'`
      )
    ).rejects.toThrow();
  });

  it("rejects owner/alias mutation, deletion and enabling even through SQL", async () => {
    await vault.register(created(), context());
    await expect(
      app.withTenant(
        organizationId,
        tx =>
          tx.$executeRaw`UPDATE public.inbound_email_sources
        SET enabled = TRUE WHERE route_key = 'route-alpha'`
      )
    ).rejects.toThrow();
    await expect(
      app.withTenant(
        organizationId,
        tx =>
          tx.$executeRaw`UPDATE public.inbound_email_sources
        SET source_key = 'hijacked' WHERE route_key = 'route-alpha'`
      )
    ).rejects.toThrow();
    await expect(
      app.withTenant(
        organizationId,
        tx =>
          tx.$executeRaw`DELETE FROM public.inbound_email_sources
        WHERE route_key = 'route-alpha'`
      )
    ).rejects.toThrow();
    await expect(
      app.withTenant(
        otherOrganizationId,
        tx =>
          tx.$executeRaw`UPDATE public.inbound_email_sources
        SET version = 900 WHERE route_key = 'route-alpha'`
      )
    ).resolves.toBe(0);
    expect((await vault.list(context()))[0]?.version).toBe(1);
  });

  it("serializes racing rotations; exactly one version wins", async () => {
    await vault.register(created(), context());
    const results = await Promise.allSettled([
      vault.rotate(
        {
          routeKey: "route-alpha",
          keyId: "key-two",
          expectedVersion: 1,
          secretBase64: secretTwo,
        },
        context()
      ),
      vault.rotate(
        {
          routeKey: "route-alpha",
          keyId: "key-three",
          expectedVersion: 1,
          secretBase64: secretTwo,
        },
        context()
      ),
    ]);
    expect(
      results.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(
      1
    );
    const [current] = await vault.list(context());
    expect(current?.version).toBe(2);
    expect(current?.enabled).toBe(false);
    expect(current?.keys).toHaveLength(2);
  });

  it("fails closed on missing/invalid encryption master keys", () => {
    expect(() => new InboundSourceVault(app, "invalid")).toThrow();
    expect(() => new InboundSourceVault(app, "")).toThrow();
  });
});
