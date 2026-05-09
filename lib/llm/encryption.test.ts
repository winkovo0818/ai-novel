import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { encryptApiKey, decryptApiKey, maskApiKey } from "./encryption";

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.MODEL_KEY_ENCRYPTION_SECRET = "test-secret-key-for-encryption-32chars!";
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("encryptApiKey / decryptApiKey", () => {
  it("round-trips a plaintext key", () => {
    const plain = "sk-test123456789";
    const encrypted = encryptApiKey(plain);
    expect(encrypted).toMatch(/^enc:/);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(plain);
  });

  it("produces different ciphertexts for the same plaintext", () => {
    const plain = "sk-same";
    const e1 = encryptApiKey(plain);
    const e2 = encryptApiKey(plain);
    expect(e1).not.toBe(e2);
  });

  it("throws when encrypting empty string", () => {
    expect(() => encryptApiKey("")).toThrow("Cannot encrypt empty API key");
    expect(() => encryptApiKey("   ")).toThrow("Cannot encrypt empty API key");
  });

  it("returns plaintext as-is when not prefixed with enc:", () => {
    const plain = "sk-legacy";
    expect(decryptApiKey(plain)).toBe(plain);
  });

  it("returns empty string for empty/null input", () => {
    expect(decryptApiKey("")).toBe("");
    expect(decryptApiKey(undefined as unknown as string)).toBe("");
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptApiKey("sk-secret");
    // Flip a character in the base64 payload to corrupt the auth tag / IV.
    const payload = encrypted.slice(4);
    const tamperedPayload = payload.substring(0, 4) + (payload[4] === "A" ? "B" : "A") + payload.substring(5);
    expect(() => decryptApiKey("enc:" + tamperedPayload)).toThrow();
  });
});

describe("maskApiKey", () => {
  it("masks plaintext keys", () => {
    expect(maskApiKey("sk-abcdefghijklmnop")).toBe("***mnop");
  });

  it("masks encrypted keys as encrypted placeholder", () => {
    const encrypted = encryptApiKey("sk-secret");
    expect(maskApiKey(encrypted)).toBe("***encrypted***");
  });

  it("returns empty for empty/null input", () => {
    expect(maskApiKey("")).toBe("");
    expect(maskApiKey(null)).toBe("");
    expect(maskApiKey(undefined)).toBe("");
  });

  it("returns stars for very short keys", () => {
    expect(maskApiKey("ab")).toBe("****");
  });
});
