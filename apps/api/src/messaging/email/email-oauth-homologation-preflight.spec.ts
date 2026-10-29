import {
  assessEmailOAuthHomologation,
  type EmailOAuthHomologationInput,
} from "./email-oauth-homologation-preflight";

const organizationId = "11111111-1111-4111-8111-111111111111";
const googleClientId =
  "123456789012-syntheticclient.apps.googleusercontent.com";

function completeEnvironment(): NodeJS.ProcessEnv {
  return {
    EMAIL_OAUTH_ALLOW_LOOPBACK: "true",
    EMAIL_OAUTH_CALLBACK_ORIGIN: "http://127.0.0.1:3000",
    EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON: JSON.stringify({
      version: 1,
      registrations: [
        { provider: "GMAIL", organizationId, clientId: googleClientId },
      ],
    }),
    EMAIL_OAUTH_CLIENT_SECRETS_JSON: JSON.stringify({
      [organizationId + ":GMAIL"]: "synthetic-client-secret-value",
    }),
    EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    EMAIL_OAUTH_PENDING_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
  };
}

async function assess(environment: NodeJS.ProcessEnv) {
  const input: EmailOAuthHomologationInput = {
    organizationId,
    provider: "GMAIL",
    environment,
  };
  return assessEmailOAuthHomologation(input);
}

describe("email OAuth controlled homologation preflight", () => {
  it("reports complete server configuration without enabling sending", async () => {
    await expect(assess(completeEnvironment())).resolves.toEqual({
      provider: "GMAIL",
      status: "READY_FOR_CONTROLLED_HOMOLOGATION",
      readyForControlledHomologation: true,
      sendingEnabled: false,
      pending: [],
    });
  });

  it("fails closed with sanitized pending codes", async () => {
    const environment = completeEnvironment();
    delete environment.EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY;
    delete environment.EMAIL_OAUTH_CLIENT_SECRETS_JSON;

    const result = await assess(environment);
    expect(result.readyForControlledHomologation).toBe(false);
    expect(result.sendingEnabled).toBe(false);
    expect(result.status).toBe("NOT_READY");
    expect(result.pending).toEqual(
      expect.arrayContaining([
        "CLIENT_SECRET_CONFIG_MISSING",
        "TOKEN_ENCRYPTION_KEY_MISSING",
      ])
    );
    expect(JSON.stringify(result)).not.toContain("synthetic-client-secret");
    expect(JSON.stringify(result)).not.toContain(googleClientId);
  });
});
