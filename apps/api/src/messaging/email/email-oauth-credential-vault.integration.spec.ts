import { PrismaService } from "../../database/prisma.service";
import { decryptWebhookSecret } from "../../webhooks/webhook-secret";
import { createEmailOAuthAuthorizationIntent } from "./email-oauth-authorization-intent";
import { EmailOAuthPendingGrantStore } from "./email-oauth-pending-grant-store";
import { EmailOAuthCredentialVault } from "./email-oauth-credential-vault";
import { DisabledEmailProvider } from "./email-provider";

const encryptionKey = Buffer.alloc(32, 93).toString("base64");
const pendingKey = Buffer.alloc(32, 92).toString("base64");
const callbackUrl = "https://crm.example.com/admin/email/oauth/callback";
const token = "fake-refresh-token-used-only-for-integration-tests.1";

describe("F4.3-05A credential vault PostgreSQL/RLS (offline only)", () => {
  let owner: PrismaService;
  let app: PrismaService;
  let vault: EmailOAuthCredentialVault;
  let pending: EmailOAuthPendingGrantStore;
  let organizationId: string;
  let otherOrganizationId: string;
  let adminId: string;
  let sessionId: string;
  let otherAdminId: string;
  let sellerId: string;

  const context = () => ({
    organizationId,
    actorUserId: adminId,
    sessionId,
    requestId: "oauth-vault-tests",
  });
  const credential = (expectedVersion = 0) => ({
    provider: "GMAIL" as const,
    providerSubject: "google-subject-12345",
    verifiedSenderEmail: "Admin@Example.com",
    refreshToken: token,
    expectedVersion,
    expectedProviderPreferenceVersion: 1,
  });
  const selectProvider = async () =>
    app.withTenant(organizationId, tx =>
      tx.emailProviderPreference.create({
        data: { organizationId, providerCode: "GMAIL" },
      })
    );

  beforeAll(() => {
    if (!process.env.RLS_DATABASE_URL)
      throw Error("Restricted PostgreSQL role required");
    owner = new PrismaService(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
    );
    app = new PrismaService(process.env.RLS_DATABASE_URL);
    vault = new EmailOAuthCredentialVault(app, encryptionKey);
    pending = new EmailOAuthPendingGrantStore(app, pendingKey);
  });

  beforeEach(async () => {
    await owner.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    adminId = (
      await owner.user.create({
        data: {
          email: "vault-admin@example.test",
          emailNormalized: "vault-admin@example.test",
          displayName: "Vault admin",
          passwordHash: "synthetic",
        },
      })
    ).id;
    otherAdminId = (
      await owner.user.create({
        data: {
          email: "vault-other@example.test",
          emailNormalized: "vault-other@example.test",
          displayName: "Vault other admin",
          passwordHash: "synthetic",
        },
      })
    ).id;
    sellerId = (
      await owner.user.create({
        data: {
          email: "vault-seller@example.test",
          emailNormalized: "vault-seller@example.test",
          displayName: "Vault seller",
          passwordHash: "synthetic",
        },
      })
    ).id;
    organizationId = (
      await owner.organization.create({
        data: { name: "Vault A", slug: "vault-a" },
      })
    ).id;
    otherOrganizationId = (
      await owner.organization.create({
        data: { name: "Vault B", slug: "vault-b" },
      })
    ).id;
    await owner.organizationMembership.createMany({
      data: [
        { organizationId, userId: adminId, role: "ADMIN" },
        { organizationId, userId: otherAdminId, role: "ADMIN" },
        { organizationId, userId: sellerId, role: "SELLER" },
        { organizationId: otherOrganizationId, userId: adminId, role: "ADMIN" },
      ],
    });
    sessionId = (
      await owner.refreshSession.create({
        data: {
          organizationId,
          userId: adminId,
          tokenHash: "oauth-vault-refresh-token",
          expiresAt: new Date(Date.now() + 3600000),
        },
      })
    ).id;
  });

  afterAll(async () => {
    await owner?.$executeRawUnsafe('TRUNCATE "organizations", "users" CASCADE');
    await owner?.onModuleDestroy();
    await app?.onModuleDestroy();
  });

  it("encrypts token and sender with versioned AAD and exposes only metadata", async () => {
    await selectProvider();
    const status = await vault.stageVerified(credential(), context());
    expect(status).toEqual({
      provider: "GMAIL",
      version: 1,
      hasEncryptedCredential: true,
      connectionStatus: "STAGED_ONLY",
      sendingEnabled: false,
    });
    const rows = await app.withTenant(
      organizationId,
      tx =>
        tx.$queryRaw<
          {
            version: number;
            subject_hmac: string;
            encrypted_sender: string;
            encrypted_refresh_token: string;
          }[]
        >`
        SELECT version, subject_hmac, encrypted_sender, encrypted_refresh_token
        FROM public.email_oauth_credentials
      `
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain("Admin@Example.com");
    expect(JSON.stringify(rows)).not.toContain("google-subject-12345");
    expect(
      decryptWebhookSecret(
        rows[0]!.encrypted_refresh_token,
        encryptionKey,
        `email-oauth-vault:v1:${organizationId}:GMAIL:1:refresh`
      )
    ).toBe(token);
    expect(
      decryptWebhookSecret(
        rows[0]!.encrypted_sender,
        encryptionKey,
        `email-oauth-vault:v1:${organizationId}:GMAIL:1:sender`
      )
    ).toBe("admin@example.com");
    expect(
      await app.$queryRaw`SELECT * FROM public.email_oauth_credentials`
    ).toEqual([]);
    await expect(
      app.withTenant(
        otherOrganizationId,
        tx => tx.$queryRaw`SELECT * FROM public.email_oauth_credentials`
      )
    ).resolves.toEqual([]);
    expect(await vault.status("GMAIL", context())).toEqual(status);
    const audit = await app.withTenant(organizationId, tx =>
      tx.auditLog.findMany({
        where: { action: "email.oauth_vault.credential_staged" },
      })
    );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain("Admin@Example.com");
    expect(JSON.stringify(audit)).not.toContain("google-subject-12345");
  });

  it("rejects cross-tenant, inactive member, incorrect provider and stale rotation", async () => {
    await selectProvider();
    for (const invalidContext of [
      { ...context(), organizationId: otherOrganizationId },
      { ...context(), actorUserId: sellerId },
      { ...context(), actorUserId: "unknown" },
    ])
      await expect(
        vault.stageVerified(credential(), invalidContext)
      ).rejects.toThrow();
    await expect(
      vault.stageVerified(
        { ...credential(), provider: "MICROSOFT_365" },
        context()
      )
    ).rejects.toThrow();
    const one = await vault.stageVerified(credential(), context());
    expect(one.version).toBe(1);
    await expect(
      vault.stageVerified(credential(), context())
    ).rejects.toThrow();
    await expect(
      vault.stageVerified(credential(9), context())
    ).rejects.toThrow();
    const rotated = await vault.stageVerified(
      {
        ...credential(1),
        refreshToken: "next-rotation-refresh-token-example.2",
      },
      context()
    );
    expect(rotated.version).toBe(2);
    await expect(
      vault.stageVerified(credential(1), context())
    ).rejects.toThrow();
    await expect(vault.deleteLocal("GMAIL", 1, context())).rejects.toThrow();
  });

  it("makes concurrent write rotations linearizable with version CAS", async () => {
    await selectProvider();
    await vault.stageVerified(credential(), context());
    const results = await Promise.allSettled([
      vault.stageVerified(
        {
          ...credential(1),
          refreshToken: "concurrent-refresh-token-value-A.2",
        },
        context()
      ),
      vault.stageVerified(
        {
          ...credential(1),
          refreshToken: "concurrent-refresh-token-value-B.2",
        },
        context()
      ),
    ]);
    expect(results.filter(value => value.status === "fulfilled")).toHaveLength(
      1
    );
    expect(results.filter(value => value.status === "rejected")).toHaveLength(
      1
    );
    expect((await vault.status("GMAIL", context())).version).toBe(2);
  });

  it("rejects staging a token from a stale provider revision even after switch-back", async () => {
    await selectProvider();
    await vault.stageVerified(credential(), context());
    await app.withTenant(organizationId, tx =>
      tx.emailProviderPreference.update({
        where: { organizationId },
        data: { providerCode: "MICROSOFT_365", version: { increment: 1 } },
      })
    );
    await expect(
      vault.stageVerified(credential(1), context())
    ).rejects.toThrow();
    await app.withTenant(organizationId, tx =>
      tx.emailProviderPreference.update({
        where: { organizationId },
        data: { providerCode: "GMAIL", version: { increment: 1 } },
      })
    );
    // Same string "GMAIL", but the OAuth state was authorized at revision 1.
    await expect(
      vault.stageVerified(credential(1), context())
    ).rejects.toThrow();
    expect(await vault.status("GMAIL", context())).toMatchObject({
      version: 1,
      sendingEnabled: false,
    });
    const current = await app.withTenant(organizationId, tx =>
      tx.emailProviderPreference.findFirstOrThrow({ where: { organizationId } })
    );
    expect(current.version).toBe(3);
    const rotated = await vault.stageVerified(
      { ...credential(1), expectedProviderPreferenceVersion: current.version },
      context()
    );
    expect(rotated).toMatchObject({ version: 2, sendingEnabled: false });
  });

  it("rejects a re-saved identical provider when preference revision increases", async () => {
    await selectProvider();
    await app.withTenant(organizationId, tx =>
      tx.emailProviderPreference.update({
        where: { organizationId },
        data: { version: { increment: 1 } },
      })
    );
    await expect(vault.stageVerified(credential(), context())).rejects.toThrow();
    expect(await vault.status("GMAIL", context())).toMatchObject({ version: 0 });
  });

  it("local deletion purges encrypted credentials and pending grants", async () => {
    await selectProvider();
    await vault.stageVerified(credential(), context());
    const pendingIntent = createEmailOAuthAuthorizationIntent({
      provider: "GMAIL",
      organizationId,
      actorUserId: adminId,
      clientId: "test-only-client",
      redirectUri: callbackUrl,
    });
    await pending.stage(pendingIntent.pendingGrant, context());
    expect(
      await app.withTenant(
        organizationId,
        tx => tx.$queryRaw`SELECT id FROM public.email_oauth_pending_grants`
      )
    ).toHaveLength(1);
    await expect(
      vault.deleteLocal("GMAIL", 1, {
        ...context(),
        actorUserId: sellerId,
      })
    ).rejects.toThrow();
    expect(await vault.deleteLocal("GMAIL", 1, context())).toEqual({
      provider: "GMAIL",
      version: 0,
      hasEncryptedCredential: false,
      connectionStatus: "NOT_CONNECTED",
      sendingEnabled: false,
    });
    expect(
      await app.withTenant(
        organizationId,
        tx => tx.$queryRaw`SELECT id FROM public.email_oauth_pending_grants`
      )
    ).toEqual([]);
    expect(await vault.status("GMAIL", context())).toMatchObject({
      version: 0,
      hasEncryptedCredential: false,
    });
    await expect(vault.deleteLocal("GMAIL", 1, context())).rejects.toThrow();
    const audits = await app.withTenant(organizationId, tx =>
      tx.auditLog.findMany({
        where: { action: "email.oauth_vault.local_credential_deleted" },
      })
    );
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(token);
    expect(JSON.stringify(audits)).toContain("externalConsentRevoked");
  });

  it("rejects missing/invalid encryption keys and malformed credentials", async () => {
    expect(() => new EmailOAuthCredentialVault(app, "bad")).toThrow();
    await selectProvider();
    for (const patch of [
      { refreshToken: "short" },
      { refreshToken: "contains a space or newline" },
      { providerSubject: "\nno" },
      { verifiedSenderEmail: "bad" },
      { expectedVersion: -1 },
      { expectedVersion: 1.5 },
      { expectedProviderPreferenceVersion: 0 },
      { expectedProviderPreferenceVersion: 1.5 },
    ])
      await expect(
        vault.stageVerified({ ...credential(), ...patch }, context())
      ).rejects.toThrow();
    expect(await vault.status("GMAIL", context())).toMatchObject({
      version: 0,
    });
    await expect(
      new DisabledEmailProvider().send({
        organizationId,
        referenceId: organizationId,
        idempotencyKey: "vault-no-send",
        purpose: "SLA_DUE_SOON",
        recipient: "someone@example.com",
        subject: "disabled",
        text: "disabled",
        html: "<p>disabled</p>",
      })
    ).rejects.toThrow();
  });
});
