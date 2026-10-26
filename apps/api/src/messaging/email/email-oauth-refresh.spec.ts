import { jest } from "@jest/globals";
import { EmailOAuthRefresh } from "./email-oauth-refresh";
import type { ConfidentialClient } from "./email-oauth-confidential-exchange";
const client: ConfidentialClient = {
  provider: "GMAIL",
  clientId: "123456-test.apps.googleusercontent.com",
  clientSecret: "client-secret-123456",
  registeredRedirectUri: "https://crm.example.com/admin/email/oauth/callback",
};
const refresh = "refresh-token-1234567890";
describe("OAuth refresh simulator", () => {
  it.each(["GMAIL", "MICROSOFT_365"] as const)(
    "refreshes %s once, supporting optional rotation",
    async provider => {
      const request = jest.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          token_type: "Bearer",
          access_token: "access-token-1234567890",
          refresh_token: "rotated-token-1234567890",
          expires_in: 3600,
        })
      );
      const result = await new EmailOAuthRefresh(request).refresh(
        {
          ...client,
          provider,
          ...(provider === "MICROSOFT_365"
            ? { microsoftTenantId: "b9c71e22-a16a-4fb7-bcd2-50831fd9317a" }
            : {}),
        },
        refresh
      );
      expect(result.refreshToken).toBe("rotated-token-1234567890");
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]![1]?.redirect).toBe("manual");
      expect(request.mock.calls[0]![0]).toBe(
        provider === "GMAIL"
          ? "https://oauth2.googleapis.com/token"
          : "https://login.microsoftonline.com/b9c71e22-a16a-4fb7-bcd2-50831fd9317a/oauth2/v2.0/token"
      );
    }
  );
  it("marks invalid_grant revoked, without exposing provider response", async () => {
    const request = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: "invalid_grant", error_description: "private" },
          { status: 400 }
        )
      );
    expect(
      await new EmailOAuthRefresh(request).refresh(client, refresh)
    ).toEqual({ accessToken: "", revoked: true });
  });
  it.each([429, 500, 302])(
    "never retries HTTP %s or exposes upstream data",
    async status => {
      const request = jest
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ access_token: "private-provider-token" }, { status })
        );
      await expect(
        new EmailOAuthRefresh(request).refresh(client, refresh)
      ).rejects.toThrow("EMAIL_OAUTH_REFRESH_FAILED");
      expect(request).toHaveBeenCalledTimes(1);
    }
  );
  it("rejects oversized responses and timeouts", async () => {
    const request = jest
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ padding: "x".repeat(70000) }));
    await expect(
      new EmailOAuthRefresh(request).refresh(client, refresh)
    ).rejects.toThrow("EMAIL_OAUTH_REFRESH_FAILED");
    request.mockRejectedValue(new Error("private timeout"));
    await expect(
      new EmailOAuthRefresh(request).refresh(client, refresh)
    ).rejects.toThrow("EMAIL_OAUTH_REFRESH_FAILED");
  });
});
