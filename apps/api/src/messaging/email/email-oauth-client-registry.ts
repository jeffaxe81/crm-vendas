import { validEmailOAuthOrigin } from "./email-oauth-redirect";
import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import type {
  EmailOAuthProvider,
  EmailOAuthStartInput,
} from "./email-oauth-authorization-intent";
import type { EmailOAuthClientResolver } from "./email-oauth-preparation.service";

/**
 * Server configuration only. OAuth application client IDs are public
 * identifiers, NOT client secrets or refresh tokens. Secrets must be handled
 * by a separate encrypted token-exchange integration in a later gate.
 */
const OrganizationId = z.uuid();
const MicrosoftRegistration = z
  .object({
    provider: z.literal("MICROSOFT_365"),
    organizationId: OrganizationId,
    clientId: z.uuid(),
    microsoftTenantId: z.uuid(),
  })
  .strict();
const GoogleRegistration = z
  .object({
    provider: z.literal("GMAIL"),
    organizationId: OrganizationId,
    clientId: z
      .string()
      .regex(/^[0-9]{6,18}-[a-z0-9_-]{3,120}\.apps\.googleusercontent\.com$/),
  })
  .strict();
const Registrations = z
  .object({
    version: z.literal(1),
    registrations: z
      .array(
        z.discriminatedUnion("provider", [
          GoogleRegistration,
          MicrosoftRegistration,
        ])
      )
      .max(200),
  })
  .strict();

type ClientConfiguration = Pick<
  EmailOAuthStartInput,
  "clientId" | "redirectUri" | "microsoftTenantId"
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function configurationUnavailable(): never {
  throw new ServiceUnavailableException({
    code: "EMAIL_OAUTH_CLIENT_REGISTRY_UNAVAILABLE",
    message: "EMAIL_OAUTH_CLIENT_REGISTRY_UNAVAILABLE",
  });
}

function strictCallbackOrigin(raw: string): string {
  if (raw.length > 256 || !validEmailOAuthOrigin(raw))
    return configurationUnavailable();
  return raw;
}

/**
 * F4.3-04B4: a per-organization client registry without HTTP routes.
 * It intentionally has no connection to EmailModule or transport adapters.
 *
 * Configuration is deployment-owned, immutable during resolver lifetime and
 * rejects malformed/duplicate entries rather than choosing one silently.
 */
export class EnvironmentEmailOAuthClientResolver implements EmailOAuthClientResolver {
  private readonly clients = new Map<string, ClientConfiguration>();

  constructor(callbackOrigin?: string, registrationsJson?: string) {
    if (!callbackOrigin && !registrationsJson) return;
    if (
      !callbackOrigin ||
      !registrationsJson ||
      registrationsJson.length > 65536
    ) {
      configurationUnavailable();
    }
    const origin = strictCallbackOrigin(callbackOrigin);
    let parsed: unknown;
    try {
      parsed = JSON.parse(registrationsJson);
    } catch {
      configurationUnavailable();
    }
    const validated = Registrations.safeParse(parsed);
    if (!validated.success) configurationUnavailable();
    for (const registration of validated.data.registrations) {
      const key = `${registration.organizationId}:${registration.provider}`;
      if (this.clients.has(key)) configurationUnavailable();
      const config: ClientConfiguration = {
        clientId: registration.clientId,
        redirectUri: `${origin}/admin/email/oauth/callback`,
        ...(registration.provider === "MICROSOFT_365"
          ? { microsoftTenantId: registration.microsoftTenantId }
          : {}),
      };
      this.clients.set(key, Object.freeze(config));
    }
  }

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env
  ): EnvironmentEmailOAuthClientResolver {
    return new EnvironmentEmailOAuthClientResolver(
      environment.EMAIL_OAUTH_CALLBACK_ORIGIN,
      environment.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON
    );
  }

  async resolve(
    organizationId: string,
    provider: EmailOAuthProvider
  ): Promise<ClientConfiguration | undefined> {
    if (!UUID.test(organizationId)) return undefined;
    if (provider !== "GMAIL" && provider !== "MICROSOFT_365") {
      return undefined;
    }
    const client = this.clients.get(
      `${organizationId.toLowerCase()}:${provider}`
    );
    return client ? { ...client } : undefined;
  }
}
