import {
  HttpsEmailRelayProvider,
  type EmailRelayConfig,
} from "./email-http-relay.provider";
import { EmailDispatchService } from "./email-dispatch.service";
import { EmailDeliveryUnknownError } from "./email-provider";
import type { TransactionalEmail } from "./email-provider";

const base: EmailRelayConfig = {
  endpoint: "https://mail-relay.example.com/v1/transactional",
  allowedHostname: "mail-relay.example.com",
  bearerToken: "test-bearer-token-12345",
  timeoutMs: 5000,
};

const message: TransactionalEmail = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  referenceId: "00000000-0000-4000-8000-000000000002",
  idempotencyKey: "sla:org:ticket:2099-10-10T12:25:00.000Z",
  purpose: "SLA_DUE_SOON",
  recipient: "operator@example.test",
  subject: "Internal SLA",
  text: "An SLA is approaching.",
  html: "<p>An SLA is approaching.</p>",
};

describe("F4.3-02B2B secure, disabled-by-default HTTPS relay", () => {
  it("requires an exact HTTPS hostname and blocks credentials and redirects", () => {
    const invalidEndpoints = [
      "http://mail-relay.example.com/v1/transactional",
      "https://127.0.0.1/v1/transactional",
      "https://evil.example.net/v1/transactional",
      "https://mail-relay.example.com:4443/v1/transactional",
      "https://user:pass@mail-relay.example.com/v1/transactional",
      "https://mail-relay.example.com/v1/transactional?secret=x",
      "https://mail-relay.example.com/v1/transactional#fragment",
    ];
    for (const endpoint of invalidEndpoints) {
      expect(
        () => new HttpsEmailRelayProvider({ ...base, endpoint })
      ).toThrow("INVALID_EMAIL_RELAY_CONFIG");
    }
    expect(
      () =>
        new HttpsEmailRelayProvider({
          ...base,
          bearerToken: "unsafe\nheader",
        })
    ).toThrow("INVALID_EMAIL_RELAY_CONFIG");
    expect(
      () => new HttpsEmailRelayProvider({ ...base, timeoutMs: 30000 })
    ).toThrow("INVALID_EMAIL_RELAY_CONFIG");
  });

  it("sends a sanitized contract with stable idempotency and timeout", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const relay = new HttpsEmailRelayProvider(base, async (url, init) => {
      requests.push({ url, init });
      return {
        status: 202,
        redirected: false,
        text: async () => JSON.stringify({ messageId: "mail-2026-001" }),
      };
    });

    const first = await relay.send(message);
    const repeated = await relay.send(message);
    expect(first).toEqual({ providerMessageId: "mail-2026-001" });
    expect(repeated).toEqual(first);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toBe(base.endpoint);
    expect(requests[0]!.init.method).toBe("POST");
    expect(requests[0]!.init.redirect).toBe("error");
    expect(requests[0]!.init.signal).toBeInstanceOf(AbortSignal);
    const headers = requests[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer " + base.bearerToken);
    expect(headers["Idempotency-Key"]).toMatch(/^[a-f0-9]{64}$/);
    expect(headers["Idempotency-Key"]).toBe(
      (requests[1]!.init.headers as Record<string, string>)["Idempotency-Key"]
    );
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      recipient: message.recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    expect(requests[0]!.init.body).not.toContain(message.organizationId);
  });

  it("never invokes a transport for external satisfaction requests", async () => {
    let calls = 0;
    const relay = new HttpsEmailRelayProvider(base, async () => {
      calls++;
      return {
        status: 200,
        redirected: false,
        text: async () => JSON.stringify({ messageId: "unexpected" }),
      };
    });
    await expect(
      relay.send({ ...message, purpose: "SATISFACTION_REQUEST" })
    ).rejects.toThrow("EMAIL_PURPOSE_NOT_AUTHORIZED");
    expect(calls).toBe(0);
  });

  it("quarantines network failures because remote acceptance is unknown", async () => {
    const relay = new HttpsEmailRelayProvider(base, async () => {
      throw Error("network connection closed after HTTP request");
    });
    await expect(relay.send(message)).rejects.toBeInstanceOf(
      EmailDeliveryUnknownError
    );
    await expect(new EmailDispatchService(relay).attempt(message)).resolves.toEqual({
      status: "FAILED",
      errorCode: "DELIVERY_UNKNOWN",
    });
  });

  it("quarantines server failures, redirects and malformed acknowledgements", async () => {
    const cases = [
      { status: 503, redirected: false, text: async () => "unavailable" },
      { status: 200, redirected: true, text: async () => "{}" },
      { status: 202, redirected: false, text: async () => "{}" },
      { status: 200, redirected: false, text: async () => "not-json" },
      { status: 202, redirected: false, text: async () => JSON.stringify({ messageId: "" }) },
    ];
    for (const response of cases) {
      const relay = new HttpsEmailRelayProvider(base, async () => response);
      await expect(new EmailDispatchService(relay).attempt(message)).resolves.toEqual({
        status: "FAILED",
        errorCode: "DELIVERY_UNKNOWN",
      });
    }
  });

  it("treats a definitive 4xx rejection as ordinary failure", async () => {
    const relay = new HttpsEmailRelayProvider(base, async () => ({
      status: 401,
      redirected: false,
      text: async () => "invalid credential",
    }));
    expect(await new EmailDispatchService(relay).attempt(message)).toEqual({
      status: "FAILED",
      errorCode: "PROVIDER_ERROR",
    });
  });
});
