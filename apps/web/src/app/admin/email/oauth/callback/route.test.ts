import { describe, expect, it } from "vitest";
import { GET } from "./route";
describe("OAuth callback landing", () => {
  it("never renders codes/state and strips browser query before messaging the same origin", async () => {
    const result = GET(
      new Request(
        "http://127.0.0.1/admin/email/oauth/callback?code=private-code&state=private-state"
      )
    );
    const html = await result.text();
    expect(result.status).toBe(200);
    expect(html).not.toContain("private-code");
    expect(html).not.toContain("private-state");
    expect(html.indexOf("history.replaceState")).toBeLessThan(
      html.indexOf("postMessage")
    );
    expect(html).toContain("window.location.origin");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("fetch(");
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(result.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'"
    );
  });
});
