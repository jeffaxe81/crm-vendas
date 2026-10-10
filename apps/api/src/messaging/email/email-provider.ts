/**
 * F4.3-01: provider-neutral outbound transactional email contract.
 *
 * This contract does not itself enable sending. Production adapters must be
 * configured explicitly and called by a durable post-commit worker.
 */
export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export type TransactionalEmailPurpose = "SLA_DUE_SOON" | "SATISFACTION_REQUEST";

export type TransactionalEmail = Readonly<{
  organizationId: string;
  referenceId: string;
  idempotencyKey: string;
  purpose: TransactionalEmailPurpose;
  recipient: string;
  subject: string;
  text: string;
  html: string;
}>;

export type EmailSubmission = Readonly<{
  /** Provider acceptance is not proof of inbox delivery. */
  providerMessageId: string;
}>;

export interface EmailProvider {
  send(email: TransactionalEmail): Promise<EmailSubmission>;
}

export class EmailProviderUnavailableError extends Error {
  constructor() {
    super("Transactional email provider is not configured");
    this.name = "EmailProviderUnavailableError";
  }
}

/** Fail closed: no transport, credentials, network call or silent fake success. */
export class DisabledEmailProvider implements EmailProvider {
  async send(_email: TransactionalEmail): Promise<EmailSubmission> {
    throw new EmailProviderUnavailableError();
  }
}
