import { generateKeyPairSync, sign } from "node:crypto";
import { EmailOAuthOidcIdentityService } from "./email-oauth-oidc-identity.service";
import { EmailOAuthPinnedJwksReader } from "./email-oauth-pinned-jwks-reader";

const nowSeconds = 1_800_000_000;
const microsoftTenantId = "9de960dd-b3da-43d4-8bd8-ea2c8128c30d";
const clientId = "app-123.apps.googleusercontent.com";
const oidcNonce = "a".repeat(43);
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const { n, e } = publicKey.export({ format: "jwk" }) as {
  n: string;
  e: string;
};
const jwks = {
  keys: [{ kty: "RSA", kid: "test-key", use: "sig", alg: "RS256", n, e }],
};

function token(
  overrides: Record<string, unknown> = {},
  provider: "GMAIL" | "MICROSOFT_365" = "GMAIL"
): string {
  const claims: Record<string, unknown> = {
    iss:
      provider === "GMAIL"
        ? "https://accounts.google.com"
        : `https://login.microsoftonline.com/${microsoftTenantId}/v2.0`,
    aud: clientId,
    nonce: oidcNonce,
    sub: "test-subject",
    iat: nowSeconds - 20,
    exp: nowSeconds + 300,
    ...(provider === "GMAIL"
      ? { email: "Owner@Example.com", email_verified: true }
      : { tid: microsoftTenantId, ver: "2.0" }),
    ...overrides,
  };
  const header = Buffer.from(
    JSON.stringify({ typ: "JWT", alg: "RS256", kid: "test-key" })
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${header}.${body}`, "ascii"),
    privateKey
  ).toString("base64url");
  return `${header}.${body}.${signature}`;
}

function response(status = 200) {
  return new Response(JSON.stringify(jwks), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("F4.3-05B4 pinned JWKS and OIDC identity composition", () => {
  it("resolves Google identity from signed claims using only pinned keys", async () => {
    const request = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response()
    );
    const service = new EmailOAuthOidcIdentityService(
      new EmailOAuthPinnedJwksReader(request),
      () => nowSeconds
    );
    const identity = await service.verify(token(), {
      provider: "GMAIL",
      clientId,
      oidcNonce,
    });
    expect(identity).toEqual({
      provider: "GMAIL",
      issuer: "https://accounts.google.com",
      audience: clientId,
      subject: "test-subject",
      verifiedEmail: "owner@example.com",
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://www.googleapis.com/oauth2/v3/certs"
    );
    expect(
      (
        await service.verify(token(), {
          provider: "GMAIL",
          clientId,
          oidcNonce,
        })
      ).subject
    ).toBe("test-subject");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("resolves Microsoft identity without trusting a sender email claim", async () => {
    const request = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response()
    );
    const service = new EmailOAuthOidcIdentityService(
      new EmailOAuthPinnedJwksReader(request),
      () => nowSeconds
    );
    const identity = await service.verify(
      token({ preferred_username: "spoofed@example.com" }, "MICROSOFT_365"),
      { provider: "MICROSOFT_365", clientId, oidcNonce, microsoftTenantId }
    );
    expect(identity).toMatchObject({
      provider: "MICROSOFT_365",
      audience: clientId,
      microsoftTenantId,
      subject: "test-subject",
    });
    expect(identity).not.toHaveProperty("verifiedEmail");
    expect(request.mock.calls[0]?.[0]).toBe(
      `https://login.microsoftonline.com/${microsoftTenantId}/discovery/v2.0/keys`
    );
  });

  it("rejects malformed JWTs without consulting JWKS endpoint", async () => {
    const request = jest.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response()
    );
    const service = new EmailOAuthOidcIdentityService(
      new EmailOAuthPinnedJwksReader(request),
      () => nowSeconds
    );
    await expect(
      service.verify("not-a-jwt", { provider: "GMAIL", clientId, oidcNonce })
    ).rejects.toThrow("EMAIL_OAUTH_IDENTITY_VERIFICATION_FAILED");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a crossed tenant, provider, audience, and nonce without leaking claims", async () => {
    const service = new EmailOAuthOidcIdentityService(
      new EmailOAuthPinnedJwksReader(async () => response()),
      () => nowSeconds
    );
    const cases = [
      {
        jwt: token(),
        context: {
          provider: "GMAIL" as const,
          clientId,
          oidcNonce: "b".repeat(43),
        },
      },
      {
        jwt: token(),
        context: {
          provider: "GMAIL" as const,
          clientId: "another-client",
          oidcNonce,
        },
      },
      {
        jwt: token(
          { tid: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" },
          "MICROSOFT_365"
        ),
        context: {
          provider: "MICROSOFT_365" as const,
          clientId,
          oidcNonce,
          microsoftTenantId,
        },
      },
      {
        jwt: token(),
        context: {
          provider: "MICROSOFT_365" as const,
          clientId,
          oidcNonce,
          microsoftTenantId,
        },
      },
    ];
    for (const item of cases) {
      await expect(service.verify(item.jwt, item.context)).rejects.toThrow(
        "EMAIL_OAUTH_IDENTITY_VERIFICATION_FAILED"
      );
    }
  });

  it("fails closed when JWKS endpoint is unavailable", async () => {
    const service = new EmailOAuthOidcIdentityService(
      new EmailOAuthPinnedJwksReader(async () => response(503)),
      () => nowSeconds
    );
    await expect(
      service.verify(token(), { provider: "GMAIL", clientId, oidcNonce })
    ).rejects.toThrow("EMAIL_OAUTH_IDENTITY_VERIFICATION_FAILED");
  });
});
