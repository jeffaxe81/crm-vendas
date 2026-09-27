import { API_KEY_PREFIX, generateApiKey, hashApiKey } from "./api-key-hash";

describe("api-key-hash", () => {
  it("generates a key with the axk_ prefix and a matching prefix slice", () => {
    const { plainKey, keyPrefix } = generateApiKey();
    expect(plainKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(keyPrefix).toBe(plainKey.slice(0, 12));
    expect(plainKey.length).toBeGreaterThan(20);
  });

  it("generates distinct keys on each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plainKey).not.toBe(b.plainKey);
  });

  it("hashes deterministically and never returns the plain key", () => {
    const { plainKey } = generateApiKey();
    const hash1 = hashApiKey(plainKey);
    const hash2 = hashApiKey(plainKey);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(plainKey);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });
});
