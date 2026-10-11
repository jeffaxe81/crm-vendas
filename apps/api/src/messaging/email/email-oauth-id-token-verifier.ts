import { createPublicKey, verify } from "node:crypto";
import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";

/**
 * Offline OIDC verifier: no HTTP endpoints, token exchange or email transport.
 * The trustedKeys input MUST originate from a separate HTTPS JWKS reader
 * pinned to the server-configured issuer, never from JWT header or browser.
 */
export type TrustedOidcRsaJwk = Readonly<{
  kty: "RSA";
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
  key_ops?: readonly string[];
}>;
export type OfflineOidcVerificationInput = Readonly<{
  provider: EmailOAuthProvider;
  clientId: string;
  oidcNonce: string;
  microsoftTenantId?: string;
  trustedKeys: readonly TrustedOidcRsaJwk[];
  nowSeconds?: number;
}>;
export type VerifiedOidcIdentity = Readonly<{
  provider: EmailOAuthProvider;
  issuer: string;
  audience: string;
  subject: string;
  /** Google email_verified=true only; Microsoft sender needs Graph /me. */
  verifiedEmail?: string;
  microsoftTenantId?: string;
}>;

type Obj = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const KID = /^[\x21-\x7e]{1,128}$/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

function denied(): never {
  throw new Error("EMAIL_OAUTH_ID_TOKEN_REJECTED");
}
function object(value: unknown): value is Obj {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function part(encoded: string, max: number): Buffer {
  if (!encoded || encoded.length > max * 2 || !B64URL.test(encoded)) denied();
  const decoded = Buffer.from(encoded, "base64url");
  if (!decoded.length || decoded.length > max || decoded.toString("base64url") !== encoded) denied();
  return decoded;
}
function jsonPart(encoded: string, max: number): Obj {
  try {
    const value: unknown = JSON.parse(part(encoded, max).toString("utf8"));
    if (object(value)) return value;
  } catch {
    // All malformed tokens return the same error code.
  }
  return denied();
}
function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    denied();
  return value;
}
function issuerFor(input: OfflineOidcVerificationInput): string {
  if (input.provider === "GMAIL") {
    if (input.microsoftTenantId !== undefined) denied();
    return "https://accounts.google.com";
  }
  if (
    input.provider !== "MICROSOFT_365" ||
    !UUID.test(input.microsoftTenantId ?? "")
  ) denied();
  return "https://login.microsoftonline.com/" +
    input.microsoftTenantId!.toLowerCase() + "/v2.0";
}

/**
 * Uses only caller-supplied, previously authenticated RSA public keys.
 * Deliberately rejects multi-audience ID tokens pending azp handling.
 */
export function verifyOfflineOidcIdToken(
  token: string,
  input: OfflineOidcVerificationInput
): VerifiedOidcIdentity {
  if (
    typeof token !== "string" ||
    token.length > 16384 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
    typeof input.clientId !== "string" ||
    !/^[\w.@-]{1,256}$/.test(input.clientId) ||
    !NONCE.test(input.oidcNonce) ||
    !Array.isArray(input.trustedKeys) ||
    input.trustedKeys.length < 1 ||
    input.trustedKeys.length > 20
  ) denied();

  const issuer = issuerFor(input);
  const now = input.nowSeconds === undefined
    ? Math.floor(Date.now() / 1000)
    : timestamp(input.nowSeconds);
  const segments = token.split(".");
  const headerRaw = segments[0]!;
  const claimsRaw = segments[1]!;
  const signatureRaw = segments[2]!;
  const header = jsonPart(headerRaw, 2048);
  const claims = jsonPart(claimsRaw, 8192);
  const signature = part(signatureRaw, 1024);
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    !KID.test(header.kid) ||
    (header.typ !== undefined && header.typ !== "JWT") ||
    header.jku !== undefined ||
    header.x5u !== undefined ||
    header.crit !== undefined ||
    header.x5c !== undefined ||
    header.jwk !== undefined
  ) denied();

  const keys = input.trustedKeys.filter(k =>
    k.kty === "RSA" &&
    k.kid === header.kid &&
    (k.alg === undefined || k.alg === "RS256") &&
    (k.use === undefined || k.use === "sig") &&
    (k.key_ops === undefined || k.key_ops.includes("verify")) &&
    typeof k.n === "string" &&
    typeof k.e === "string" &&
    B64URL.test(k.n) &&
    B64URL.test(k.e)
  );
  if (keys.length !== 1) denied();

  try {
    const key = keys[0]!;
    const publicKey = createPublicKey({
      key: { kty: "RSA", n: key.n, e: key.e },
      format: "jwk",
    });
    const length = publicKey.asymmetricKeyDetails?.modulusLength ?? 0;
    if (
      publicKey.asymmetricKeyType !== "rsa" ||
      length < 2048 ||
      length > 8192 ||
      !verify("RSA-SHA256", Buffer.from(headerRaw + "." + claimsRaw, "ascii"), publicKey, signature)
    ) denied();
  } catch {
    denied();
  }

  const claimedIssuer = claims.iss;
  // Google issues either accepted issuer form; Microsoft uses the exact tenant v2 issuer.
  if (
    typeof claimedIssuer !== "string" ||
    !(claimedIssuer === issuer || (input.provider === "GMAIL" && claimedIssuer === "accounts.google.com")) ||
    claims.aud !== input.clientId ||
    (claims.azp !== undefined && claims.azp !== input.clientId) ||
    claims.nonce !== input.oidcNonce ||
    typeof claims.sub !== "string" ||
    claims.sub.length < 1 ||
    claims.sub.length > 512 ||
    /[\x00-\x1f\x7f]/.test(claims.sub)
  ) denied();

  const exp = timestamp(claims.exp);
  const iat = timestamp(claims.iat);
  if (
    exp <= now ||
    iat > now + 60 ||
    iat < now - 600 ||
    exp <= iat ||
    (claims.nbf !== undefined && timestamp(claims.nbf) > now + 60)
  ) denied();

  if (input.provider === "MICROSOFT_365") {
    if (
      claims.tid !== input.microsoftTenantId?.toLowerCase() ||
      claims.ver !== "2.0"
    ) denied();
    return {
      provider: input.provider,
      issuer,
      audience: input.clientId,
      subject: claims.sub,
      microsoftTenantId: input.microsoftTenantId!.toLowerCase(),
    };
  }
  if (
    claims.email_verified !== true ||
    typeof claims.email !== "string" ||
    claims.email.length > 254 ||
    !EMAIL.test(claims.email)
  ) denied();
  return {
    provider: input.provider,
    issuer: claimedIssuer,
    audience: input.clientId,
    subject: claims.sub,
    verifiedEmail: claims.email.toLowerCase(),
  };
}
