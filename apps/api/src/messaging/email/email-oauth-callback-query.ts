/**
 * F4.3-05B5: OFFLINE validation of the query returned by OAuth providers.
 *
 * This parser neither authenticates a CRM session nor authorizes an OAuth
 * callback. A future HTTPS controller MUST obtain tenant/user/session from its
 * own authenticated principal, then atomically consume the server-staged state
 * with EmailOAuthPendingGrantStore before exchanging the code exactly once.
 */
export type ParsedEmailOAuthSuccess = Readonly<{
  code: string;
  state: string;
}>;

const MAX_QUERY_CHARS = 10_000;
const MAX_PAIRS = 10;
const STATE = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^[\x21-\x7e]{8,4096}$/;
const EXTRA_VALUE = /^[\x20-\x7e]{0,1024}$/;

/**
 * Google may append scope/authuser/prompt; Microsoft can append session_state
 * or issuer. These are IGNORED, never authorization data.
 */
const ALLOWED_KEYS = new Set([
  "code",
  "state",
  "scope",
  "authuser",
  "prompt",
  "session_state",
  "iss",
  "hd",
]);
const ERROR_KEYS = new Set(["error", "error_description", "error_uri"]);

function rejected(): never {
  // Never include raw authorization code, state, error_description or URI.
  throw new Error("EMAIL_OAUTH_CALLBACK_QUERY_REJECTED");
}

/**
 * Expects ONLY the raw query (starting with '?'), not a full URL, request
 * headers, browser-supplied tenant ID or provider identity.
 */
export function parseEmailOAuthCallbackQuery(
  rawQuery: string
): ParsedEmailOAuthSuccess {
  if (
    typeof rawQuery !== "string" ||
    !rawQuery.startsWith("?") ||
    rawQuery.length < 3 ||
    rawQuery.length > MAX_QUERY_CHARS ||
    /[\x00-\x1f\x7f#]/.test(rawQuery) ||
    /%(?![0-9A-Fa-f]{2})/.test(rawQuery)
  ) {
    return rejected();
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(rawQuery.slice(1));
  } catch {
    return rejected();
  }

  const entries = [...params.entries()];
  if (entries.length < 2 || entries.length > MAX_PAIRS) rejected();

  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (
      seen.has(key) ||
      ERROR_KEYS.has(key) ||
      !ALLOWED_KEYS.has(key) ||
      (key !== "code" && key !== "state" && !EXTRA_VALUE.test(value))
    ) {
      rejected();
    }
    seen.add(key);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (
    code === null ||
    state === null ||
    !CODE.test(code) ||
    !STATE.test(state)
  ) {
    rejected();
  }

  // No provider, organization ID, sender, redirect URI or scope is inferred.
  return Object.freeze({ code, state });
}
