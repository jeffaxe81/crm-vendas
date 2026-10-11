import { createHash } from "node:crypto";
import {
  createEmailOAuthAuthorizationIntent,
  EMAIL_OAUTH_INTENT_TTL_MS,
  type EmailOAuthStartInput,
} from "./email-oauth-authorization-intent";

const organizationId = "00000000-0000-4000-8000-000000000001";
const actorUserId = "00000000-0000-4000-8000-000000000002";
const microsoftTenantId = "00000000-0000-4000-8000-000000000003";
const base: EmailOAuthStartInput = {
  provider: "GMAIL",
  organizationId,
  actorUserId,
  clientId: "crm-app-123.apps.googleusercontent.com",
  redirectUri: "https://crm.example.com/admin/email/oauth/callback",
};

describe("F4.3-04B1 OAuth authorization intent (offline only)", () => {
  it("uses a fixed HTTPS Google authority, PKCE-S256 and random CSRF state", () => {
    const intent = createEmailOAuthAuthorizationIntent(base, 1000);
    const url = new URL(intent.authorizationUrl);
    const state = url.searchParams.get("state");
    const verifier = intent.pendingGrant.codeVerifier;
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("gmail.send");
    expect(url.searchParams.get("scope")).toContain("openid email");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(verifier, "ascii").digest("base64url")
    );
    expect(intent.pendingGrant.stateHash).toBe(
      createHash("sha256").update(state!, "ascii").digest("hex")
    );
    expect(intent.pendingGrant).toMatchObject({
      organizationId,
      actorUserId,
      provider: "GMAIL",
      createdAt: 1000,
      expiresAt: 1000 + EMAIL_OAUTH_INTENT_TTL_MS,
    });
    expect(intent.authorizationUrl).not.toContain(organizationId);
    expect(intent.authorizationUrl).not.toContain(actorUserId);
    expect(intent.authorizationUrl).not.toContain(verifier);
  });

  it("uses a tenant-specific Microsoft authority and delegated Mail.Send", () => {
    const intent = createEmailOAuthAuthorizationIntent({
      ...base,
      provider: "MICROSOFT_365",
      clientId: "00000000-0000-4000-8000-000000000004",
      microsoftTenantId,
    });
    const url = new URL(intent.authorizationUrl);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe(`/${microsoftTenantId}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get("scope")).toContain(
      "https://graph.microsoft.com/Mail.Send"
    );
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("response_mode")).toBe("query");
    expect(url.searchParams.has("access_type")).toBe(false);
    expect(intent.pendingGrant.provider).toBe("MICROSOFT_365");
  });

  it("generates independent secrets even for simultaneous requests", () => {
    const first = createEmailOAuthAuthorizationIntent(base, 1234);
    const second = createEmailOAuthAuthorizationIntent(base, 1234);
    expect(first.authorizationUrl).not.toBe(second.authorizationUrl);
    expect(first.pendingGrant.stateHash).not.toBe(
      second.pendingGrant.stateHash
    );
    expect(first.pendingGrant.codeVerifier).not.toBe(
      second.pendingGrant.codeVerifier
    );
  });

  it("fails closed on untrusted callback addresses and malformed identity", () => {
    const invalid = [
      "http://crm.example.com/admin/email/oauth/callback",
      "https://localhost/admin/email/oauth/callback",
      "https://127.0.0.1/admin/email/oauth/callback",
      "https://crm.example.com:8443/admin/email/oauth/callback",
      "https://user:pass@crm.example.com/admin/email/oauth/callback",
      "https://crm.example.com/admin/email/oauth/callback?next=evil",
      "https://crm.example.com/admin/email/oauth/callback#fragment",
      "https://crm.example.com/admin/email/oauth/another",
      "https://crm.example.com.evil/admin/email/oauth/callback/../another",
    ];
    for (const redirectUri of invalid) {
      expect(() =>
        createEmailOAuthAuthorizationIntent({ ...base, redirectUri })
      ).toThrow("EMAIL_OAUTH_CONFIGURATION_INVALID");
    }
    for (const patch of [
      { organizationId: "other-org" },
      { actorUserId: "not-uuid" },
      { clientId: "" },
      { microsoftTenantId: "common" },
    ]) {
      expect(() =>
        createEmailOAuthAuthorizationIntent({ ...base, ...patch })
      ).toThrow("EMAIL_OAUTH_CONFIGURATION_INVALID");
    }
    expect(() =>
      createEmailOAuthAuthorizationIntent({ ...base }, Number.NaN)
    ).toThrow("EMAIL_OAUTH_CONFIGURATION_INVALID");
  });

  it("rejects ambiguous Microsoft tenants or provider contamination", () => {
    const microsoft: EmailOAuthStartInput = {
      ...base,
      provider: "MICROSOFT_365",
    };
    expect(() => createEmailOAuthAuthorizationIntent(microsoft)).toThrow(
      "EMAIL_OAUTH_CONFIGURATION_INVALID"
    );
    expect(() =>
      createEmailOAuthAuthorizationIntent({
        ...microsoft,
        microsoftTenantId: "common",
      })
    ).toThrow("EMAIL_OAUTH_CONFIGURATION_INVALID");
    expect(() =>
      createEmailOAuthAuthorizationIntent({
        ...base,
        microsoftTenantId,
      })
    ).toThrow("EMAIL_OAUTH_CONFIGURATION_INVALID");
  });
});
