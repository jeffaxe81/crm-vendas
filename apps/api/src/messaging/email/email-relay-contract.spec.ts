import { emailIdempotencyHash } from "./email-outbox-crypto";
import { HttpsEmailRelayProvider } from "./email-http-relay.provider";
import type { EmailRelayTransport } from "./email-http-relay.provider";
import { EmailDeliveryUnknownError } from "./email-provider";
import type { TransactionalEmail } from "./email-provider";

/**
 * A deterministic relay simulator with a shared durable journal. A real
 * provider must demonstrate the same semantics in an isolated acceptance
 * environment before any outbound activation is considered.
 */
describe("F4.3-02D2 simulated durable relay acceptance contract", () => {
  const original: TransactionalEmail = {
    organizationId: "00000000-0000-4000-8000-000000000001",
    referenceId: "00000000-0000-4000-8000-000000000002",
    idempotencyKey: "sla:tenant:ticket:2099-10-10T12:25:00.000Z",
    purpose: "SLA_DUE_SOON",
    recipient: "operator@example.test",
    subject: "SLA notice",
    text: "Internal notice",
    html: "<p>Internal notice</p>",
  };

  const config = {
    endpoint: "https://relay.example.test/v1/transactional",
    allowedHostname: "relay.example.test",
    bearerToken: "test-only-credential-1234567",
    timeoutMs: 3000,
  } as const;

  it("keeps the same deduplication key after a lost acknowledgement", async () => {
    // Simulated durable store survives the creation of a new adapter.
    const durableJournal = new Map<string, string>();
    let upstreamAcceptances = 0;
    let disconnectAfterAccept = true;
    const receivedKeys: string[] = [];
    const simulatedRelay: EmailRelayTransport = async (_url, options) => {
      const headers = options.headers as Record<string, string>;
      const idempotencyKey = headers["Idempotency-Key"];
      receivedKeys.push(idempotencyKey);
      if (!durableJournal.has(idempotencyKey)) {
        upstreamAcceptances++;
        durableJournal.set(idempotencyKey, "relay-accepted-001");
      }
      if (disconnectAfterAccept) {
        disconnectAfterAccept = false;
        throw new Error("connection lost after provider accepted request");
      }
      return {
        status: 202,
        redirected: false,
        text: async () =>
          JSON.stringify({ messageId: durableJournal.get(idempotencyKey) }),
      };
    };

    const firstProcess = new HttpsEmailRelayProvider(config, simulatedRelay);
    await expect(firstProcess.send(original)).rejects.toBeInstanceOf(
      EmailDeliveryUnknownError
    );

    // This second call is a simulator-only exercise. The application never
    // automatically retries MANUAL_REVIEW records after ambiguous acceptance.
    const restartedProcess = new HttpsEmailRelayProvider(
      config,
      simulatedRelay
    );
    const receipt = await restartedProcess.send(original);
    expect(receipt.providerMessageId).toBe("relay-accepted-001");
    expect(upstreamAcceptances).toBe(1);
    expect(receivedKeys).toEqual([
      emailIdempotencyHash(original.idempotencyKey),
      emailIdempotencyHash(original.idempotencyKey),
    ]);
  });

  it("rejects forbidden CSAT without reaching transport", async () => {
    let calls = 0;
    const relay = new HttpsEmailRelayProvider(config, async () => {
      calls++;
      throw new Error("unexpected outbound request");
    });
    await expect(
      relay.send({ ...original, purpose: "SATISFACTION_REQUEST" })
    ).rejects.toThrow("EMAIL_PURPOSE_NOT_AUTHORIZED");
    expect(calls).toBe(0);
  });
});
