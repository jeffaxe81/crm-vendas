import { parseEmailOAuthCallbackQuery } from "./email-oauth-callback-query";

const state = "A".repeat(43);
const code = "4/0AfJohX-google-permitted-code";

const ok = (query: string) => parseEmailOAuthCallbackQuery(query);
const denied = "EMAIL_OAUTH_CALLBACK_QUERY_REJECTED";

describe("F4.3-05B5 offline OAuth callback query", () => {
  it("parses a Google success without treating hints as authorization", () => {
    const parsed = ok(
      "?code=4%2F0AfJohX-google-permitted-code&state=" +
        state +
        "&scope=openid+email&authuser=0&prompt=consent"
    );
    expect(parsed).toEqual({ code, state });
    expect(parsed).not.toHaveProperty("organizationId");
    expect(parsed).not.toHaveProperty("provider");
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("accepts Microsoft successful query and ignores session_state/issuer", () => {
    const parsed = ok(
      "?state=" +
        state +
        "&code=mocked-microsoft-code-12345" +
        "&session_state=opaque-session&iss=https%3A%2F%2Flogin.microsoftonline.com"
    );
    expect(parsed).toEqual({
      code: "mocked-microsoft-code-12345",
      state,
    });
  });

  it.each([
    ["denied consent", "?error=access_denied&state=" + state],
    [
      "error and code mixed",
      "?error=access_denied&code=" + code + "&state=" + state,
    ],
    ["error description", "?code=" + code + "&state=" + state + "&error_description=sensitive"],
    ["error URI", "?code=" + code + "&state=" + state + "&error_uri=https%3A%2F%2Fevil.test"],
    ["missing state", "?code=" + code],
    ["missing code", "?state=" + state],
    ["duplicate state", "?state=" + state + "&state=" + state + "&code=" + code],
    ["duplicate code", "?state=" + state + "&code=" + code + "&code=other"],
    ["duplicate extra", "?state=" + state + "&code=" + code + "&scope=one&scope=two"],
    ["untrusted tenant", "?state=" + state + "&code=" + code + "&organizationId=1"],
    ["untrusted provider", "?state=" + state + "&code=" + code + "&provider=GMAIL"],
    ["request with URL", "https://crm.example.test/admin/email/oauth/callback?code=" + code + "&state=" + state],
    ["empty query", "?"],
    ["wrong-length state", "?state=short&code=" + code],
    ["base64 standard state", "?state=" + "a".repeat(42) + "%2B&code=" + code],
    ["empty code", "?state=" + state + "&code="],
    ["short code", "?state=" + state + "&code=short"],
    ["unencoded plus in code", "?state=" + state + "&code=a+b+c+d+e"],
    ["encoded CRLF", "?state=" + state + "&code=abcdefghi%0D%0A"],
    ["encoded Unicode", "?state=" + state + "&code=abcdefghi%C3%A9"],
    ["malformed percent encoding", "?state=" + state + "&code=abcdefghi%Q0"],
    ["unencoded fragment", "?state=" + state + "&code=abcdefghi#frag"],
    ["oversized query", "?state=" + state + "&code=" + "x".repeat(10000)],
    ["too many pairs", "?state=" + state + "&code=" + code + "&" + "scope=one&authuser=1&prompt=consent&iss=a&hd=x&session_state=v&".repeat(2)],
  ])("rejects %s without revealing raw provider values", (_reason, query) => {
    let message: string | undefined;
    try {
      ok(query);
    } catch (cause) {
      message = (cause as Error).message;
    }
    expect(message).toBe(denied);
    expect(message).not.toContain(code);
    expect(message).not.toContain(state);
  });

  it("enforces exact code and state decoded limits", () => {
    expect(ok("?code=" + "x".repeat(4096) + "&state=" + state)).toEqual({
      code: "x".repeat(4096),
      state,
    });
    expect(() =>
      ok("?code=" + "x".repeat(4097) + "&state=" + state)
    ).toThrow(denied);
  });
});
