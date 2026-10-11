import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("offline OAuth callback landing (fail closed)", () => {
  it("strips codes and state; never renders or exchanges credentials", () => {
    const authorizationCode = "confidential-auth-code";
    const state = "confidential-oauth-state";
    const result = GET(
      new Request(
        `https://crm.example.com/admin/email/oauth/callback?code=${authorizationCode}&state=${state}`
      )
    );
    expect(result.status).toBe(303);
    expect(result.headers.get("Location")).toBe(
      "/?emailOAuth=not_connected"
    );
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(result.headers.get("Location")).not.toContain(state);
    expect(result.headers.get("Location")).not.toContain(authorizationCode);
  });

  it("handles a provider error without reflecting its parameters", () => {
    const result = GET(
      new Request(
        "https://crm.example.com/admin/email/oauth/callback?error=access_denied&error_description=private"
      )
    );
    expect(result.status).toBe(303);
    expect(result.headers.get("Location")).toBe(
      "/?emailOAuth=not_connected"
    );
  });
});
