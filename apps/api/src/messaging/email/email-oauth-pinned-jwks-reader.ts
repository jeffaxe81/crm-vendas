import { createPublicKey } from "node:crypto";
import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";
import type { TrustedOidcRsaJwk } from "./email-oauth-id-token-verifier";

/**
 * F4.3-05B3: isolated HTTPS JWKS reader for a future authenticated OIDC
 * callback. This module is NOT wired to a controller, provider or worker.
 *
 * No caller-provided JWKS URI, issuer URL, JWT header, or redirect is used
 * to select the remote endpoint. In particular, jku/x5u are never followed.
 */
export type PinnedJwksContext = Readonly<{
  provider: EmailOAuthProvider;
  microsoftTenantId?: string;
}>;

type CacheEntry = Readonly<{
  expiresAt: number;
  keys: readonly TrustedOidcRsaJwk[];
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;
const KID = /^[\x21-\x7e]{1,128}$/;
const MAX_BYTES = 128 * 1024;
const MAX_KEYS = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function unavailable(): never {
  throw new Error("EMAIL_OAUTH_JWKS_UNAVAILABLE");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function endpoint(context: PinnedJwksContext): string {
  if (context.provider === "GMAIL") {
    if (context.microsoftTenantId !== undefined) unavailable();
    return "https://www.googleapis.com/oauth2/v3/certs";
  }
  if (
    context.provider !== "MICROSOFT_365" ||
    typeof context.microsoftTenantId !== "string" ||
    !UUID.test(context.microsoftTenantId) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(context.microsoftTenantId)
  )
    unavailable();
  return (
    "https://login.microsoftonline.com/" +
    context.microsoftTenantId.toLowerCase() +
    "/discovery/v2.0/keys"
  );
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES))
    unavailable();
  if (!response.body) unavailable();
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) unavailable();
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown;
  } catch {
    return unavailable();
  }
}

function parsePublicKeys(payload: unknown): readonly TrustedOidcRsaJwk[] {
  if (!isRecord(payload) || !Array.isArray(payload.keys)) unavailable();
  if (payload.keys.length < 1 || payload.keys.length > MAX_KEYS) unavailable();

  const ids = new Set<string>();
  const parsed: TrustedOidcRsaJwk[] = [];
  for (const candidate of payload.keys as unknown[]) {
    if (
      !isRecord(candidate) ||
      candidate.kty !== "RSA" ||
      typeof candidate.kid !== "string" ||
      !KID.test(candidate.kid) ||
      ids.has(candidate.kid) ||
      typeof candidate.n !== "string" ||
      typeof candidate.e !== "string" ||
      !B64URL.test(candidate.n) ||
      !B64URL.test(candidate.e) ||
      candidate.n.length > 1500 ||
      candidate.e.length > 16 ||
      (candidate.alg !== undefined && candidate.alg !== "RS256") ||
      (candidate.use !== undefined && candidate.use !== "sig") ||
      (candidate.key_ops !== undefined &&
        (!Array.isArray(candidate.key_ops) ||
          candidate.key_ops.length !== 1 ||
          candidate.key_ops[0] !== "verify")) ||
      candidate.d !== undefined ||
      candidate.p !== undefined ||
      candidate.q !== undefined
    )
      unavailable();
    try {
      const key = createPublicKey({
        key: { kty: "RSA", n: candidate.n, e: candidate.e },
        format: "jwk",
      });
      const modulusLength = key.asymmetricKeyDetails?.modulusLength ?? 0;
      if (
        key.asymmetricKeyType !== "rsa" ||
        modulusLength < 2048 ||
        modulusLength > 8192
      )
        unavailable();
    } catch {
      unavailable();
    }
    ids.add(candidate.kid);
    parsed.push(
      Object.freeze({
        kty: "RSA",
        kid: candidate.kid,
        n: candidate.n,
        e: candidate.e,
        alg: "RS256",
        use: "sig",
        key_ops: ["verify"] as const,
      })
    );
  }
  return Object.freeze(parsed);
}

/**
 * No stale-if-error: after TTL or a failed rotation fetch, OIDC verification
 * must fail closed. An explicit refresh is needed if a legitimate new kid
 * appears before the cache expires. No OAuth tokens are fetched or stored.
 */
export class EmailOAuthPinnedJwksReader {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<readonly TrustedOidcRsaJwk[]>>();

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly clock: () => number = Date.now
  ) {}

  async getTrustedKeys(
    context: PinnedJwksContext,
    forceRefresh = false
  ): Promise<readonly TrustedOidcRsaJwk[]> {
    const url = endpoint(context);
    const now = this.clock();
    if (!Number.isSafeInteger(now) || now < 0) unavailable();

    const cached = this.cache.get(url);
    if (!forceRefresh && cached && now < cached.expiresAt) return cached.keys;
    const inFlight = this.pending.get(url);
    if (inFlight) return inFlight;

    // Never serve expired (or force-invalidated) keys when reloading fails.
    this.cache.delete(url);
    const fetchPromise = this.fetchTrustedKeys(url).then(
      keys => {
        const expiryBase = this.clock();
        if (!Number.isSafeInteger(expiryBase) || expiryBase < 0) unavailable();
        this.cache.set(url, { keys, expiresAt: expiryBase + CACHE_TTL_MS });
        return keys;
      },
      () => unavailable()
    );
    this.pending.set(url, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      this.pending.delete(url);
    }
  }

  private async fetchTrustedKeys(
    url: string
  ): Promise<readonly TrustedOidcRsaJwk[]> {
    try {
      const response = await this.request(url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (
        response.status !== 200 ||
        response.redirected ||
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("content-type") ?? ""
        )
      )
        unavailable();
      return parsePublicKeys(await readBoundedJson(response));
    } catch {
      return unavailable();
    }
  }
}
