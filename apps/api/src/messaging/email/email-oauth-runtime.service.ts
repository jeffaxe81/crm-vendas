import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { EnvironmentEmailOAuthClientResolver } from "./email-oauth-client-registry";
import {
  EmailOAuthPreparationService,
  type EmailOAuthPreparationContext,
} from "./email-oauth-preparation.service";
import { EmailOAuthPendingGrantStore } from "./email-oauth-pending-grant-store";
import { EmailOAuthCredentialVault } from "./email-oauth-credential-vault";
import {
  EmailOAuthConfidentialExchange,
  type ConfidentialClient,
} from "./email-oauth-confidential-exchange";
import { EmailOAuthOidcIdentityService } from "./email-oauth-oidc-identity.service";
import { EmailOAuthPinnedJwksReader } from "./email-oauth-pinned-jwks-reader";
import { parseEmailOAuthCallbackQuery } from "./email-oauth-callback-query";
import { EmailOAuthRefresh } from "./email-oauth-refresh";
import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";
import type { EmailOAuthSendCredentials } from "./email-oauth-send.provider";

/** Lazy configuration keeps an unconfigured deployment bootable and fail-closed. */
export class EmailOAuthRuntimeService implements EmailOAuthSendCredentials {
  constructor(
    private readonly prisma: PrismaService,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly request: typeof fetch = fetch
  ) {}
  private registry() {
    return EnvironmentEmailOAuthClientResolver.fromEnvironment(
      this.environment
    );
  }
  private vault() {
    return new EmailOAuthCredentialVault(
      this.prisma,
      this.environment.EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY
    );
  }
  private grants() {
    return new EmailOAuthPendingGrantStore(
      this.prisma,
      this.environment.EMAIL_OAUTH_PENDING_ENCRYPTION_KEY
    );
  }
  private assertSession(context: EmailOAuthPreparationContext) {
    if (context.authMethod !== "session")
      throw new ForbiddenException({ code: "EMAIL_OAUTH_SESSION_REQUIRED" });
  }
  private async client(
    organizationId: string,
    provider: EmailOAuthProvider
  ): Promise<ConfidentialClient> {
    const registration = await this.registry().resolve(
      organizationId,
      provider
    );
    let secrets: unknown;
    try {
      const raw = this.environment.EMAIL_OAUTH_CLIENT_SECRETS_JSON ?? "{}";
      if (raw.length > 65536) throw Error();
      secrets = JSON.parse(raw);
    } catch {
      throw new ServiceUnavailableException({
        code: "EMAIL_OAUTH_CLIENT_NOT_CONFIGURED",
      });
    }
    const secret =
      secrets && typeof secrets === "object" && !Array.isArray(secrets)
        ? (secrets as Record<string, unknown>)[`${organizationId}:${provider}`]
        : undefined;
    if (
      !registration ||
      typeof secret !== "string" ||
      !/^[\x21-\x7e]{16,4096}$/.test(secret)
    )
      throw new ServiceUnavailableException({
        code: "EMAIL_OAUTH_CLIENT_NOT_CONFIGURED",
      });
    return {
      provider,
      clientId: registration.clientId,
      registeredRedirectUri: registration.redirectUri,
      microsoftTenantId: registration.microsoftTenantId,
      clientSecret: secret,
    };
  }
  async connect(
    provider: EmailOAuthProvider,
    context: EmailOAuthPreparationContext
  ) {
    this.assertSession(context);
    await this.client(context.organizationId, provider);
    return new EmailOAuthPreparationService(
      this.prisma,
      this.grants(),
      this.registry()
    ).prepare(provider, context);
  }
  async callback(rawQuery: string, context: EmailOAuthPreparationContext) {
    this.assertSession(context);
    try {
      const query = parseEmailOAuthCallbackQuery(rawQuery);
      const grant = await this.grants().consume(query.state, context);
      if (
        !Number.isSafeInteger(grant.credentialVersion) ||
        grant.credentialVersion! < 0
      )
        throw Error();
      const client = await this.client(context.organizationId, grant.provider);
      const token = await new EmailOAuthConfidentialExchange(
        this.request
      ).exchange({ code: query.code, grant, client });
      const identity = await new EmailOAuthOidcIdentityService(
        new EmailOAuthPinnedJwksReader(this.request)
      ).verify(token.idToken, {
        provider: grant.provider,
        clientId: client.clientId,
        oidcNonce: grant.oidcNonce,
        microsoftTenantId: client.microsoftTenantId,
      });
      // Microsoft Mail.Send authorizes /me/sendMail. No sender address or CRM
      // tenant is inferred from email/preferred_username; signed issuer/tid/sub bind the account.
      return await this.vault().stageVerified(
        {
          provider: grant.provider,
          providerSubject: identity.subject,
          verifiedSenderEmail: identity.verifiedEmail,
          refreshToken: token.refreshToken,
          expectedVersion: grant.credentialVersion!,
          intentCreatedAt: grant.intentCreatedAt,
          expectedProviderPreferenceVersion: grant.providerPreferenceVersion,
        },
        context
      );
    } catch {
      throw new ForbiddenException({ code: "EMAIL_OAUTH_CALLBACK_REJECTED" });
    }
  }
  async status(
    provider: EmailOAuthProvider,
    context: EmailOAuthPreparationContext
  ) {
    this.assertSession(context);
    if (!this.environment.EMAIL_OAUTH_CALLBACK_ORIGIN)
      return {
        provider,
        connectionStatus: "PENDING_DOMAIN_CONFIG",
        sendingEnabled: false,
      };
    // Admin authorization is performed by vault status even if no credential exists.
    return this.vault().status(provider, context);
  }
  async disconnect(
    provider: EmailOAuthProvider,
    version: number,
    context: EmailOAuthPreparationContext
  ) {
    this.assertSession(context);
    return this.vault().deleteLocal(provider, version, context);
  }
  async acquire(
    organizationId: string
  ): ReturnType<EmailOAuthSendCredentials["acquire"]> {
    const preference = await this.prisma.withTenant(organizationId, tx =>
      tx.emailProviderPreference.findFirst({
        where: { organizationId },
        select: { providerCode: true },
      })
    );
    const provider = preference?.providerCode;
    if (provider !== "GMAIL" && provider !== "MICROSOFT_365")
      throw new ServiceUnavailableException({
        code: "EMAIL_OAUTH_NOT_CONNECTED",
      });
    const client = await this.client(organizationId, provider);
    return this.vault().withRefreshToken(
      organizationId,
      provider,
      async refreshToken => {
        const refreshed = await new EmailOAuthRefresh(this.request).refresh(
          client,
          refreshToken
        );
        return {
          value: { provider, accessToken: refreshed.accessToken },
          refreshToken: refreshed.refreshToken,
          revoked: refreshed.revoked,
        };
      }
    );
  }
}
