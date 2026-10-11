import { jest } from "@jest/globals";
import { EmailOAuthPreparationService } from "./email-oauth-preparation.service";
import type { EmailOAuthClientResolver } from "./email-oauth-preparation.service";
import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";
import type { PrismaService } from "../../database/prisma.service";
import type { EmailOAuthPendingGrantStore } from "./email-oauth-pending-grant-store";

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

function harness(options?: {
  admin?: boolean;
  session?: boolean;
  selected?: string;
  configured?: boolean;
}) {
  const membership = {
    findFirst: jest
      .fn()
      .mockResolvedValue(
        options?.admin === false ? null : { id: "membership" }
      ),
  };
  const session = {
    findFirst: jest
      .fn()
      .mockResolvedValue(options?.session === false ? null : { id: sessionId }),
  };
  const preference = {
    findFirst: jest.fn().mockResolvedValue({
      providerCode: options?.selected ?? "GMAIL",
    }),
  };
  const withTenant = jest.fn(
    (_org: string, callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        organizationMembership: membership,
        refreshSession: session,
        emailProviderPreference: preference,
      })
  );
  const prisma = { withTenant } as unknown as PrismaService;
  const stage = jest.fn().mockResolvedValue(undefined);
  const grants = { stage } as unknown as EmailOAuthPendingGrantStore;
  const resolve = jest.fn(async (_org: string, provider: EmailOAuthProvider) =>
    options?.configured === false
      ? undefined
      : {
          clientId:
            provider === "GMAIL"
              ? "web-test.apps.googleusercontent.com"
              : "00000000-0000-4000-8000-000000000005",
          redirectUri: "https://crm.example.com/admin/email/oauth/callback",
          ...(provider === "MICROSOFT_365"
            ? { microsoftTenantId: azureTenant }
            : {}),
        }
  );
  const clients = { resolve } as EmailOAuthClientResolver;
  return {
    service: new EmailOAuthPreparationService(prisma, grants, clients),
    stage,
    resolve,
    membership,
    session,
    preference,
    withTenant,
  };
}

describe("F4.3-04B3 OAuth preparation remains offline and session-bound", () => {
  it("stages a Gmail intent without returning plaintext PKCE or tenant identity", async () => {
    const h = harness();
    const result = await h.service.prepare("GMAIL", context);
    const url = new URL(result.authorizationUrl);
    const staged = h.stage.mock.calls[0]?.[0];

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(result).toMatchObject({
      connectionStatus: "NOT_CONNECTED",
      sendingEnabled: false,
    });
    expect(h.withTenant).toHaveBeenCalledWith(
      organizationId,
      expect.any(Function)
    );
    expect(h.resolve).toHaveBeenCalledWith(organizationId, "GMAIL");
    expect(h.stage).toHaveBeenCalledTimes(1);
    expect(staged).toMatchObject({
      organizationId,
      actorUserId,
      provider: "GMAIL",
    });
    expect(JSON.stringify(result)).not.toContain(staged.codeVerifier);
    expect(JSON.stringify(result)).not.toContain(organizationId);
    expect(JSON.stringify(result)).not.toContain(actorUserId);
    expect(JSON.stringify(result)).not.toContain(sessionId);
    expect(JSON.stringify(result)).not.toContain(staged.stateHash);
  });

  it("uses a distinct Microsoft authority resolved for this tenant", async () => {
    const h = harness({ selected: "MICROSOFT_365" });
    const result = await h.service.prepare("MICROSOFT_365", context);
    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe(`/${azureTenant}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get("scope")).toContain("Mail.Send");
    expect(h.stage.mock.calls[0]?.[0].provider).toBe("MICROSOFT_365");
  });

  it("rejects API keys, invalid sessions, users, tenants and providers", async () => {
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
      expect(h.stage).not.toHaveBeenCalled();
      expect(h.resolve).not.toHaveBeenCalled();
    }
    const h = harness();
    await expect(
      h.service.prepare("INVALID" as EmailOAuthProvider, context)
    ).rejects.toThrow();
  });

  it("rejects revoked session, revoked admin and unmatched provider", async () => {
    for (const variant of [
      { admin: false },
      { session: false },
      { selected: "SMTP" },
      { selected: "MICROSOFT_365" },
    ]) {
      const h = harness(variant);
      await expect(h.service.prepare("GMAIL", context)).rejects.toThrow();
      expect(h.stage).not.toHaveBeenCalled();
      expect(h.resolve).not.toHaveBeenCalled();
    }
  });

  it("fails closed when a server-owned client is missing or malformed", async () => {
    const missing = harness({ configured: false });
    await expect(missing.service.prepare("GMAIL", context)).rejects.toThrow();
    expect(missing.stage).not.toHaveBeenCalled();

    const untrusted = harness();
    untrusted.resolve.mockResolvedValue({
      clientId: "id",
      redirectUri: "http://127.0.0.1/admin/email/oauth/callback",
    });
    await expect(untrusted.service.prepare("GMAIL", context)).rejects.toThrow();
    expect(untrusted.stage).not.toHaveBeenCalled();
  });

  it("never returns a URL when encrypted grant storage rejects", async () => {
    const h = harness();
    h.stage.mockRejectedValue(new Error("ENCRYPTION_UNAVAILABLE"));
    await expect(h.service.prepare("GMAIL", context)).rejects.toThrow(
      "ENCRYPTION_UNAVAILABLE"
    );
    expect(h.stage).toHaveBeenCalledTimes(1);
  });
});
