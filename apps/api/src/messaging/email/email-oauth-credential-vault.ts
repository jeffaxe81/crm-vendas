import { createHmac } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  webhookEncryptionKey,
} from "../../webhooks/webhook-secret";
import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";
import type { EmailOAuthGrantContext } from "./email-oauth-pending-grant-store";

/**
 * F4.3-05A: offline credential vault. No HTTP controller, provider API client,
 * refresh-token accessor or EmailModule registration. Callers MUST first
 * cryptographically verify the provider identity, issuer, audience and
 * authorized sender in a separate future OAuth callback integration.
 */
export type StagedOAuthCredential = Readonly<{
  provider: EmailOAuthProvider;
  providerSubject: string;
  verifiedSenderEmail?: string;
  refreshToken: string;
  expectedVersion: number;
  intentCreatedAt?: Date;
  /** Revision of the selected provider from the consumed, one-use OAuth state. */
  expectedProviderPreferenceVersion: number;
}>;

export type CredentialVaultStatus = Readonly<{
  provider: EmailOAuthProvider;
  version: number;
  hasEncryptedCredential: boolean;
  connectionStatus: "NOT_CONNECTED" | "STAGED_ONLY";
  sendingEnabled: false;
}>;

type StoredVersion = {
  version: number;
  provider_preference_version: number | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT = /^[A-Za-z0-9._:@-]{1,512}$/;
const SENDER =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const REFRESH_TOKEN = /^[\x21-\x7e]{20,8192}$/;
const PROVIDERS: readonly string[] = ["GMAIL", "MICROSOFT_365"];

function denied(): never {
  throw new ForbiddenException({ code: "EMAIL_OAUTH_VAULT_UNAVAILABLE" });
}

function versionConflict(): never {
  throw new ConflictException({ code: "EMAIL_OAUTH_VAULT_VERSION_CONFLICT" });
}

function sealedBinding(
  organizationId: string,
  provider: EmailOAuthProvider,
  version: number,
  purpose: "sender" | "refresh"
): string {
  return `email-oauth-vault:v1:${organizationId}:${provider}:${version}:${purpose}`;
}

export class EmailOAuthCredentialVault {
  private readonly encryptionKey: string;
  private readonly subjectHmacKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    key?: string
  ) {
    const candidate = key ?? process.env.EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY;
    try {
      this.subjectHmacKey = webhookEncryptionKey(candidate);
    } catch {
      throw new ServiceUnavailableException({
        code: "EMAIL_OAUTH_TOKEN_ENCRYPTION_UNAVAILABLE",
      });
    }
    this.encryptionKey = candidate!;
  }

  private validateContext(
    provider: EmailOAuthProvider,
    context: EmailOAuthGrantContext
  ): void {
    if (
      !UUID.test(context.organizationId) ||
      !UUID.test(context.actorUserId) ||
      !PROVIDERS.includes(provider)
    )
      denied();
  }

  private async assertAdmin(
    tx: Prisma.TransactionClient,
    context: EmailOAuthGrantContext
  ): Promise<void> {
    const membership = await tx.organizationMembership.findFirst({
      where: {
        organizationId: context.organizationId,
        userId: context.actorUserId,
        isActive: true,
        user: { isActive: true },
        organization: { isActive: true },
        OR: [{ role: "ADMIN" }, { isSuperuser: true }],
      },
      select: { id: true },
    });
    if (!membership) denied();
  }

  private subjectHmac(
    organizationId: string,
    provider: EmailOAuthProvider,
    providerSubject: string
  ): string {
    return createHmac("sha256", this.subjectHmacKey)
      .update(
        `email-oauth-subject:v1:${organizationId}:${provider}:${providerSubject}`,
        "utf8"
      )
      .digest("hex");
  }

  /**
   * Called ONLY by a future security-reviewed provider verifier.
   * Optimistic concurrency prevents a stale callback replacing a newer grant.
   * All values written to SQL are sealed; no plaintext or token in audit logs.
   */
  async stageVerified(
    input: StagedOAuthCredential,
    context: EmailOAuthGrantContext
  ): Promise<CredentialVaultStatus> {
    this.validateContext(input.provider, context);
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 0 ||
      !Number.isSafeInteger(input.expectedProviderPreferenceVersion) ||
      input.expectedProviderPreferenceVersion < 1 ||
      !SUBJECT.test(input.providerSubject) ||
      (input.provider === "GMAIL" &&
        !SENDER.test(input.verifiedSenderEmail ?? "")) ||
      (input.verifiedSenderEmail !== undefined &&
        (!SENDER.test(input.verifiedSenderEmail) ||
          input.verifiedSenderEmail.length > 254)) ||
      !REFRESH_TOKEN.test(input.refreshToken)
    )
      denied();

    const version = input.expectedVersion + 1;
    const org = context.organizationId;
    const provider = input.provider;
    const subject = this.subjectHmac(org, provider, input.providerSubject);
    const sender = encryptWebhookSecret(
      input.verifiedSenderEmail?.toLowerCase() ?? "MICROSOFT_SUBJECT_BOUND",
      this.encryptionKey,
      sealedBinding(org, provider, version, "sender")
    );
    const refresh = encryptWebhookSecret(
      input.refreshToken,
      this.encryptionKey,
      sealedBinding(org, provider, version, "refresh")
    );

    return this.prisma.withTenant(org, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`tenant-maintenance:${org}`}, 0))`;
      await this.assertAdmin(tx, context);
      // Lock the provider selection through the credential commit. This
      // closes the gap after one-time state consumption and OIDC exchange.
      const [pref] = await tx.$queryRaw<
        { provider_code: string; version: number }[]
      >`
        SELECT provider_code, version FROM public.email_provider_preferences
        WHERE organization_id = ${org}::uuid
        FOR UPDATE
      `;
      if (
        pref?.provider_code !== provider ||
        pref?.version !== input.expectedProviderPreferenceVersion
      )
        denied();

      let updated: StoredVersion[];
      if (input.expectedVersion === 0) {
        updated = await tx.$queryRaw<StoredVersion[]>`
          INSERT INTO public.email_oauth_credentials
            (organization_id, provider_code, version,
             provider_preference_version, subject_hmac,
             encrypted_sender, encrypted_refresh_token)
          VALUES (
            ${org}::uuid, ${provider}, ${version},
            ${pref.version}, ${subject}, ${sender}, ${refresh}
          )
          ON CONFLICT (organization_id, provider_code) DO NOTHING
          RETURNING version, provider_preference_version
        `;
      } else {
        updated = await tx.$queryRaw<StoredVersion[]>`
          UPDATE public.email_oauth_credentials
          SET version = ${version},
              provider_preference_version = ${pref.version},
              subject_hmac = ${subject},
              encrypted_sender = ${sender},
              encrypted_refresh_token = ${refresh},
              updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = ${org}::uuid
            AND provider_code = ${provider}
            AND version = ${input.expectedVersion}
            AND created_at <= ${input.intentCreatedAt ?? new Date()}
          RETURNING version, provider_preference_version
        `;
      }
      if (updated.length !== 1) versionConflict();
      await tx.auditLog.create({
        data: {
          organizationId: org,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          action: "email.oauth_vault.credential_staged",
          entityType: "EmailOAuthCredential",
          entityId: org,
          metadata: {
            provider,
            version,
            providerPreferenceVersion: pref.version,
            sendingEnabled: false,
            identityVerification: "UPSTREAM_REQUIRED",
          },
        },
      });
      return this.view(provider, version);
    });
  }

  /** Internal worker access only. Serialized rotation prevents concurrent refresh use.
   * The token never crosses an HTTP response, audit event or backup boundary. */
  async withRefreshToken<T>(
    organizationId: string,
    provider: EmailOAuthProvider,
    refresh: (
      token: string
    ) => Promise<{ value: T; refreshToken?: string; revoked?: boolean }>
  ): Promise<T> {
    if (!UUID.test(organizationId) || !PROVIDERS.includes(provider)) denied();
    const result = await this.prisma.withTenant(
      organizationId,
      async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`tenant-maintenance:${organizationId}`}, 0))`;
        // Same lock order as stageVerified/deleteLocal: preference, credential.
        const [pref] = await tx.$queryRaw<
          { provider_code: string; version: number }[]
        >`
        SELECT provider_code, version FROM public.email_provider_preferences
        WHERE organization_id = ${organizationId}::uuid FOR UPDATE
      `;
        if (pref?.provider_code !== provider) denied();
        const [row] = await tx.$queryRaw<
          {
            version: number;
            provider_preference_version: number;
            encrypted_refresh_token: string;
          }[]
        >`
        SELECT version, provider_preference_version, encrypted_refresh_token
        FROM public.email_oauth_credentials
        WHERE organization_id = ${organizationId}::uuid AND provider_code = ${provider}
        FOR UPDATE
      `;
        if (!row || row.provider_preference_version !== pref.version) denied();
        const token = decryptWebhookSecret(
          row.encrypted_refresh_token,
          this.encryptionKey,
          sealedBinding(organizationId, provider, row.version, "refresh")
        );
        const refreshed = await refresh(token);
        if (refreshed.revoked) {
          await tx.$executeRaw`DELETE FROM public.email_oauth_credentials
          WHERE organization_id = ${organizationId}::uuid AND provider_code = ${provider}`;
          await tx.$executeRaw`DELETE FROM public.email_oauth_pending_grants
          WHERE organization_id = ${organizationId}::uuid AND provider_code = ${provider}`;
          return { revoked: true as const };
        }
        if (refreshed.refreshToken !== undefined) {
          if (!REFRESH_TOKEN.test(refreshed.refreshToken)) denied();
          const sealed = encryptWebhookSecret(
            refreshed.refreshToken,
            this.encryptionKey,
            sealedBinding(organizationId, provider, row.version, "refresh")
          );
          await tx.$executeRaw`UPDATE public.email_oauth_credentials
          SET encrypted_refresh_token = ${sealed}, updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = ${organizationId}::uuid AND provider_code = ${provider}`;
        }
        return { revoked: false as const, value: refreshed.value };
      },
      { timeout: 12000 }
    );
    if (result.revoked) denied();
    return result.value;
  }

  private view(
    provider: EmailOAuthProvider,
    version: number,
    currentProviderRevision = version > 0
  ): CredentialVaultStatus {
    return {
      provider,
      version,
      hasEncryptedCredential: version > 0 && currentProviderRevision,
      connectionStatus:
        version > 0 && currentProviderRevision
          ? "STAGED_ONLY"
          : "NOT_CONNECTED",
      sendingEnabled: false,
    };
  }

  /** Metadata only; this function does not decrypt or expose credentials. */
  async status(
    provider: EmailOAuthProvider,
    context: EmailOAuthGrantContext
  ): Promise<CredentialVaultStatus> {
    this.validateContext(provider, context);
    return this.prisma.withTenant(context.organizationId, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`tenant-maintenance:${context.organizationId}`}, 0))`;
      await this.assertAdmin(tx, context);
      const rows = await tx.$queryRaw<StoredVersion[]>`
        SELECT version, provider_preference_version
        FROM public.email_oauth_credentials
        WHERE organization_id = ${context.organizationId}::uuid
          AND provider_code = ${provider}
      `;
      const pref = await tx.emailProviderPreference.findFirst({
        where: { organizationId: context.organizationId },
        select: { providerCode: true, version: true },
      });
      return this.view(
        provider,
        rows[0]?.version ?? 0,
        pref?.providerCode === provider &&
          rows[0]?.provider_preference_version !== null &&
          rows[0]?.provider_preference_version === pref?.version
      );
    });
  }

  /**
   * Local deletion only: does not revoke provider-issued OAuth consent.
   * Removes pending grants to avoid a stale authorization completing later.
   * No external revocation or email delivery is attempted.
   */
  async deleteLocal(
    provider: EmailOAuthProvider,
    expectedVersion: number,
    context: EmailOAuthGrantContext
  ): Promise<CredentialVaultStatus> {
    this.validateContext(provider, context);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) denied();
    return this.prisma.withTenant(context.organizationId, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`tenant-maintenance:${context.organizationId}`}, 0))`;
      await this.assertAdmin(tx, context);
      // Serialize credential and pending-grant mutations behind the same preference row.
      await tx.$queryRaw`SELECT version FROM public.email_provider_preferences WHERE organization_id = ${context.organizationId}::uuid FOR UPDATE`;
      const deleted = await tx.$queryRaw<StoredVersion[]>`
        DELETE FROM public.email_oauth_credentials
        WHERE organization_id = ${context.organizationId}::uuid
          AND provider_code = ${provider}
          AND version = ${expectedVersion}
        RETURNING version, provider_preference_version
      `;
      if (deleted.length !== 1) versionConflict();
      await tx.$executeRaw`
        DELETE FROM public.email_oauth_pending_grants
        WHERE organization_id = ${context.organizationId}::uuid
          AND provider_code = ${provider}
      `;
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          action: "email.oauth_vault.local_credential_deleted",
          entityType: "EmailOAuthCredential",
          entityId: context.organizationId,
          metadata: {
            provider,
            version: expectedVersion,
            externalConsentRevoked: false,
            sendingEnabled: false,
          },
        },
      });
      return this.view(provider, 0);
    });
  }
}
