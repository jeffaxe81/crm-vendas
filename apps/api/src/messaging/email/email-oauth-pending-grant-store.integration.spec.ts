import { createEmailOAuthAuthorizationIntent } from "./email-oauth-authorization-intent";
import { EmailOAuthPendingGrantStore } from "./email-oauth-pending-grant-store";
import { PrismaService } from "../../database/prisma.service";
import { DisabledEmailProvider } from "./email-provider";

const key = Buffer.alloc(32, 72).toString("base64");
const callbackUrl = "https://crm.example.com/admin/email/oauth/callback";

describe("F4.3-04B2 pending OAuth intents PostgreSQL/RLS (offline only)", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let store: EmailOAuthPendingGrantStore;
  let organizationId: string;
  let otherOrganizationId: string;
  let adminId: string;
  let otherAdminId: string;
  let sellerId: string;

  const context = () => ({
    organizationId,
    actorUserId: adminId,
    requestId: "test-oauth-pending",
  });
  const intent = (provider: "GMAIL" | "MICROSOFT_365" = "GMAIL") =>
    createEmailOAuthAuthorizationIntent({
      provider,
      organizationId,
      actorUserId: adminId,
      clientId: "crm.oauth-test",
      redirectUri: callbackUrl,
      ...(provider === "MICROSOFT_365"
        ? { microsoftTenantId: "00000000-0000-4000-8000-000000000001" }
        : {}),
    });
  const select = async (provider: "GMAIL" | "MICROSOFT_365" = "GMAIL") =>
    app.withTenant(organizationId, tx =>
      tx.emailProviderPreference.create({
        data: { organizationId, providerCode: provider },
      })
    );

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    store = new EmailOAuthPendingGrantStore(app, key);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    adminId = (await owner.user.create({
      data: {
        email: "oauth-admin@test.local",
        emailNormalized: "oauth-admin@test.local",
        displayName: "Admin OAuth",
        passwordHash: "synthetic",
      },
    })).id;
    otherAdminId = (await owner.user.create({
      data: {
        email: "oauth-other-admin@test.local",
        emailNormalized: "oauth-other-admin@test.local",
        displayName: "Other Admin OAuth",
        passwordHash: "synthetic",
      },
    })).id;
    sellerId = (await owner.user.create({
      data: {
        email: "oauth-seller@test.local",
        emailNormalized: "oauth-seller@test.local",
        displayName: "Seller OAuth",
        passwordHash: "synthetic",
      },
    })).id;
    organizationId = (await owner.organization.create({
      data: { name: "OAuth A", slug: "oauth-a" },
    })).id;
    otherOrganizationId = (await owner.organization.create({
      data: { name: "OAuth B", slug: "oauth-b" },
    })).id;
    await owner.organizationMembership.createMany({
      data: [
        { organizationId, userId: adminId, role: "ADMIN" },
        { organizationId, userId: otherAdminId, role: "ADMIN" },
        { organizationId, userId: sellerId, role: "SELLER" },
        { organizationId: otherOrganizationId, userId: adminId, role: "ADMIN" },
      ],
    });
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
  });

  it("stores encrypted PKCE by tenant and consumes exactly once", async () => {
    await select();
    const created = intent();
    const state = new URL(created.authorizationUrl).searchParams.get("state")!;
    await store.stage(created.pendingGrant, context());
    const stored = await app.withTenant(organizationId, tx =>
      tx.$queryRaw<{ state_hash: string; encrypted_code_verifier: string }[]>`
        SELECT state_hash, encrypted_code_verifier
        FROM public.email_oauth_pending_grants
      `
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]?.state_hash).toBe(created.pendingGrant.stateHash);
    expect(JSON.stringify(stored)).not.toContain(state);
    expect(JSON.stringify(stored)).not.toContain(created.pendingGrant.codeVerifier);
    expect(
      await app.$queryRaw`SELECT * FROM public.email_oauth_pending_grants`
    ).toEqual([]);
    await expect(
      app.withTenant(otherOrganizationId, tx =>
        tx.$queryRaw`SELECT * FROM public.email_oauth_pending_grants`
      )
    ).resolves.toEqual([]);
    await expect(store.consume(state, context())).resolves.toEqual({
      provider: "GMAIL",
      codeVerifier: created.pendingGrant.codeVerifier,
      redirectUri: callbackUrl,
    });
    await expect(store.consume(state, context())).rejects.toThrow();
    expect(await app.withTenant(organizationId, tx =>
      tx.$queryRaw`SELECT * FROM public.email_oauth_pending_grants`
    )).toEqual([]);
    expect((await app.withTenant(organizationId, tx =>
      tx.auditLog.findMany({ where: { action: { startsWith: "email.oauth_intent." } } })
    ))).toHaveLength(2);
    await expect(new DisabledEmailProvider().send({
      organizationId,
      referenceId: organizationId,
      idempotencyKey: "oauth-no-send",
      purpose: "SLA_DUE_SOON",
      recipient: "someone@example.com",
      subject: "disabled",
      text: "disabled",
      html: "<p>disabled</p>",
    })).rejects.toThrow();
  });

  it("rejects actor, organization and membership crossing without consuming grant", async () => {
    await select();
    const created = intent();
    const state = new URL(created.authorizationUrl).searchParams.get("state")!;
    await store.stage(created.pendingGrant, context());
    await expect(store.consume(state, {
      ...context(),
      actorUserId: otherAdminId,
    })).rejects.toThrow();
    await expect(store.consume(state, {
      ...context(),
      organizationId: otherOrganizationId,
    })).rejects.toThrow();
    await expect(store.consume(state, {
      ...context(),
      actorUserId: sellerId,
    })).rejects.toThrow();
    await expect(
      app.withTenant(otherOrganizationId, tx =>
        tx.$executeRaw`
          DELETE FROM public.email_oauth_pending_grants
          WHERE organization_id = ${organizationId}::uuid
        `
      )
    ).resolves.toBe(0);
    await expect(store.consume(state, context())).resolves.toMatchObject({
      provider: "GMAIL",
    });
  });

  it("requires selected provider and rejects stale preference at consumption", async () => {
    const pending = intent("GMAIL");
    await expect(store.stage(pending.pendingGrant, context())).rejects.toThrow();
    await select();
    await store.stage(pending.pendingGrant, context());
    await app.withTenant(organizationId, tx =>
      tx.emailProviderPreference.update({
        where: { organizationId },
        data: { providerCode: "MICROSOFT_365" },
      })
    );
    const state = new URL(pending.authorizationUrl).searchParams.get("state")!;
    await expect(store.consume(state, context())).rejects.toThrow();
    await app.withTenant(organizationId, tx =>
      tx.emailProviderPreference.update({
        where: { organizationId },
        data: { providerCode: "GMAIL" },
      })
    );
    await expect(store.consume(state, context())).resolves.toMatchObject({
      provider: "GMAIL",
    });
  });

  it("rejects expiration and invalid state without leaking the verifier", async () => {
    await select();
    const created = intent();
    const state = new URL(created.authorizationUrl).searchParams.get("state")!;
    await store.stage(created.pendingGrant, context());
    for (const value of ["", "evil\n", "x".repeat(43), "a".repeat(44)]) {
      await expect(store.consume(value, context())).rejects.toThrow();
    }
    await app.withTenant(organizationId, tx =>
      tx.$executeRaw`
        UPDATE public.email_oauth_pending_grants
        SET created_at = NOW() - INTERVAL '10 minutes',
            expires_at = NOW() - INTERVAL '5 minutes'
      `
    );
    await expect(store.consume(state, context())).rejects.toThrow();
    expect(await app.withTenant(organizationId, tx =>
      tx.$queryRaw`SELECT state_hash FROM public.email_oauth_pending_grants`
    )).toHaveLength(1);
  });

  it("prevents concurrent replay and rejects tampered ciphertext", async () => {
    await select();
    const first = intent();
    const state = new URL(first.authorizationUrl).searchParams.get("state")!;
    await store.stage(first.pendingGrant, context());
    const outcomes = await Promise.allSettled([
      store.consume(state, context()),
      store.consume(state, context()),
    ]);
    expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(item => item.status === "rejected")).toHaveLength(1);
    const second = intent();
    const secondState = new URL(second.authorizationUrl).searchParams.get("state")!;
    await store.stage(second.pendingGrant, context());
    await app.withTenant(organizationId, tx =>
      tx.$executeRaw`
        UPDATE public.email_oauth_pending_grants
        SET encrypted_code_verifier = 'v1.' || repeat('A', 70)
      `
    );
    await expect(store.consume(secondState, context())).rejects.toThrow();
    expect(await app.withTenant(organizationId, tx =>
      tx.$queryRaw`SELECT state_hash FROM public.email_oauth_pending_grants`
    )).toHaveLength(1);
  });

  it("fails closed with an absent/invalid encryption key and mismatched binding", async () => {
    expect(() => new EmailOAuthPendingGrantStore(app, "short")).toThrow();
    await select();
    const created = intent();
    await expect(store.stage({
      ...created.pendingGrant,
      organizationId: otherOrganizationId,
    }, context())).rejects.toThrow();
    await expect(store.stage({
      ...created.pendingGrant,
      codeVerifier: "NOT_PKCE",
    }, context())).rejects.toThrow();
    await expect(store.stage({
      ...created.pendingGrant,
      expiresAt: created.pendingGrant.expiresAt + 60000,
    }, context())).rejects.toThrow();
  });
});
