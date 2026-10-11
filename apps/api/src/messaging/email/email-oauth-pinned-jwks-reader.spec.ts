import { jest } from "@jest/globals";
import { generateKeyPairSync } from "node:crypto";
import { EmailOAuthPinnedJwksReader } from "./email-oauth-pinned-jwks-reader";

const microsoftTenantId = "9de960dd-b3da-43d4-8bd8-ea2c8128c30d";
const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { n, e } = publicKey.export({ format: "jwk" }) as {
  n: string;
  e: string;
};
const key = { kty: "RSA", kid: "current", use: "sig", alg: "RS256", n, e };
const google = { provider: "GMAIL" as const };

function response(body: unknown = { keys: [key] }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("F4.3-05B3 pinned JWKS reader", () => {
  it("pins Google endpoint, disables redirects and caches keys", async () => {
    const request = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response()
    );
    let now = 1000;
    const reader = new EmailOAuthPinnedJwksReader(request, () => now);
    const first = await reader.getTrustedKeys(google);
    expect(first).toHaveLength(1);
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://www.googleapis.com/oauth2/v3/certs"
    );
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
    });
    expect(await reader.getTrustedKeys(google)).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
    now += 300001;
    await reader.getTrustedKeys(google);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("pins a tenant-specific Microsoft endpoint and rejects arbitrary tenants", async () => {
    const request = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response()
    );
    const reader = new EmailOAuthPinnedJwksReader(request);
    await reader.getTrustedKeys({
      provider: "MICROSOFT_365",
      microsoftTenantId,
    });
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://login.microsoftonline.com/" +
        microsoftTenantId +
        "/discovery/v2.0/keys"
    );
    await expect(
      reader.getTrustedKeys({
        provider: "MICROSOFT_365",
        microsoftTenantId: "common",
      })
    ).rejects.toThrow("EMAIL_OAUTH_JWKS_UNAVAILABLE");
    await expect(
      reader.getTrustedKeys({
        provider: "GMAIL",
        microsoftTenantId,
      })
    ).rejects.toThrow("EMAIL_OAUTH_JWKS_UNAVAILABLE");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails closed on unsuccessful rotation, evicting previous keys", async () => {
    const request = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response()
    );
    const reader = new EmailOAuthPinnedJwksReader(request);
    await reader.getTrustedKeys(google);
    request.mockImplementationOnce(async () => response({}, 503));
    await expect(reader.getTrustedKeys(google, true)).rejects.toThrow(
      "EMAIL_OAUTH_JWKS_UNAVAILABLE"
    );
    request.mockImplementationOnce(async () => response({ keys: [] }));
    await expect(reader.getTrustedKeys(google)).rejects.toThrow(
      "EMAIL_OAUTH_JWKS_UNAVAILABLE"
    );
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["duplicate kid", { keys: [key, key] }],
    ["empty set", { keys: [] }],
    ["invalid algorithm", { keys: [{ ...key, alg: "HS256" }] }],
    ["unusable operation", { keys: [{ ...key, key_ops: ["sign"] }] }],
    ["non-RSA key", { keys: [{ ...key, kty: "oct" }] }],
    ["malformed modulus", { keys: [{ ...key, n: "invalid!" }] }],
  ])("rejects %s", async (_label, payload) => {
    const reader = new EmailOAuthPinnedJwksReader(async () =>
      response(payload)
    );
    await expect(reader.getTrustedKeys(google)).rejects.toThrow(
      "EMAIL_OAUTH_JWKS_UNAVAILABLE"
    );
  });

  it("coalesces concurrent HTTPS requests", async () => {
    const request = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response()
    );
    const reader = new EmailOAuthPinnedJwksReader(request);
    const [a, b] = await Promise.all([
      reader.getTrustedKeys(google),
      reader.getTrustedKeys(google),
    ]);
    expect(a).toBe(b);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
