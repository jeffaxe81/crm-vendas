import { validEmailOAuthRedirect } from "./email-oauth-redirect";
describe("OAuth HTTPS and explicit local callback policy", () => {
  const original = {
    enabled: process.env.EMAIL_OAUTH_ALLOW_LOOPBACK,
    origin: process.env.EMAIL_OAUTH_CALLBACK_ORIGIN,
  };
  afterEach(() => {
    if (original.enabled === undefined)
      delete process.env.EMAIL_OAUTH_ALLOW_LOOPBACK;
    else process.env.EMAIL_OAUTH_ALLOW_LOOPBACK = original.enabled;
    if (original.origin === undefined)
      delete process.env.EMAIL_OAUTH_CALLBACK_ORIGIN;
    else process.env.EMAIL_OAUTH_CALLBACK_ORIGIN = original.origin;
  });
  it("defaults to HTTPS DNS callbacks", () => {
    delete process.env.EMAIL_OAUTH_ALLOW_LOOPBACK;
    expect(
      validEmailOAuthRedirect(
        "https://crm.example.com/admin/email/oauth/callback"
      )
    ).toBe(true);
    expect(
      validEmailOAuthRedirect(
        "http://127.0.0.1:8080/admin/email/oauth/callback"
      )
    ).toBe(false);
  });
  it("allows only the exact configured loopback origin/port", () => {
    process.env.EMAIL_OAUTH_ALLOW_LOOPBACK = "true";
    process.env.EMAIL_OAUTH_CALLBACK_ORIGIN = "http://127.0.0.1:8080";
    expect(
      validEmailOAuthRedirect(
        "http://127.0.0.1:8080/admin/email/oauth/callback"
      )
    ).toBe(true);
    for (const origin of [
      "http://127.0.0.1:8081",
      "http://localhost:8080",
      "http://192.168.1.1:8080",
      "http://example.com",
      "http://127.0.0.1.attacker.com:8080",
    ])
      expect(
        validEmailOAuthRedirect(origin + "/admin/email/oauth/callback")
      ).toBe(false);
  });
});
