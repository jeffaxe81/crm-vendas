import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import {
  createEmailOAuthAuthorizationIntent,
  type EmailOAuthProvider,
  type EmailOAuthStartInput,
} from "./email-oauth-authorization-intent";
import {
  EmailOAuthPendingGrantStore,
  type EmailOAuthGrantContext,
} from "./email-oauth-pending-grant-store";

/**
 * Server-owned OAuth client registration. In particular, Microsoft tenants
 * must be resolved per CRM organization, not supplied by request JSON.
 */
export interface EmailOAuthClientResolver {
  resolve(
    organizationId: string,
    provider: EmailOAuthProvider
  ): Promise<
    | Pick<
        EmailOAuthStartInput,
        "clientId" | "redirectUri" | "microsoftTenantId"
      >
    | undefined
  >;
}

export type EmailOAuthPreparationContext = EmailOAuthGrantContext &
  Readonly<{
    sessionId: string;
    authMethod: "session" | "api_key";
  }>;

export type EmailOAuthPreparation = Readonly<{
  authorizationUrl: string;
  expiresAt: string;
  connectionStatus: "NOT_CONNECTED";
  sendingEnabled: false;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDERS: readonly string[] = ["GMAIL", "MICROSOFT_365"];

function denied(): never {
  throw new ForbiddenException({ code: "EMAIL_OAUTH_PREPARATION_FORBIDDEN" });
}

/**
 * F4.3-04B3: offline composition of PKCE + encrypted pending state.
 *
 * Not exported by EmailModule and not reachable from HTTP. An independent
 * security gate is required before adding connect/callback endpoints.
 */
export class EmailOAuthPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grants: Pick<EmailOAuthPendingGrantStore, "stage">,
    private readonly clients: EmailOAuthClientResolver
  ) {}

  async prepare(
    requestedProvider: EmailOAuthProvider,
    context: EmailOAuthPreparationContext
  ): Promise<EmailOAuthPreparation> {
    if (
      context.authMethod !== "session" ||
      !UUID.test(context.organizationId) ||
      !UUID.test(context.actorUserId) ||
      !UUID.test(context.sessionId) ||
      !PROVIDERS.includes(requestedProvider)
    ) {
      denied();
    }

    const eligible = await this.prisma.withTenant(
      context.organizationId,
      async tx => {
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
        if (!membership) return false;

        const session = await tx.refreshSession.findFirst({
          where: {
            id: context.sessionId,
            organizationId: context.organizationId,
            userId: context.actorUserId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!session) return false;

        const preference = await tx.emailProviderPreference.findFirst({
          where: { organizationId: context.organizationId },
          select: { providerCode: true },
        });
        return preference?.providerCode === requestedProvider;
      }
    );
    if (!eligible) denied();

    const client = await this.clients.resolve(
      context.organizationId,
      requestedProvider
    );
    if (!client) {
      throw new ServiceUnavailableException({
        code: "EMAIL_OAUTH_CLIENT_NOT_CONFIGURED",
      });
    }

    const intent = createEmailOAuthAuthorizationIntent({
      ...client,
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      provider: requestedProvider,
    });

    await this.grants.stage(intent.pendingGrant, {
      organizationId: context.organizationId,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
    });

    // No PKCE verifier, plaintext state, tenant ID or credentials in response.
    return {
      authorizationUrl: intent.authorizationUrl,
      expiresAt: new Date(intent.pendingGrant.expiresAt).toISOString(),
      connectionStatus: "NOT_CONNECTED",
      sendingEnabled: false,
    };
  }
}
