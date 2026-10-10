import {
  decryptOutboxEmail,
  emailIdempotencyHash,
  emailOutboxKey,
  encryptOutboxEmail,
} from "./email-outbox-crypto";
import type { TransactionalEmail } from "./email-provider";

const key = Buffer.alloc(32, 5).toString("base64");
const email: TransactionalEmail = {
  organizationId: "org",
  referenceId: "ticket",
  idempotencyKey: "satisfaction:org:ticket:v1",
  purpose: "SATISFACTION_REQUEST",
  recipient: "person@example.com",
  subject: "Pesquisa",
  text: "Confira o link privado.",
  html: "<p>Link privado</p>",
};

describe("F4.3 encrypted mail queue payloads", () => {
  it("fails closed without a properly sized key", () => {
    expect(() => emailOutboxKey(undefined)).toThrow();
    expect(() => emailOutboxKey("invalid")).toThrow();
  });
  it("stores only ciphertext and authenticates tenant, ticket and event", () => {
    const hash = emailIdempotencyHash(email.idempotencyKey);
    const encrypted = encryptOutboxEmail(email, key, hash);
    expect(encrypted).not.toContain(email.recipient);
    expect(encrypted).not.toContain(email.text);
    expect(decryptOutboxEmail(encrypted, key, "org", "ticket", hash))
      .toEqual(email);
    expect(() => decryptOutboxEmail(encrypted, key, "other", "ticket", hash))
      .toThrow();
    expect(() => decryptOutboxEmail(encrypted, key, "org", "other", hash))
      .toThrow();
    expect(() => decryptOutboxEmail(encrypted, key, "org", "ticket", "0".repeat(64)))
      .toThrow();
  });
  it("hashes the logical event and rejects unsafe keys or unbounded content", () => {
    expect(emailIdempotencyHash(email.idempotencyKey)).toHaveLength(64);
    expect(() => emailIdempotencyHash("x\nsecret")).toThrow();
    expect(() => emailIdempotencyHash("x".repeat(501))).toThrow();
    expect(() => encryptOutboxEmail(
      { ...email, text: "x".repeat(32769) },
      key,
      emailIdempotencyHash(email.idempotencyKey)
    )).toThrow("EMAIL_PAYLOAD_TOO_LARGE");
  });
});
