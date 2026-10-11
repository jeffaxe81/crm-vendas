import { EmailOAuthPreparationService } from "./email-oauth-preparation.service";
import type { EmailOAuthClientResolver } from "./email-oauth-preparation.service";
import type {
  EmailOAuthPendingGrant,
  EmailOAuthProvider,
  EmailOAuthStartInput,
} from "./email-oauth-authorization-intent";
import type { EmailOAuthGrantContext } from "./email-oauth-pending-grant-store";
import type { PrismaService } from "../../database/prisma.service";

const organizationId = "00000000-0000-4000-8000-000000000001";
const actorUserId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const azureTenant = "00000000-0000-4000-8000-000000000004";
const context = {
  organizationId,
  actorUserId,
  sessionId,
  requestId: "oauth-start-test",
  authMethod: "session" as const,
};

type ClientConfig = Pick<
  EmailOAuthStartInput,
  "clientId" | "redirectUri" | "microsoftTenantId"
>;

function harness(options?: {
  admin?: boolean;
  session?: boolean;
  selected?: string;
  configured?: boolean;
}) {
  const withTenantCalls: string[] = [];
  const stageCalls: Array<[EmailOAuthPendingGrant, EmailOAuthGrantContext]> =
    [];
  const resolverCalls: Array<[string, EmailOAuthProvider]> = [];
  let stageError: Error | null = null;
  let overrideClient: ClientConfig | null = null;

  const transaction = {
    organizationMembership: {
      findFirst: async () =>
        options?.admin === false ? null : { id: "membership" },
    },
    refreshSession: {
      findFirst: async () =>
        options?.session === false ? null : { id: sessionId },
    },
    emailProviderPreference: {
      findFirst: async () => ({
        providerCode: options?.selected ?? "GMAIL",
      }),
    },
  };
  const prisma = {
    withTenant: async <T>(
      organization: string,
      callback: (tx: typeof transaction) => Promise<T>
    ): Promise<T> => {
      withTenantCalls.push(organization);
      return callback(transaction);
    },
  } as unknown as PrismaService;

  const grants = {
    stage: async (
      grant: EmailOAuthPendingGrant,
      grantContext: EmailOAuthGrantContext
    ): Promise<void> => {
      stageCalls.push([grant, grantContext]);
      if (stageError) throw stageError;
    },
  };

  const clients: EmailOAuthClientResolver = {
    resolve: async (organization: string, provider: EmailOAuthProvider) => {
      resolverCalls.push([organization, provider]);
      if (options?.configured === false) return undefined;
      if (overrideClient) return overrideClient;
      return {
        clientId:
          provider === "GMAIL"
            ? "web-test.apps.googleusercontent.com"
            : "00000000-0000-4000-8000-000000000005",
        redirectUri: "https://crm.example.com/admin/email/oauth/callback",
        ...(provider === "MICROSOFT_365"
          ? { microsoftTenantId: azureTenant }
          : {}),
      };
    },
  };

  return {
    service: new EmailOAuthPreparationService(prisma, grants, clients),
    withTenantCalls,
    stageCalls,
    resolverCalls,
    failStage(error: Error) {
      stageError = error;
    },
    setClient(value: ClientConfig) {
      overrideClient = value;
    },
  };
}

describe("F4.3-04B3 OAuth preparation remains offline and session-bound", () => {
  it("stages Gmail without returning plaintext PKCE or tenant identity", async () => {
    const h = harness();
    const result = await h.service.prepare("GMAIL", context);
    const url = new URL(result.authorizationUrl);
    const staged = h.stageCalls[0]?.[0];

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(result).toMatchObject({
      connectionStatus: "NOT_CONNECTED",
      sendingEnabled: false,
    });
    expect(h.withTenantCalls).toEqual([organizationId]);
    expect(h.resolverCalls).toEqual([[organizationId, "GMAIL"]]);
    expect(h.stageCalls).toHaveLength(1);
    expect(staged).toMatchObject({
      organizationId,
      actorUserId,
      provider: "GMAIL",
    });
    expect(JSON.stringify(result)).not.toContain(staged!.codeVerifier);
    expect(JSON.stringify(result)).not.toContain(organizationId);
    expect(JSON.stringify(result)).not.toContain(actorUserId);
    expect(JSON.stringify(result)).not.toContain(sessionId);
    expect(JSON.stringify(result)).not.toContain(staged!.stateHash);
    expect(h.stageCalls[0]?.[1]).toEqual({
      organizationId,
      actorUserId,
      requestId: context.requestId,
    });
  });

  it("uses the Microsoft authority resolved for that specific company", async () => {
    const h = harness({ selected: "MICROSOFT_365" });
    const result = await h.service.prepare("MICROSOFT_365", context);
    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe(`/${azureTenant}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get("scope")).toContain("Mail.Send");
    expect(h.stageCalls[0]?.[0].provider).toBe("MICROSOFT_365");
  });

  it("rejects API keys and invalid session, actor, tenant and provider", async () => {
    for (const patch of [
      { authMethod: "api_key" },
      { sessionId: "api_key:fake" },
      { organizationId: "other" },
      { actorUserId: "other" },
    ]) {
      const h = harness();
      await expect(
        h.service.prepare("GMAIL", { ...context, ...patch } as typeof context)
      ).rejects.toThrow();
      expect(h.stageCalls).toHaveLength(0);
      expect(h.resolverCalls).toHaveLength(0);
    }
    const h = harness();
    await expect(
      h.service.prepare("INVALID" as EmailOAuthProvider, context)
    ).rejects.toThrow();
  });

  it("rejects revoked sessions, inactive admins and unmatched providers", async () => {
    for (const variant of [
      { admin: false },
      { session: false },
      { selected: "SMTP" },
      { selected: "MICROSOFT_365" },
    ]) {
      const h = harness(variant);
      await expect(h.service.prepare("GMAIL", context)).rejects.toThrow();
      expect(h.stageCalls).toHaveLength(0);
      expect(h.resolverCalls).toHaveLength(0);
    }
  });

  it("fails closed when server client configuration is absent or unsafe", async () => {
    const missing = harness({ configured: false });
    await expect(missing.service.prepare("GMAIL", context)).rejects.toThrow();
    expect(missing.stageCalls).toHaveLength(0);

    const untrusted = harness();
    untrusted.setClient({
      clientId: "id",
      redirectUri: "http://127.0.0.1/admin/email/oauth/callback",
    });
    await expect(untrusted.service.prepare("GMAIL", context)).rejects.toThrow();
    expect(untrusted.stageCalls).toHaveLength(0);
  });

  it("never returns the authorization URL if encrypted storage fails", async () => {
    const h = harness();
    h.failStage(new Error("ENCRYPTION_UNAVAILABLE"));
    await expect(h.service.prepare("GMAIL", context)).rejects.toThrow(
      "ENCRYPTION_UNAVAILABLE"
    );
    expect(h.stageCalls).toHaveLength(1);
  });
});
