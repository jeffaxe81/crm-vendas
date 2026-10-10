import { createHash } from "node:crypto";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  webhookEncryptionKey,
} from "../../webhooks/webhook-secret";
import type { TransactionalEmail } from "./email-provider";

export function emailOutboxKey(key: string | undefined): string {
  try {
    webhookEncryptionKey(key);
  } catch {
    throw new Error("EMAIL_OUTBOX_ENCRYPTION_UNAVAILABLE");
  }
  return key!;
}

export function emailIdempotencyHash(key: string): string {
  if (!key || key.length > 500 || /[\x00-\x1f\x7f]/.test(key))
    throw new Error("INVALID_EMAIL_IDEMPOTENCY_KEY");
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function binding(organizationId: string, referenceId: string, hash: string) {
  return `email-outbox:${organizationId}:${referenceId}:${hash}`;
}

export function encryptOutboxEmail(
  email: TransactionalEmail,
  key: string,
  hash: string
): string {
  if (
    !["SLA_DUE_SOON", "SATISFACTION_REQUEST"].includes(email.purpose) ||
    !email.organizationId ||
    !email.referenceId ||
    !email.recipient ||
    !email.subject ||
    !email.text ||
    !email.html
  )
    throw new Error("INVALID_EMAIL_PAYLOAD");
  const body = JSON.stringify(email);
  if (Buffer.byteLength(body, "utf8") > 32768)
    throw new Error("EMAIL_PAYLOAD_TOO_LARGE");
  return encryptWebhookSecret(
    body,
    emailOutboxKey(key),
    binding(email.organizationId, email.referenceId, hash)
  );
}

export function decryptOutboxEmail(
  encrypted: string,
  key: string,
  organizationId: string,
  referenceId: string,
  hash: string
): TransactionalEmail {
  const body = decryptWebhookSecret(
    encrypted,
    emailOutboxKey(key),
    binding(organizationId, referenceId, hash)
  );
  const decoded: unknown = JSON.parse(body);
  if (!decoded || typeof decoded !== "object")
    throw new Error("INVALID_EMAIL_PAYLOAD");
  const email = decoded as TransactionalEmail;
  if (
    email.organizationId !== organizationId ||
    email.referenceId !== referenceId ||
    emailIdempotencyHash(email.idempotencyKey) !== hash
  )
    throw new Error("EMAIL_BINDING_MISMATCH");
  return email;
}
