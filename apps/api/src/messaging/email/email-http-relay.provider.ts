import { isIP } from "node:net";
import { emailIdempotencyHash } from "./email-outbox-crypto";
import {
  EmailDeliveryUnknownError,
  type EmailProvider,
  type EmailSubmission,
  type TransactionalEmail,
} from "./email-provider";

export type EmailRelayConfig = Readonly<{
  endpoint: string;
  allowedHostname: string;
  bearerToken: string;
  timeoutMs?: number;
}>;

type RelayResponse = Pick<Response, "status" | "text" | "redirected">;
export type EmailRelayTransport = (
  url: string,
  options: RequestInit
) => Promise<RelayResponse>;

/**
 * A transport adapter for a trusted HTTPS relay with durable idempotency.
 * Not registered in EmailModule: the default provider remains disabled.
 *
 * Contract required from the relay:
 * - persistently deduplicate Idempotency-Key across connection failures;
 * - 200/201/202 with a canonical messageId means accepted, not delivered;
 * - never return 4xx for an accepted request;
 * - never issue redirects.
 */
export class HttpsEmailRelayProvider implements EmailProvider {
  private readonly endpoint: string;
  private readonly bearerToken: string;
  private readonly timeoutMs: number;

  constructor(
    config: EmailRelayConfig,
    private readonly transport: EmailRelayTransport = fetch
  ) {
    if (!config || typeof config.endpoint !== "string") {
      throw new Error("INVALID_EMAIL_RELAY_CONFIG");
    }
    let endpoint: URL;
    try {
      endpoint = new URL(config.endpoint);
    } catch {
      throw new Error("INVALID_EMAIL_RELAY_CONFIG");
    }
    const host = config.allowedHostname?.toLowerCase();
    if (
      endpoint.protocol !== "https:" ||
      !host ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ||
      isIP(host) !== 0 ||
      endpoint.hostname !== host ||
      endpoint.port !== "" ||
      endpoint.username !== "" ||
      endpoint.password !== "" ||
      endpoint.search !== "" ||
      endpoint.hash !== "" ||
      !/^\/[a-zA-Z0-9/_-]+$/.test(endpoint.pathname) ||
      typeof config.bearerToken !== "string" ||
      !/^[A-Za-z0-9._~+/=-]{16,1024}$/.test(config.bearerToken)
    ) {
      throw new Error("INVALID_EMAIL_RELAY_CONFIG");
    }
    const timeout = config.timeoutMs ?? 10000;
    if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 15000) {
      throw new Error("INVALID_EMAIL_RELAY_CONFIG");
    }

    this.endpoint = endpoint.href;
    this.bearerToken = config.bearerToken;
    this.timeoutMs = timeout;
  }

  async send(email: TransactionalEmail): Promise<EmailSubmission> {
    // This delivery increment only supports internal SLA notifications.
    // CSAT requires a separate explicit consent and transport gate.
    if (email.purpose !== "SLA_DUE_SOON") {
      throw new Error("EMAIL_PURPOSE_NOT_AUTHORIZED");
    }

    const idempotencyKey = emailIdempotencyHash(email.idempotencyKey);
    let response: RelayResponse;
    try {
      response = await this.transport(this.endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + this.bearerToken,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          recipient: email.recipient,
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
      });
    } catch {
      // A timeout, DNS/TLS failure, or disconnect does not prove the server
      // failed to accept the request. Let the worker quarantine it.
      throw new EmailDeliveryUnknownError();
    }
    if (response.redirected) {
      throw new EmailDeliveryUnknownError();
    }
    if (response.status >= 500 || response.status < 200) {
      throw new EmailDeliveryUnknownError();
    }
    if (![200, 201, 202].includes(response.status)) {
      // Under the relay contract, these responses are definite rejection.
      throw new Error("EMAIL_RELAY_REJECTED");
    }

    let body: unknown;
    try {
      const raw = await response.text();
      if (raw.length > 4096) throw new Error("OVERSIZED_RELAY_RECEIPT");
      body = JSON.parse(raw);
    } catch {
      // A 2xx response with unreadable metadata is ambiguous acceptance.
      throw new EmailDeliveryUnknownError();
    }
    if (!body || typeof body !== "object" || !("messageId" in body)) {
      throw new EmailDeliveryUnknownError();
    }
    const messageId = (body as { messageId?: unknown }).messageId;
    if (
      typeof messageId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,200}$/.test(messageId)
    ) {
      throw new EmailDeliveryUnknownError();
    }
    return { providerMessageId: messageId };
  }
}
