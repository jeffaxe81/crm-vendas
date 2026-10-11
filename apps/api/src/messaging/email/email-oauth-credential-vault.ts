import { createHmac } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
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
  verifiedSenderEmail: string;
  refreshToken: string;
  expectedVersion: number;
}>;

export type CredentialVaultStatus = Readonly<{
  provider: EmailOAuthProvider;
  version: number;
  hasEncryptedCredential: boolean;
  connectionStatus: "NOT_CONNECTED" | "STAGED_ONLY";
  sendingEnabled: false;
}>;

type StoredVersion = { version: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT = /^[A-Za-z0-9._:@-]{1,512}$/;
const SENDER =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
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
      !SUBJECT.test(input.providerSubject) ||
      !SENDER.test(input.verifiedSenderEmail) ||
      input.verifiedSenderEmail.length > 254 ||
      !REFRESH_TOKEN.test(input.refreshToken)
    )
      denied();

    const version = input.expectedVersion + 1;
    const org = context.organizationId;
    const provider = input.provider;
    const subject = this.subjectHmac(org, provider, input.providerSubject);
    const sender = encryptWebhookSecret(
      input.verifiedSenderEmail.toLowerCase(),
      this.encryptionKey,
      sealedBinding(org, provider, version, "sender")
    );
    const refresh = encryptWebhookSecret(
      input.refreshToken,
      this.encryptionKey,
      sealedBinding(org, provider, version, "refresh")
    );

    return this.prisma.withTenant(org, async tx => {
      await this.assertAdmin(tx, context);
      const pref = await tx.emailProviderPreference.findFirst({
        where: { organizationId: org },
        select: { providerCode: true },
      });
      if (pref?.providerCode !== provider) denied();

      let updated: StoredVersion[];
      if (input.expectedVersion === 0) {
        updated = await tx.$queryRaw<StoredVersion[]>`
          INSERT INTO public.email_oauth_credentials
            (organization_id, provider_code, version, subject_hmac,
             encrypted_sender, encrypted_refresh_token)
          VALUES (
            ${org}::uuid, ${provider}, ${version}, ${subject},
            ${sender}, ${refresh}
          )
          ON CONFLICT (organization_id, provider_code) DO NOTHING
          RETURNING version
        `;
      } else {
        updated = await tx.$queryRaw<StoredVersion[]>`
          UPDATE public.email_oauth_credentials
          SET version = ${version}, subject_hmac = ${subject},
              encrypted_sender = ${sender},
              encrypted_refresh_token = ${refresh},
              updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = ${org}::uuid
            AND provider_code = ${provider}
            AND version = ${input.expectedVersion}
          RETURNING version
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
            sendingEnabled: false,
            identityVerification: "UPSTREAM_REQUIRED",
          },
        },
      });
      return this.view(provider, version);
    });
  }

  private view(
    provider: EmailOAuthProvider,
    version: number
  ): CredentialVaultStatus {
    return {
      provider,
      version,
      hasEncryptedCredential: version > 0,
      connectionStatus: version > 0 ? "STAGED_ONLY" : "NOT_CONNECTED",
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
      await this.assertAdmin(tx, context);
      const rows = await tx.$queryRaw<StoredVersion[]>`
        SELECT version FROM public.email_oauth_credentials
        WHERE organization_id = ${context.organizationId}::uuid
          AND provider_code = ${provider}
      `;
      return this.view(provider, rows[0]?.version ?? 0);
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
      await this.assertAdmin(tx, context);
      const deleted = await tx.$queryRaw<StoredVersion[]>`
        DELETE FROM public.email_oauth_credentials
        WHERE organization_id = ${context.organizationId}::uuid
          AND provider_code = ${provider}
          AND version = ${expectedVersion}
        RETURNING version
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
