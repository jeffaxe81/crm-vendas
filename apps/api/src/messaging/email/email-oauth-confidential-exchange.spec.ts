import {
  EmailOAuthConfidentialExchange,
  prepareOAuthCodeExchange,
  type CodeExchangeInput,
} from "./email-oauth-confidential-exchange";
const google: CodeExchangeInput = {
  code: "4/0AfSyntheticAuthorizationCodeForTests",
  grant: {
    provider: "GMAIL",
    codeVerifier: "v".repeat(64),
    oidcNonce: "n".repeat(43),
    redirectUri: "https://crm.example.com/admin/email/oauth/callback",
  },
  client: {
    provider: "GMAIL",
    clientId: "123456789012-confidentialapp.apps.googleusercontent.com",
    clientSecret: "synthetic-server-only-confidential-secret",
    registeredRedirectUri: "https://crm.example.com/admin/email/oauth/callback",
  },
};
const tenant = "00000000-0000-4000-8000-000000000001";
const microsoft: CodeExchangeInput = {
  ...google,
  grant: { ...google.grant, provider: "MICROSOFT_365" },
  client: {
    provider: "MICROSOFT_365",
    clientId: "00000000-0000-4000-8000-000000000002",
    microsoftTenantId: tenant,
    clientSecret: google.client.clientSecret,
    registeredRedirectUri: google.client.registeredRedirectUri,
  },
};
const material = {
  access_token: "synthetic-access-token-not-for-real-usage-2026",
  refresh_token: "synthetic-refresh-token-not-for-real-usage-2026",
  id_token: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJkZW1vIn0.c2lnbmF0dXJl",
  token_type: "Bearer",
  expires_in: 3600,
};
function reply(value: unknown = material): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
describe("F4.3-05B4 confidential token exchange gate", () => {
  it("pins Google endpoint and URL-encodes PKCE plus server client secret", () => {
    const x = prepareOAuthCodeExchange(google);
    expect(x.endpoint).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(new URLSearchParams(x.body))).toEqual({
      grant_type: "authorization_code",
      client_id: google.client.clientId,
      client_secret: google.client.clientSecret,
      code: google.code,
      code_verifier: google.grant.codeVerifier,
      redirect_uri: google.grant.redirectUri,
    });
    expect(x.endpoint).not.toContain(google.code);
  });
  it("pins Microsoft tenant URL with delegated Mail.Send", () => {
    const x = prepareOAuthCodeExchange(microsoft);
    expect(x.endpoint).toBe(
      "https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token"
    );
    expect(new URLSearchParams(x.body).get("scope")).toBe(
      "openid profile offline_access https://graph.microsoft.com/Mail.Send"
    );
  });
  it("rejects mismatched provider, missing secret, invalid tenant, open redirect and injection", () => {
    const errors: CodeExchangeInput[] = [
      { ...google, client: { ...google.client, clientSecret: "" } },
      { ...google, client: { ...google.client, clientSecret: "short" } },
      {
        ...google,
        client: { ...google.client, clientSecret: "secret\nunsafe" },
      },
      { ...google, code: "\r\nAuthorization: Bearer attacker" },
      { ...google, code: "tiny" },
      { ...google, grant: { ...google.grant, codeVerifier: "unsafe" } },
      { ...google, grant: { ...google.grant, oidcNonce: "unsafe" } },
      {
        ...google,
        grant: { ...google.grant, redirectUri: "http://localhost/callback" },
      },
      {
        ...google,
        grant: {
          ...google.grant,
          redirectUri: google.grant.redirectUri + "?next=evil",
        },
      },
      {
        ...google,
        grant: {
          ...google.grant,
          redirectUri: "https://other.example.org/admin/email/oauth/callback",
        },
      },
      {
        ...google,
        client: {
          ...google.client,
          registeredRedirectUri:
            "https://other.example.org/admin/email/oauth/callback",
        },
      },
      { ...google, client: { ...google.client, provider: "MICROSOFT_365" } },
      {
        ...microsoft,
        client: { ...microsoft.client, microsoftTenantId: "common" },
      },
      {
        ...microsoft,
        client: {
          ...microsoft.client,
          microsoftTenantId: "00000000-0000-0000-0000-000000000000",
        },
      },
    ];
    for (const x of errors)
      expect(() => prepareOAuthCodeExchange(x)).toThrow(
        "EMAIL_OAUTH_EXCHANGE_REJECTED"
      );
  });
  it("returns synthetic token responses only as UNVERIFIED; no sending", async () => {
    const calls: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const request = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([url, init]);
      return reply();
    };
    const result = await new EmailOAuthConfidentialExchange(request).exchange(
      google
    );
    expect(result).toEqual({
      idToken: material.id_token,
      accessToken: material.access_token,
      refreshToken: material.refresh_token,
      expiresInSeconds: 3600,
      verificationStatus: "UNVERIFIED",
      sendingEnabled: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(calls[0]?.[1]).toMatchObject({
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
    });
  });
  it("rejects provider errors, redirects, non-JSON, missing tokens and bad expiry", async () => {
    const responses = [
      new Response("authorization denied", { status: 400 }),
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example" },
      }),
      new Response("<html/>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      reply({ ...material, refresh_token: undefined }),
      reply({ ...material, id_token: undefined }),
      reply({ ...material, token_type: "MAC" }),
      reply({ ...material, expires_in: "3600" }),
    ];
    for (const response of responses) {
      const client = new EmailOAuthConfidentialExchange(async () => response);
      await expect(client.exchange(google)).rejects.toThrow(
        "EMAIL_OAUTH_EXCHANGE_REJECTED"
      );
    }
  });
  it("rejects oversized bodies and never retries failed exchanges", async () => {
    const headerOverflow = new Response(JSON.stringify(material), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": "999999",
      },
    });
    await expect(
      new EmailOAuthConfidentialExchange(async () => headerOverflow).exchange(
        google
      )
    ).rejects.toThrow("EMAIL_OAUTH_EXCHANGE_REJECTED");
    const overflow = reply({ ...material, padding: "X".repeat(65536) });
    await expect(
      new EmailOAuthConfidentialExchange(async () => overflow).exchange(google)
    ).rejects.toThrow("EMAIL_OAUTH_EXCHANGE_REJECTED");
    let attempts = 0;
    const badNetwork = new EmailOAuthConfidentialExchange(async () => {
      attempts += 1;
      throw Error("untrusted raw network details");
    });
    await expect(badNetwork.exchange(google)).rejects.toThrow(
      "EMAIL_OAUTH_EXCHANGE_REJECTED"
    );
    expect(attempts).toBe(1);
  });
});
