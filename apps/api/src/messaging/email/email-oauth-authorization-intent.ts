import { createHash, randomBytes } from "node:crypto";

/**
 * F4.3-04B1: offline construction of an OAuth authorization intent.
 *
 * This is NOT an OAuth connection or a callback handler. The caller must
 * atomically persist the pending grant (encrypted, tenant-bound, one use),
 * then return only authorizationUrl to the browser. No e-mail is sent.
 */
export type EmailOAuthProvider = "GMAIL" | "MICROSOFT_365";

export type EmailOAuthStartInput = Readonly<{
  provider: EmailOAuthProvider;
  organizationId: string;
  actorUserId: string;
  clientId: string;
  /** Must be fixed server-side, never supplied by the browser. */
  redirectUri: string;
  /** Required for Microsoft; never use common/organizations/consumers. */
  microsoftTenantId?: string;
}>;

export type EmailOAuthPendingGrant = Readonly<{
  organizationId: string;
  actorUserId: string;
  provider: EmailOAuthProvider;
  /** Lookup key for a one-use state. Never store the raw state. */
  stateHash: string;
  /** Secret: persist only encrypted, never send to the client or log. */
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}>;

export type EmailOAuthAuthorizationIntent = Readonly<{
  authorizationUrl: string;
  /** Private server-side record, NOT an HTTP response body. */
  pendingGrant: EmailOAuthPendingGrant;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALLBACK_PATH = "/admin/email/oauth/callback";
export const EMAIL_OAUTH_INTENT_TTL_MS = 5 * 60 * 1000;

function badConfiguration(): never {
  throw new Error("EMAIL_OAUTH_CONFIGURATION_INVALID");
}

function callbackUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return badConfiguration();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== CALLBACK_PATH ||
    !url.hostname.includes(".") ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname)
  ) {
    return badConfiguration();
  }
  return url.toString();
}

function tenantUuid(input: string): boolean {
  return UUID.test(input) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(input);
}

export function createEmailOAuthAuthorizationIntent(
  input: EmailOAuthStartInput,
  nowMs: number = Date.now()
): EmailOAuthAuthorizationIntent {
  if (
    !["GMAIL", "MICROSOFT_365"].includes(input.provider) ||
    !tenantUuid(input.organizationId) ||
    !tenantUuid(input.actorUserId) ||
    !input.clientId ||
    input.clientId.length > 256 ||
    !/^[\w.\-@]+$/.test(input.clientId) ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0
  ) {
    return badConfiguration();
  }

  const redirectUri = callbackUrl(input.redirectUri);
  let endpoint: string;
  let scope: string;

  if (input.provider === "GMAIL") {
    if (input.microsoftTenantId !== undefined) return badConfiguration();
    endpoint = "https://accounts.google.com/o/oauth2/v2/auth";
    // OIDC email scope is needed to establish the authenticated sender.
    scope = "openid email https://www.googleapis.com/auth/gmail.send";
  } else {
    if (!input.microsoftTenantId || !tenantUuid(input.microsoftTenantId)) {
      return badConfiguration();
    }
    endpoint = `https://login.microsoftonline.com/${input.microsoftTenantId}/oauth2/v2.0/authorize`;
    // Delegated permissions only. Application Mail.Send requires a separate gate.
    scope = "openid profile offline_access https://graph.microsoft.com/Mail.Send";
  }

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");

  const url = new URL(endpoint);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (input.provider === "GMAIL") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "false");
  } else {
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("prompt", "select_account");
  }

  return {
    authorizationUrl: url.toString(),
    pendingGrant: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      provider: input.provider,
      stateHash: createHash("sha256").update(state, "ascii").digest("hex"),
      codeVerifier,
      redirectUri,
      createdAt: nowMs,
      expiresAt: nowMs + EMAIL_OAUTH_INTENT_TTL_MS,
    },
  };
}
