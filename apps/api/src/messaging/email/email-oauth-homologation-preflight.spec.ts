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

describe("preflight runtime configuration parity", () => {
  it.each(["https://127.0.0.1", "https://localhost"])(
    "rejects runtime-invalid callback %s",
    async origin => {
      const environment = completeEnvironment();
      environment.EMAIL_OAUTH_CALLBACK_ORIGIN = origin;
      expect((await assess(environment)).pending).toContain(
        "CALLBACK_ORIGIN_INVALID_OR_MISSING"
      );
    }
  );

  it.each([
    "malformed-other-tenant",
    "unknown-field",
    "duplicate-other-tenant",
  ])("rejects globally invalid registry: %s", async kind => {
    const environment = completeEnvironment();
    const registry = JSON.parse(
      environment.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON!
    );
    if (kind === "unknown-field")
      registry.registrations[0].clientSecret = "must-never-appear";
    else {
      const other = {
        ...registry.registrations[0],
        organizationId: "22222222-2222-4222-8222-222222222222",
      };
      registry.registrations.push(
        kind === "malformed-other-tenant"
          ? { ...other, clientId: "bad" }
          : other
      );
      if (kind === "duplicate-other-tenant") registry.registrations.push(other);
    }
    environment.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON =
      JSON.stringify(registry);
    const result = await assess(environment);
    expect(result.pending).toContain("CLIENT_REGISTRATION_MISSING_OR_INVALID");
    expect(JSON.stringify(result)).not.toContain("must-never-appear");
  });
});

it("keeps an unregistered tenant pending", async () => {
  const environment = completeEnvironment();
  const registry = JSON.parse(
    environment.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON!
  );
  registry.registrations[0].organizationId =
    "22222222-2222-4222-8222-222222222222";
  environment.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON = JSON.stringify(registry);
  expect((await assess(environment)).pending).toContain(
    "CLIENT_REGISTRATION_MISSING_OR_INVALID"
  );
});

it.each(["short", "contains whitespace value", "\ninvalid-secret-value"])(
  "keeps malformed secrets pending",
  async secret => {
    const environment = completeEnvironment();
    environment.EMAIL_OAUTH_CLIENT_SECRETS_JSON = JSON.stringify({
      [organizationId + ":GMAIL"]: secret,
    });
    const result = await assess(environment);
    expect(result.pending).toContain("CLIENT_SECRET_CONFIG_MISSING");
    expect(result.sendingEnabled).toBe(false);
  }
);

it("accepts valid Microsoft configuration without enabling sending", async () => {
  const environment = completeEnvironment();
  environment.EMAIL_OAUTH_CLIENT_REGISTRATIONS_JSON = JSON.stringify({
    version: 1,
    registrations: [
      {
        organizationId,
        provider: "MICROSOFT_365",
        clientId: organizationId,
        microsoftTenantId: organizationId,
      },
    ],
  });
  environment.EMAIL_OAUTH_CLIENT_SECRETS_JSON = JSON.stringify({
    [organizationId + ":MICROSOFT_365"]: "synthetic-microsoft-secret-value",
  });
  const result = await assessEmailOAuthHomologation({
    organizationId,
    provider: "MICROSOFT_365",
    environment,
  });
  expect(result.readyForControlledHomologation).toBe(true);
  expect(result.sendingEnabled).toBe(false);
});

it("requires explicit local callback opt-in", async () => {
  const environment = completeEnvironment();
  delete environment.EMAIL_OAUTH_ALLOW_LOOPBACK;
  expect((await assess(environment)).pending).toContain(
    "CALLBACK_ORIGIN_INVALID_OR_MISSING"
  );
});

it.each([
  "EMAIL_OAUTH_TOKEN_ENCRYPTION_KEY",
  "EMAIL_OAUTH_PENDING_ENCRYPTION_KEY",
])("rejects malformed encryption key %s", async key => {
  const environment = completeEnvironment();
  environment[key] = "invalid-key";
  const result = await assess(environment);
  expect(result.readyForControlledHomologation).toBe(false);
  expect(result.sendingEnabled).toBe(false);
});

it("keeps unsupported providers pending", async () => {
  const result = await assessEmailOAuthHomologation({
    organizationId,
    provider: "OTHER" as EmailOAuthHomologationInput["provider"],
    environment: completeEnvironment(),
  });
  expect(result.pending).toContain("CLIENT_REGISTRATION_MISSING_OR_INVALID");
  expect(result.readyForControlledHomologation).toBe(false);
});
