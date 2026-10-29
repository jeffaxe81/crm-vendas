import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";

export type EmailOAuthHomologationInput = Readonly<{
  organizationId: string;
  provider: EmailOAuthProvider;
  environment: NodeJS.ProcessEnv;
}>;

export type EmailOAuthHomologationResult = Readonly<{
  provider: EmailOAuthProvider;
  status: "READY_FOR_CONTROLLED_HOMOLOGATION" | "NOT_READY";
  readyForControlledHomologation: boolean;
  sendingEnabled: false;
  pending: string[];
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOOGLE_CLIENT =
  /^[0-9]{6,18}-[a-z0-9_-]{3,120}\.apps\.googleusercontent\.com$/;

function canonicalKey(value: string | undefined): boolean {
  if (!value) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length === 32 && bytes.toString("base64") === value;
}

function validOrigin(raw: string | undefined, environment: NodeJS.ProcessEnv) {
  if (!raw || raw.length > 256) return false;
  try {
    const url = new URL(raw);
    if (
      url.origin !== raw ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return false;
    if (url.protocol === "https:" && !url.port) return true;
    return (
      environment.EMAIL_OAUTH_ALLOW_LOOPBACK === "true" &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export async function assessEmailOAuthHomologation(
  input: EmailOAuthHomologationInput
): Promise<EmailOAuthHomologationResult> {
  const pending = new Set<string>();
  const { environment, organizationId, provider } = input;

  if (!UUID.test(organizationId)) pending.add("ORGANIZATION_INVALID");
  if (!validOrigin(environment.EMAIL_OAUTH_CALLBACK_ORIGIN, environment))
    pending.add("CALLBACK_ORIGIN_INVALID_OR_MISSING");
  if (!canonicalKey(environment.EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY))
    pending.add("TOKEN_ENCRYPTION_KEY_MISSING");
  if (!canonicalKey(environment.EMAIL_OAUTH_PENDING_ENCRYPTION_KEY))
    pending.add("PENDING_ENCRYPTION_KEY_MISSING");

  let registrationFound = false;
  try {
    const raw = environment.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON ?? "";
    if (!raw || raw.length > 65536) throw new Error();
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      registrations?: unknown;
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.registrations))
      throw new Error();
    const matches = parsed.registrations.filter(row => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return false;
      const record = row as Record<string, unknown>;
      return (
        record.organizationId === organizationId && record.provider === provider
      );
    });
    if (matches.length !== 1) throw new Error();
    const record = matches[0] as Record<string, unknown>;
    registrationFound =
      provider === "GMAIL"
        ? typeof record.clientId === "string" &&
          GOOGLE_CLIENT.test(record.clientId)
        : typeof record.clientId === "string" &&
          UUID.test(record.clientId) &&
          typeof record.microsoftTenantId === "string" &&
          UUID.test(record.microsoftTenantId);
  } catch {
    registrationFound = false;
  }
  if (!registrationFound) pending.add("CLIENT_REGISTRATION_MISSING_OR_INVALID");

  let secretValid = false;
  try {
    const raw = environment.EMAIL_OAUTH_CLIENT_SECRETS_JSON ?? "";
    if (!raw || raw.length > 65536) throw new Error();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const secret = parsed[organizationId + ":" + provider];
    secretValid =
      typeof secret === "string" && /^[\x21-\x7e]{16,4096}$/.test(secret);
  } catch {
    secretValid = false;
  }
  if (!secretValid) pending.add("CLIENT_SECRET_CONFIG_MISSING");

  const missing = [...pending].sort();
  return {
    provider,
    status:
      missing.length === 0 ? "READY_FOR_CONTROLLED_HOMOLOGATION" : "NOT_READY",
    readyForControlledHomologation: missing.length === 0,
    sendingEnabled: false,
    pending: missing,
  };
}
