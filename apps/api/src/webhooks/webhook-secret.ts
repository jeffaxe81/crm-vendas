import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function webhookEncryptionKey(key: string | undefined): Buffer {
  if (!key) throw Error("WEBHOOK_ENCRYPTION_KEY_UNAVAILABLE");
  const bytes = Buffer.from(key, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== key)
    throw Error("WEBHOOK_ENCRYPTION_KEY_INVALID");
  return bytes;
}
export function encryptWebhookSecret(
  secret: string,
  key: string,
  binding: string
): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    webhookEncryptionKey(key),
    nonce
  );
  cipher.setAAD(Buffer.from(binding));
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}
export function decryptWebhookSecret(
  ciphertext: string,
  key: string,
  binding: string
): string {
  const parts = ciphertext.split(".");
  const [version, nonceText = "", tagText = "", bodyText = ""] = parts;
  const nonce = Buffer.from(nonceText, "base64");
  const tag = Buffer.from(tagText, "base64");
  const body = Buffer.from(bodyText, "base64");
  if (
    parts.length !== 4 ||
    version !== "v1" ||
    nonce.length !== 12 ||
    tag.length !== 16 ||
    !body.length ||
    nonce.toString("base64") !== nonceText ||
    tag.toString("base64") !== tagText ||
    body.toString("base64") !== bodyText
  )
    throw Error("WEBHOOK_SECRET_INVALID");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    webhookEncryptionKey(key),
    nonce
  );
  decipher.setAAD(Buffer.from(binding));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8"
  );
}
