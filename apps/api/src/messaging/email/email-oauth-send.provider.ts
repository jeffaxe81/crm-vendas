import { randomUUID } from "node:crypto";
import type { EmailOAuthProvider } from "./email-oauth-authorization-intent";
import {
  EmailDeliveryUnknownError,
  EmailProviderUnavailableError,
  type EmailProvider,
  type EmailSubmission,
  type TransactionalEmail,
} from "./email-provider";

/** Implementations obtain short-lived tokens from a tenant-bound encrypted vault. */
export interface EmailOAuthSendCredentials {
  acquire(organizationId: string): Promise<
    Readonly<{
      provider: EmailOAuthProvider;
      accessToken: string;
    }>
  >;
}
export type EmailOAuthSendPolicy = Readonly<{
  enabled: boolean;
  /** Exact organization/recipient pairs authorized for provider homologation. */
  homologationRecipients: ReadonlyMap<string, ReadonlySet<string>>;
}>;
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/**
 * A provider request has no durable idempotency guarantee. Once dispatch starts,
 * every non-success outcome is quarantined; this adapter never retries a send.
 * Graph acceptance is a local receipt, never an assertion of delivery.
 */
export class EmailOAuthSendProvider implements EmailProvider {
  constructor(
    private readonly credentials: EmailOAuthSendCredentials,
    private readonly policy: EmailOAuthSendPolicy,
    private readonly request: typeof fetch = fetch
  ) {}

  async prepareOrganization(organizationId: string): Promise<EmailProvider> {
    if (
      !this.policy.enabled ||
      !this.policy.homologationRecipients.has(organizationId)
    )
      throw new EmailProviderUnavailableError();
    const credential = await this.credentials.acquire(organizationId);
    return new EmailOAuthSendProvider(
      {
        acquire: async requested => {
          if (requested !== organizationId)
            throw new EmailProviderUnavailableError();
          return credential;
        },
      },
      this.policy,
      this.request
    );
  }

  async send(
    email: TransactionalEmail,
    signal?: AbortSignal
  ): Promise<EmailSubmission> {
    if (
      !this.policy.enabled ||
      !ADDRESS.test(email.recipient) ||
      email.recipient.length > 254 ||
      !this.policy.homologationRecipients
        .get(email.organizationId)
        ?.has(email.recipient.toLowerCase()) ||
      /[\r\n\x00]/.test(email.subject) ||
      email.subject.length > 998 ||
      Buffer.byteLength(email.text, "utf8") +
        Buffer.byteLength(email.html, "utf8") >
        1024 * 1024
    )
      throw new EmailProviderUnavailableError();
    // Token acquisition occurs before dispatch: failures cannot have sent mail.
    const credential = await this.credentials.acquire(email.organizationId);
    if (!/^[\x21-\x7e]{20,32768}$/.test(credential.accessToken))
      throw new EmailProviderUnavailableError();
    const receipt = randomUUID();
    let endpoint: string;
    let body: string;
    if (credential.provider === "GMAIL") {
      const boundary = `axes_${randomUUID().replaceAll("-", "")}`;
      const raw = [
        `To: ${email.recipient}`,
        `Subject: =?UTF-8?B?${Buffer.from(email.subject).toString("base64")}?=`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        fold(email.text),
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        fold(email.html),
        `--${boundary}--`,
        "",
      ].join("\r\n");
      endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
      body = JSON.stringify({ raw: Buffer.from(raw).toString("base64url") });
    } else if (credential.provider === "MICROSOFT_365") {
      endpoint = "https://graph.microsoft.com/v1.0/me/sendMail";
      body = JSON.stringify({
        message: {
          subject: email.subject,
          body: { contentType: "HTML", content: email.html },
          toRecipients: [{ emailAddress: { address: email.recipient } }],
        },
        saveToSentItems: true,
      });
    } else throw new EmailProviderUnavailableError();
    try {
      const response = await this.request(endpoint, {
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${credential.accessToken}`,
          "Content-Type": "application/json",
        },
        body,
      });
      // No response payload is trusted or logged; acceptance is enough to stop
      // outbox retries. A local opaque ID cannot be confused with delivery proof.
      if (
        response.redirected ||
        response.status !== (credential.provider === "GMAIL" ? 200 : 202)
      )
        throw new EmailDeliveryUnknownError();
      await response.body?.cancel().catch(() => undefined);
      return {
        providerMessageId: `oauth-accepted:${credential.provider}:${receipt}`,
      };
    } catch {
      throw new EmailDeliveryUnknownError();
    }
  }
}
function fold(value: string): string {
  return (
    Buffer.from(value, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}
