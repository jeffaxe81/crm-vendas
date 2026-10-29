import { EnvironmentEmailOAuthClientResolver } from "./email-oauth-client-registry";
import { validEmailOAuthOrigin } from "./email-oauth-redirect";
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
function canonicalKey(value: string | undefined): boolean {
  if (!value) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length === 32 && bytes.toString("base64") === value;
}

export async function assessEmailOAuthHomologation(
  input: EmailOAuthHomologationInput
): Promise<EmailOAuthHomologationResult> {
  const pending = new Set<string>();
  const { environment, organizationId, provider } = input;

  if (!UUID.test(organizationId)) pending.add("ORGANIZATION_INVALID");
  if (
    !environment.EMAIL_OAUTH_CALLBACK_ORIGIN ||
    environment.EMAIL_OAUTH_CALLBACK_ORIGIN.length > 256 ||
    !validEmailOAuthOrigin(environment.EMAIL_OAUTH_CALLBACK_ORIGIN, environment)
  )
    pending.add("CALLBACK_ORIGIN_INVALID_OR_MISSING");
  if (!canonicalKey(environment.EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY))
    pending.add("TOKEN_ENCRYPTION_KEY_MISSING");
  if (!canonicalKey(environment.EMAIL_OAUTH_PENDING_ENCRYPTION_KEY))
    pending.add("PENDING_ENCRYPTION_KEY_MISSING");

  let registrationFound = false;
  try {
    const resolver =
      EnvironmentEmailOAuthClientResolver.fromEnvironment(environment);
    registrationFound = Boolean(
      await resolver.resolve(organizationId, provider)
    );
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
