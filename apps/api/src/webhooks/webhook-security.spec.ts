import {
  assertSafeWebhookTargetUrl,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./webhook-security";

describe("F4.2 webhook security", () => {
  describe("assertSafeWebhookTargetUrl", () => {
    test.each([
      "http://127.0.0.1/hook",
      "http://10.0.0.8/hook",
      "http://172.16.20.4/hook",
      "http://192.168.1.10/hook",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/hook",
    ])("rejects SSRF target %s", targetUrl => {
      expect(() => assertSafeWebhookTargetUrl(targetUrl)).toThrow();
    });

    it("accepts a public HTTPS target", () => {
      expect(() =>
        assertSafeWebhookTargetUrl("https://hooks.example.com/crm")
      ).not.toThrow();
    });
  });

  describe("webhook signatures", () => {
    it("creates a signature that the recipient can verify", () => {
      const payload = JSON.stringify({
        event: "company.created",
        data: { id: "company-1" },
      });
      const secret = "webhook-test-secret";

      const signature = signWebhookPayload(payload, secret);

      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(verifyWebhookSignature(payload, secret, signature)).toBe(true);
      expect(
        verifyWebhookSignature(
          JSON.stringify({
            event: "company.created",
            data: { id: "tampered" },
          }),
          secret,
          signature
        )
      ).toBe(false);
    });
  });
});
