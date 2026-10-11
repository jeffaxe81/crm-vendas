import { EnvironmentEmailOAuthClientResolver } from "./email-oauth-client-registry";
import {
  createEmailOAuthAuthorizationIntent,
} from "./email-oauth-authorization-intent";

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
const azure = "00000000-0000-4000-8000-000000000003";
const microsoftApp = "00000000-0000-4000-8000-000000000004";
const googleApp = "123456789012-testapplication.apps.googleusercontent.com";
const callbackOrigin = "https://crm.example.com";

const gmail = {
  organizationId: a,
  provider: "GMAIL" as const,
  clientId: googleApp,
};
const microsoft = {
  organizationId: b,
  provider: "MICROSOFT_365" as const,
  clientId: microsoftApp,
  microsoftTenantId: azure,
};
const registry = (registrations: unknown) =>
  JSON.stringify({ version: 1, registrations });
const resolver = (registrations: unknown) =>
  new EnvironmentEmailOAuthClientResolver(
    callbackOrigin,
    registry(registrations)
  );

describe("F4.3-04B4 deployment-owned OAuth client registry (offline)", () => {
  it("fails closed with unconfigured, partial or malformed deployment settings", async () => {
    await expect(
      new EnvironmentEmailOAuthClientResolver().resolve(a, "GMAIL")
    ).resolves.toBeUndefined();
    for (const [origin, json] of [
      [callbackOrigin, undefined],
      [undefined, registry([gmail])],
      [callbackOrigin, "bad json"],
      [callbackOrigin, JSON.stringify({ registrations: [gmail] })],
      [callbackOrigin, JSON.stringify({ version: 2, registrations: [gmail] })],
      [callbackOrigin, registry("not an array")],
    ] as Array<[string | undefined, string | undefined]>) {
      expect(() => new EnvironmentEmailOAuthClientResolver(origin, json)).toThrow(
        "EMAIL_OAUTH_CLIENT_REGISTRY_UNAVAILABLE"
      );
    }
  });

  it("keeps Gmail and Microsoft registrations isolated by organization and provider", async () => {
    const store = resolver([gmail, microsoft]);
    const google = await store.resolve(a, "GMAIL");
    const ms = await store.resolve(b, "MICROSOFT_365");
    expect(google).toEqual({
      clientId: googleApp,
      redirectUri: "https://crm.example.com/admin/email/oauth/callback",
    });
    expect(ms).toEqual({
      clientId: microsoftApp,
      microsoftTenantId: azure,
      redirectUri: "https://crm.example.com/admin/email/oauth/callback",
    });
    await expect(store.resolve(a, "MICROSOFT_365")).resolves.toBeUndefined();
    await expect(store.resolve(b, "GMAIL")).resolves.toBeUndefined();
    await expect(
      store.resolve("00000000-0000-4000-8000-000000000005", "GMAIL")
    ).resolves.toBeUndefined();
    expect(JSON.stringify(google)).not.toContain(azure);
    expect(JSON.stringify(ms)).not.toContain(googleApp);
  });

  it("constructs a PKCE authorization intent with the server-fixed callback", async () => {
    const store = resolver([gmail]);
    const registration = await store.resolve(a, "GMAIL");
    expect(registration).toBeDefined();
    const intent = createEmailOAuthAuthorizationIntent({
      ...registration!,
      organizationId: a,
      actorUserId: "00000000-0000-4000-8000-000000000007",
      provider: "GMAIL",
    });
    const url = new URL(intent.authorizationUrl);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://crm.example.com/admin/email/oauth/callback"
    );
    expect(url.searchParams.get("client_id")).toBe(googleApp);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(intent.authorizationUrl).not.toContain(
      intent.pendingGrant.codeVerifier
    );
  });

  it("rejects malicious origins even when HTTPS appears in the string", () => {
    const invalid = [
      "http://crm.example.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://crm.example.com:444",
      "https://crm.example.com/",
      "https://crm.example.com/portal",
      "https://crm.example.com?next=evil",
      "https://crm.example.com#fragment",
      "https://user@crm.example.com",
      "https://crm.example.com.evil/path",
      "https://-bad.example.com",
      "https://crm..example.com",
      "https://crm.example.com.",
    ];
    for (const origin of invalid) {
      expect(() =>
        new EnvironmentEmailOAuthClientResolver(origin, registry([gmail]))
      ).toThrow("EMAIL_OAUTH_CLIENT_REGISTRY_UNAVAILABLE");
    }
  });

  it("rejects unknown secrets, duplicate clients and mixed provider fields", () => {
    for (const registrations of [
      [gmail, gmail],
      [gmail, { ...gmail, clientId: googleApp }],
      [{ ...gmail, clientSecret: "must never be present" }],
      [{ ...gmail, microsoftTenantId: azure }],
      [{ ...gmail, clientId: "fake-app" }],
      [{ ...microsoft, clientId: "common" }],
      [{ ...microsoft, microsoftTenantId: "organizations" }],
      [{ ...microsoft, refreshToken: "must never be present" }],
      [{ ...microsoft, provider: "GMAIL" }],
      [{ ...gmail, provider: "SMTP" }],
      [{ ...gmail, organizationId: "tenant-A" }],
    ]) {
      expect(() => resolver(registrations)).toThrow(
        "EMAIL_OAUTH_CLIENT_REGISTRY_UNAVAILABLE"
      );
    }
  });

  it("accepts the environment adapter and rejects oversized configuration", async () => {
    const store = EnvironmentEmailOAuthClientResolver.fromEnvironment({
      EMAIL_OAUTH_CALLBACK_ORIGIN: callbackOrigin,
      EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON: registry([gmail]),
    });
    await expect(store.resolve(a, "GMAIL")).resolves.toMatchObject({
      clientId: googleApp,
    });
    expect(() =>
      new EnvironmentEmailOAuthClientResolver(
        callbackOrigin,
        "x".repeat(65537)
      )
    ).toThrow("EMAIL_OAUTH_CLIENT_REGISTRY_UNAVAILABLE");
  });
});
