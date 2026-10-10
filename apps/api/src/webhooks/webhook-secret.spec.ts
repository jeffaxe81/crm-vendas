import { encryptWebhookSecret, decryptWebhookSecret } from "./webhook-secret";
const key = Buffer.alloc(32, 8).toString("base64");
const secret = "whsec_a_secret_used_only_in_tests";
describe("webhook secret protection", () => {
  it("encrypts the secret with randomized ciphertext and restores it for signing", () => {
    const first = encryptWebhookSecret(secret, key, "org:subscription");
    const second = encryptWebhookSecret(secret, key, "org:subscription");
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
    expect(first).not.toContain(secret);
    expect(decryptWebhookSecret(first ?? "", key, "org:subscription")).toBe(
      secret
    );
  });
  it("rejects wrong tenant binding, wrong key and tampered ciphertext", () => {
    const encrypted =
      encryptWebhookSecret(secret, key, "org:subscription") ?? "";
    expect(() =>
      decryptWebhookSecret(encrypted, key, "foreign:subscription")
    ).toThrow();
    expect(() =>
      decryptWebhookSecret(
        encrypted,
        Buffer.alloc(32, 9).toString("base64"),
        "org:subscription"
      )
    ).toThrow();
    expect(() =>
      decryptWebhookSecret(encrypted + "broken", key, "org:subscription")
    ).toThrow();
  });
});
