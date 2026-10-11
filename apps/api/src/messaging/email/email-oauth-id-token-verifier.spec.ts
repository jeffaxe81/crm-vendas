import { generateKeyPairSync, sign } from "node:crypto";
import {
  verifyOfflineOidcIdToken,
  type OfflineOidcVerificationInput,
  type TrustedOidcRsaJwk,
} from "./email-oauth-id-token-verifier";

const now = 1_800_000_000;
const tenantId = "b9c71e22-a16a-4fb7-bcd2-50831fd9317a";
const clientId = "app-123.apps.googleusercontent.com";
const oidcNonce = "a".repeat(43);
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001,
});
const exportedJwk = publicKey.export({ format: "jwk" }) as {
  n: string;
  e: string;
};
const key: TrustedOidcRsaJwk = {
  kty: "RSA",
  kid: "test-key",
  n: exportedJwk.n,
  e: exportedJwk.e,
  alg: "RS256",
  use: "sig",
};
const google: OfflineOidcVerificationInput = {
  provider: "GMAIL",
  clientId,
  oidcNonce,
  trustedKeys: [key],
  nowSeconds: now,
};
const microsoft: OfflineOidcVerificationInput = {
  ...google,
  provider: "MICROSOFT_365",
  microsoftTenantId: tenantId,
};
const goodClaims: Record<string, unknown> = {
  iss: "https://accounts.google.com",
  aud: clientId,
  sub: "google-user-1",
  nonce: oidcNonce,
  iat: now - 20,
  exp: now + 300,
  email: "Owner@Example.com",
  email_verified: true,
};
const microsoftClaims: Record<string, unknown> = {
  ...goodClaims,
  iss: "https://login.microsoftonline.com/" + tenantId + "/v2.0",
  tid: tenantId,
  ver: "2.0",
  sub: "microsoft-user-1",
  preferred_username: "spoofed@example.com",
  email_verified: false,
};
function mint(
  claims: Record<string, unknown> = goodClaims,
  header: Record<string, unknown> = {}
): string {
  const h = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT", ...header })
  ).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const data = h + "." + p;
  const s = sign("RSA-SHA256", Buffer.from(data, "ascii"), privateKey).toString(
    "base64url"
  );
  return data + "." + s;
}
const denied = "EMAIL_OAUTH_ID_TOKEN_REJECTED";

describe("F4.3-05B2 isolated OIDC ID token RS256 verification", () => {
  it("accepts signed Google identity only with verified email", () => {
    const identity = verifyOfflineOidcIdToken(mint(), google);
    expect(identity).toEqual({
      provider: "GMAIL",
      issuer: "https://accounts.google.com",
      audience: clientId,
      subject: "google-user-1",
      verifiedEmail: "owner@example.com",
    });
  });

  it("accepts the second documented Google issuer value", () => {
    const identity = verifyOfflineOidcIdToken(
      mint({ ...goodClaims, iss: "accounts.google.com" }),
      google
    );
    expect(identity.issuer).toBe("accounts.google.com");
  });

  it("accepts Microsoft v2 identity but never treats username as a verified sender", () => {
    const identity = verifyOfflineOidcIdToken(mint(microsoftClaims), microsoft);
    expect(identity).toEqual({
      provider: "MICROSOFT_365",
      issuer: "https://login.microsoftonline.com/" + tenantId + "/v2.0",
      audience: clientId,
      subject: "microsoft-user-1",
      microsoftTenantId: tenantId,
    });
    expect(identity).not.toHaveProperty("verifiedEmail");
  });

  it.each([
    ["wrong issuer", { iss: "https://accounts.evil.example" }],
    ["wrong audience", { aud: "another-client" }],
    ["array audience", { aud: [clientId, "another-client"] }],
    ["nonce replay", { nonce: "b".repeat(43) }],
    ["expired", { exp: now - 1 }],
    ["old token", { iat: now - 601 }],
    ["future issue time", { iat: now + 61 }],
    ["future not-before", { nbf: now + 61 }],
    ["unverified email", { email_verified: false }],
    ["missing subject", { sub: null }],
    ["wrong authorized party", { azp: "another-client" }],
  ])("rejects %s", (_name, claimOverride) => {
    expect(() =>
      verifyOfflineOidcIdToken(
        mint({ ...goodClaims, ...claimOverride }),
        google
      )
    ).toThrow(denied);
  });

  it.each([
    ["none algorithm", { alg: "none" }],
    ["HS256 algorithm confusion", { alg: "HS256" }],
    ["untrusted key url", { jku: "https://evil.example/jwks" }],
    ["embedded untrusted key", { jwk: { kty: "RSA" } }],
    ["unknown key identifier", { kid: "unknown" }],
    ["unsupported critical header", { crit: ["exp"] }],
  ])("rejects %s", (_name, header) => {
    expect(() =>
      verifyOfflineOidcIdToken(mint(goodClaims, header), google)
    ).toThrow(denied);
  });

  it("rejects tampering, untrusted keys, duplicates and malformed tokens", () => {
    const token = mint();
    const parts = token.split(".");
    const h = parts[0]!;
    const s = parts[2]!;
    const changed = Buffer.from(
      JSON.stringify({
        ...goodClaims,
        email: "attacker@example.com",
      })
    ).toString("base64url");
    expect(() =>
      verifyOfflineOidcIdToken(h + "." + changed + "." + s, google)
    ).toThrow(denied);
    expect(() =>
      verifyOfflineOidcIdToken(token, { ...google, trustedKeys: [] })
    ).toThrow(denied);
    expect(() =>
      verifyOfflineOidcIdToken(token, { ...google, trustedKeys: [key, key] })
    ).toThrow(denied);
    expect(() => verifyOfflineOidcIdToken("abc.def.ghi", google)).toThrow(
      denied
    );
  });

  it("rejects Microsoft tenant/issuer mismatch and wrong-provider tokens", () => {
    expect(() =>
      verifyOfflineOidcIdToken(
        mint({
          ...microsoftClaims,
          tid: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        }),
        microsoft
      )
    ).toThrow(denied);
    expect(() =>
      verifyOfflineOidcIdToken(mint(microsoftClaims), google)
    ).toThrow(denied);
    expect(() => verifyOfflineOidcIdToken(mint(), microsoft)).toThrow(denied);
  });
});
