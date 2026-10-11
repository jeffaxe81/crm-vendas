import { createHash } from "node:crypto";
import { isIP } from "node:net";
import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  webhookEncryptionKey,
} from "../../webhooks/webhook-secret";
import {
  EMAIL_OAUTH_INTENT_TTL_MS,
  type EmailOAuthPendingGrant,
  type EmailOAuthProvider,
} from "./email-oauth-authorization-intent";

/**
 * F4.3-04B2. Offline service. Not registered in EmailModule, no controller,
 * no exchange with Google/Microsoft and no email transport.
 *
 * A future callback MUST authenticate the same administrator and organization.
 * Neither the OAuth query string nor an e-mail address resolves a tenant.
 */
export type EmailOAuthGrantContext = Readonly<{
  organizationId: string;
  actorUserId: string;
  requestId: string;
}>;

export type EmailOAuthSessionGrantContext = EmailOAuthGrantContext &
  Readonly<{ sessionId: string }>;

export type ConsumedEmailOAuthGrant = Readonly<{
  provider: EmailOAuthProvider;
  /** Bind the later token-vault write to the same selected-provider revision. */
  providerPreferenceVersion: number;
  codeVerifier: string;
  /** Compare with the verified OIDC token nonce; do not send to browsers. */
  oidcNonce: string;
  redirectUri: string;
}>;

type StoredGrant = {
  provider_code: string;
  provider_preference_version: number | null;
  encrypted_code_verifier: string;
  encrypted_nonce: string;
  redirect_uri: string;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;
const PKCE_VERIFIER = /^[a-zA-Z0-9_-]{64}$/;
const OIDC_NONCE = /^[a-zA-Z0-9_-]{43}$/;
const URL_SAFE_STATE = /^[a-zA-Z0-9_-]{43}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PROVIDERS: readonly string[] = ["GMAIL", "MICROSOFT_365"];

function forbidden(): never {
  throw new ForbiddenException({ code: "EMAIL_OAUTH_STATE_UNAVAILABLE" });
}

function validateRedirect(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      raw.length <= 512 &&
      raw === u.toString() &&
      u.protocol === "https:" &&
      u.username === "" &&
      u.password === "" &&
      u.port === "" &&
      u.search === "" &&
      u.hash === "" &&
      u.pathname === "/admin/email/oauth/callback" &&
      isIP(u.hostname) === 0 &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(u.hostname)
    );
  } catch {
    return false;
  }
}

function binding(
  grant: Pick<
    EmailOAuthPendingGrant,
    "organizationId" | "actorUserId" | "provider" | "stateHash"
  >
): string {
  return `email-oauth-pending:v1:${grant.organizationId}:${grant.actorUserId}:${grant.provider}:${grant.stateHash}`;
}

function nonceBinding(
  grant: Pick<
    EmailOAuthPendingGrant,
    "organizationId" | "actorUserId" | "provider" | "stateHash"
  >
): string {
  return binding(grant) + ":oidc-nonce";
}

export class EmailOAuthPendingGrantStore {
  private readonly key: string;

  constructor(
    private readonly prisma: PrismaService,
    encryptionKey?: string
  ) {
    const candidate =
      encryptionKey ?? process.env.EMAIL_OAUTH_PENDING_ENCRYPTION_KEY;
    try {
      webhookEncryptionKey(candidate);
    } catch {
      throw new ServiceUnavailableException({
        code: "EMAIL_OAUTH_PENDING_ENCRYPTION_UNAVAILABLE",
      });
    }
    this.key = candidate!;
  }

  private async assertAdmin(
    tx: Prisma.TransactionClient,
    context: EmailOAuthGrantContext
  ) {
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
    if (!membership) forbidden();
  }

  private async assertSession(
    tx: Prisma.TransactionClient,
    context: EmailOAuthSessionGrantContext
  ): Promise<void> {
    const active = await tx.refreshSession.findFirst({
      where: {
        id: context.sessionId,
        organizationId: context.organizationId,
        userId: context.actorUserId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!active) forbidden();
  }

  /** Only a server-created, short-lived intent can be staged. */
  async stage(
    grant: EmailOAuthPendingGrant,
    context: EmailOAuthSessionGrantContext
  ): Promise<void> {
    const now = Date.now();
    if (
      !UUID.test(context.organizationId) ||
      !UUID.test(context.actorUserId) ||
      !UUID.test(context.sessionId) ||
      context.organizationId !== grant.organizationId ||
      context.actorUserId !== grant.actorUserId ||
      !PROVIDERS.includes(grant.provider) ||
      !SHA256_HEX.test(grant.stateHash) ||
      !PKCE_VERIFIER.test(grant.codeVerifier) ||
      !OIDC_NONCE.test(grant.oidcNonce) ||
      !validateRedirect(grant.redirectUri) ||
      !Number.isSafeInteger(grant.createdAt) ||
      !Number.isSafeInteger(grant.expiresAt) ||
      grant.createdAt < now - 30000 ||
      grant.createdAt > now + 30000 ||
      grant.expiresAt !== grant.createdAt + EMAIL_OAUTH_INTENT_TTL_MS
    )
      forbidden();

    const encrypted = encryptWebhookSecret(
      grant.codeVerifier,
      this.key,
      binding(grant)
    );
    const encryptedNonce = encryptWebhookSecret(
      grant.oidcNonce,
      this.key,
      nonceBinding(grant)
    );
    await this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdmin(tx, context);
      await this.assertSession(tx, context);
      // Lock the preference revision while staging: a concurrent provider
      // switch cannot commit between selecting and persisting this grant.
      const [pref] = await tx.$queryRaw<
        { provider_code: string; version: number }[]
      >`
        SELECT provider_code, version FROM public.email_provider_preferences
        WHERE organization_id = ${context.organizationId}::uuid
        FOR UPDATE
      `;
      if (pref?.provider_code !== grant.provider) forbidden();
      await tx.$executeRaw`
        INSERT INTO public.email_oauth_pending_grants
          (organization_id, actor_user_id, session_id, provider_code,
           provider_preference_version, state_hash,
           encrypted_code_verifier, encrypted_nonce, redirect_uri, created_at, expires_at)
        VALUES (
          ${context.organizationId}::uuid,
          ${context.actorUserId}::uuid,
          ${context.sessionId}::uuid,
          ${grant.provider},
          ${pref.version},
          ${grant.stateHash},
          ${encrypted},
          ${encryptedNonce},
          ${grant.redirectUri},
          ${new Date(grant.createdAt)},
          ${new Date(grant.expiresAt)}
        )
      `;
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          action: "email.oauth_intent.staged",
          entityType: "EmailOAuthPendingGrant",
          entityId: context.organizationId,
          metadata: {
            provider: grant.provider,
            providerPreferenceVersion: pref.version,
            sendingEnabled: false,
          },
        },
      });
    });
  }

  /**
   * Single atomic DELETE RETURNING. A replay or cross-tenant/actor request
   * receives the same generic rejection, with no PKCE verifier disclosure.
   * Rollback restores the row if authenticated decryption fails.
   */
  async consume(
    state: string,
    context: EmailOAuthSessionGrantContext
  ): Promise<ConsumedEmailOAuthGrant> {
    if (
      !URL_SAFE_STATE.test(state) ||
      !UUID.test(context.organizationId) ||
      !UUID.test(context.actorUserId) ||
      !UUID.test(context.sessionId)
    )
      forbidden();
    const stateHash = createHash("sha256").update(state, "ascii").digest("hex");
    return this.prisma.withTenant(context.organizationId, async tx => {
      await this.assertAdmin(tx, context);
      await this.assertSession(tx, context);
      const rows = await tx.$queryRaw<StoredGrant[]>`
        DELETE FROM public.email_oauth_pending_grants
        WHERE organization_id = ${context.organizationId}::uuid
          AND actor_user_id = ${context.actorUserId}::uuid
          AND session_id = ${context.sessionId}::uuid
          AND state_hash = ${stateHash}
          AND expires_at > CURRENT_TIMESTAMP
        RETURNING provider_code, provider_preference_version,
          encrypted_code_verifier, encrypted_nonce, redirect_uri
      `;
      const row = rows[0];
      if (!row || !PROVIDERS.includes(row.provider_code)) forbidden();
      // The same provider name after an intervening change is NOT the same
      // authorization intent. Lock the revision until the state is consumed.
      const [pref] = await tx.$queryRaw<
        { provider_code: string; version: number }[]
      >`
        SELECT provider_code, version FROM public.email_provider_preferences
        WHERE organization_id = ${context.organizationId}::uuid
        FOR UPDATE
      `;
      if (
        !pref ||
        pref.provider_code !== row.provider_code ||
        row.provider_preference_version === null ||
        pref.version !== row.provider_preference_version
      )
        forbidden();
      const grantBinding = {
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        provider: row.provider_code as EmailOAuthProvider,
        stateHash,
      };
      let verifier: string;
      let oidcNonce: string;
      try {
        verifier = decryptWebhookSecret(
          row.encrypted_code_verifier,
          this.key,
          binding(grantBinding)
        );
        oidcNonce = decryptWebhookSecret(
          row.encrypted_nonce,
          this.key,
          nonceBinding(grantBinding)
        );
      } catch {
        throw new ServiceUnavailableException({
          code: "EMAIL_OAUTH_PENDING_DECRYPTION_FAILED",
        });
      }
      if (
        !PKCE_VERIFIER.test(verifier) ||
        !OIDC_NONCE.test(oidcNonce) ||
        !validateRedirect(row.redirect_uri)
      )
        forbidden();
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          action: "email.oauth_intent.consumed",
          entityType: "EmailOAuthPendingGrant",
          entityId: context.organizationId,
          metadata: {
            provider: row.provider_code,
            providerPreferenceVersion: pref.version,
            sendingEnabled: false,
          },
        },
      });
      return {
        provider: row.provider_code as EmailOAuthProvider,
        providerPreferenceVersion: pref.version,
        codeVerifier: verifier,
        oidcNonce,
        redirectUri: row.redirect_uri,
      };
    });
  }
}
