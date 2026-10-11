import { isIP } from "node:net";
import type { ConsumedEmailOAuthGrant } from "./email-oauth-pending-grant-store";
import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";

/** F4.3-05B4: offline, NOT registered in EmailModule or any controller. */
export type ConfidentialClient = Readonly<{
  provider: EmailOAuthProvider;
  clientId: string;
  clientSecret: string;
  microsoftTenantId?: string;
}>;
export type CodeExchangeInput = Readonly<{
  code: string;
  grant: ConsumedEmailOAuthGrant;
  client: ConfidentialClient;
}>;
export type UnverifiedTokenMaterial = Readonly<{
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  verificationStatus: "UNVERIFIED";
  sendingEnabled: false;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOOGLE_CLIENT =
  /^[0-9]{6,18}-[a-z0-9_-]{3,120}\.apps\.googleusercontent\.com$/;
const DNS =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const LIMIT_BYTES = 64 * 1024;
function denied(): never {
  throw new Error("EMAIL_OAUTH_EXCHANGE_REJECTED");
}
function visible(v: unknown, min: number, max: number): v is string {
  return (
    typeof v === "string" &&
    v.length >= min &&
    v.length <= max &&
    /^[\x21-\x7e]+$/.test(v)
  );
}
function validRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value === url.toString() &&
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.pathname === "/admin/email/oauth/callback" &&
      isIP(url.hostname) === 0 &&
      DNS.test(url.hostname)
    );
  } catch {
    return false;
  }
}
function pinnedEndpoint(client: ConfidentialClient): string {
  if (client.provider === "GMAIL") {
    if (
      !GOOGLE_CLIENT.test(client.clientId) ||
      client.microsoftTenantId !== undefined
    )
      denied();
    return "https://oauth2.googleapis.com/token";
  }
  if (
    client.provider !== "MICROSOFT_365" ||
    !UUID.test(client.clientId) ||
    !UUID.test(client.microsoftTenantId ?? "") ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(client.microsoftTenantId!)
  )
    denied();
  return (
    "https://login.microsoftonline.com/" +
    client.microsoftTenantId!.toLowerCase() +
    "/oauth2/v2.0/token"
  );
}
export type ConfidentialTokenRequest = Readonly<{
  endpoint: string;
  /** Contains server-owned secret, code and PKCE: never expose or log. */
  body: string;
}>;
/** Endpoint comes only from provider selection and pinned tenant UUID. */
export function prepareOAuthCodeExchange(
  input: CodeExchangeInput
): ConfidentialTokenRequest {
  if (
    input.grant.provider !== input.client.provider ||
    !visible(input.code, 8, 4096) ||
    !/^[A-Za-z0-9_-]{64}$/.test(input.grant.codeVerifier) ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.grant.oidcNonce) ||
    !validRedirect(input.grant.redirectUri) ||
    !visible(input.client.clientSecret, 16, 4096)
  )
    denied();
  const endpoint = pinnedEndpoint(input.client);
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.client.clientId,
    client_secret: input.client.clientSecret,
    code: input.code,
    code_verifier: input.grant.codeVerifier,
    redirect_uri: input.grant.redirectUri,
  });
  if (input.client.provider === "MICROSOFT_365")
    form.set(
      "scope",
      "openid profile offline_access https://graph.microsoft.com/Mail.Send"
    );
  return { endpoint, body: form.toString() };
}
function parseUnverified(value: unknown): UnverifiedTokenMaterial {
  if (!value || typeof value !== "object" || Array.isArray(value)) denied();
  const row = value as Record<string, unknown>;
  if (
    row.token_type !== "Bearer" ||
    !visible(row.access_token, 20, 32768) ||
    !visible(row.refresh_token, 20, 8192) ||
    !visible(row.id_token, 30, 16384) ||
    !JWT_SHAPE.test(row.id_token) ||
    !Number.isSafeInteger(row.expires_in) ||
    (row.expires_in as number) < 60 ||
    (row.expires_in as number) > 86400
  )
    denied();
  return {
    idToken: row.id_token,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresInSeconds: row.expires_in as number,
    verificationStatus: "UNVERIFIED",
    sendingEnabled: false,
  };
}
async function boundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > LIMIT_BYTES)
  )
    denied();
  if (!response.body) denied();
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMIT_BYTES) denied();
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")) as unknown;
  } catch {
    return denied();
  }
}
/** Never retries a single-use authorization code. Unverified only. */
export class EmailOAuthConfidentialExchange {
  constructor(private readonly request: typeof fetch = fetch) {}
  async exchange(input: CodeExchangeInput): Promise<UnverifiedTokenMaterial> {
    const prepared = prepareOAuthCodeExchange(input);
    try {
      const response = await this.request(prepared.endpoint, {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: prepared.body,
        signal: AbortSignal.timeout(5000),
      });
      if (
        response.status !== 200 ||
        response.redirected ||
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("content-type") ?? ""
        )
      )
        denied();
      return parseUnverified(await boundedJson(response));
    } catch {
      return denied();
    }
  }
}
