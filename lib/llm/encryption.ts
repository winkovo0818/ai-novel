import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PREFIX = "enc:";

function getKey(): Buffer {
  const secret = process.env.MODEL_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("Missing MODEL_KEY_ENCRYPTION_SECRET env var");
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext API key.
 * Output format: enc:<base64(iv + authTag + ciphertext)>
 */
export function encryptApiKey(plain: string): string {
  if (!plain || plain.trim().length === 0) {
    throw new Error("Cannot encrypt empty API key");
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return PREFIX + combined.toString("base64");
}

/**
 * Decrypt an encrypted API key.
 * If the input does not start with the encryption prefix, it is returned as-is
 * (backwards compatibility with plaintext keys).
 */
export function decryptApiKey(cipherText: string): string {
  if (!cipherText) return "";
  if (!cipherText.startsWith(PREFIX)) {
    // Backwards compatibility: treat as plaintext.
    return cipherText;
  }
  const key = getKey();
  const combined = Buffer.from(cipherText.slice(PREFIX.length), "base64");
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted key length");
  }
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Mask an API key for display (last 4 chars visible).
 * Works on both plaintext and encrypted values.
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "";
  if (key.startsWith(PREFIX)) return "***encrypted***";
  if (key.length <= 4) return "****";
  return "***" + key.slice(-4);
}
