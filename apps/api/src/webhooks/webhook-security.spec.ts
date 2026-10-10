import {
  assertSafeWebhookTargetUrl,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./webhook-security";

describe("F4.2 webhook security", () => {
  describe("assertSafeWebhookTargetUrl", () => {
    test.each([
      "https://127.0.0.1/hook",
      "https://10.0.0.8/hook",
      "https://172.16.20.4/hook",
      "https://192.168.1.10/hook",
      "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/hook",
      "https://192.0.0.1/hook",
      "https://192.0.0.9/hook",
      "https://192.0.0.170/hook",
      "https://192.0.2.1/hook",
      "https://198.18.0.1/hook",
      "https://198.51.100.1/hook",
      "https://203.0.113.1/hook",
      "https://[ff02::1]/hook",
      "https://[2001:db8::1]/hook",
      "https://[2002:7f00:1::]/hook",
    ])("rejects SSRF target %s", targetUrl => {
      expect(() => assertSafeWebhookTargetUrl(targetUrl)).toThrow();
    });

    it("requires HTTPS for outbound webhook targets", () => {
      expect(() =>
        assertSafeWebhookTargetUrl("http://hooks.example.com/crm")
      ).toThrow();
    });

    it("accepts a public HTTPS target", () => {
      expect(() =>
        assertSafeWebhookTargetUrl("https://hooks.example.com/crm")
      ).not.toThrow();
    });

    test.each([
      "https://hooks.example.com:8443/crm",
      "https://hooks.example.com/crm?token=hidden",
      "https://hooks.example.com/crm#hidden",
    ])("rejects ports and secret-bearing URL parts %s", target => {
      expect(() => assertSafeWebhookTargetUrl(target)).toThrow();
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
