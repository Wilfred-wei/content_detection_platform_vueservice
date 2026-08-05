import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENVELOPE_SCHEMA = "agent-storage-envelope.v1";
const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;

export interface StorageProtector {
  protect(input: Buffer, purpose: string): Buffer;
  unprotect(input: Buffer, purpose: string): Buffer;
}

function boundedPurpose(value: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,80}$/.test(value)) {
    throw new Error("INVALID_STORAGE_PURPOSE");
  }
  return value;
}

export function validateStorageEncryptionKey(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("INVALID_CONFIGURATION:AGENT_STORAGE_ENCRYPTION_KEY must be exactly 32 bytes encoded as 64 hexadecimal characters.");
  }
  return normalized;
}

export function createStorageProtector(value: string): StorageProtector {
  const normalized = validateStorageEncryptionKey(value);
  if (!normalized) throw new Error("INVALID_STORAGE_KEY");
  const key = Buffer.from(normalized, "hex");
  const keyId = createHash("sha256").update(key).digest("hex").slice(0, 16);

  return {
    protect(input, purpose) {
      const normalizedPurpose = boundedPurpose(purpose);
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, nonce);
      cipher.setAAD(Buffer.from(`${ENVELOPE_SCHEMA}:${normalizedPurpose}`, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.from(`${JSON.stringify({
        schemaVersion: ENVELOPE_SCHEMA,
        algorithm: ALGORITHM,
        keyId,
        purpose: normalizedPurpose,
        nonce: nonce.toString("base64url"),
        tag: tag.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
      })}\n`, "utf8");
    },
    unprotect(input, purpose) {
      const normalizedPurpose = boundedPurpose(purpose);
      let envelope: Record<string, unknown>;
      try {
        envelope = JSON.parse(input.toString("utf8")) as Record<string, unknown>;
      } catch {
        throw new Error("STORAGE_DECRYPTION_FAILED");
      }
      if (envelope.schemaVersion !== ENVELOPE_SCHEMA
        || envelope.algorithm !== ALGORITHM
        || envelope.keyId !== keyId
        || envelope.purpose !== normalizedPurpose
        || typeof envelope.nonce !== "string"
        || typeof envelope.tag !== "string"
        || typeof envelope.ciphertext !== "string") {
        throw new Error("STORAGE_DECRYPTION_FAILED");
      }
      try {
        const nonce = Buffer.from(envelope.nonce, "base64url");
        const tag = Buffer.from(envelope.tag, "base64url");
        const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
        if (nonce.length !== NONCE_BYTES || tag.length !== 16 || ciphertext.length > 256 * 1024 * 1024) {
          throw new Error("invalid envelope");
        }
        const decipher = createDecipheriv(ALGORITHM, key, nonce);
        decipher.setAAD(Buffer.from(`${ENVELOPE_SCHEMA}:${normalizedPurpose}`, "utf8"));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } catch {
        throw new Error("STORAGE_DECRYPTION_FAILED");
      }
    },
  };
}

export function encodeStoragePayload(input: Buffer, protector: StorageProtector | undefined, purpose: string): Buffer {
  return protector ? protector.protect(input, purpose) : input;
}

export function decodeStoragePayload(input: Buffer, protector: StorageProtector | undefined, purpose: string): Buffer {
  let parsed: Record<string, unknown> | undefined;
  try {
    const value = JSON.parse(input.toString("utf8")) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    // Binary or malformed plaintext is handled by the caller's parser.
  }
  const encrypted = parsed?.schemaVersion === ENVELOPE_SCHEMA;
  if (encrypted) {
    if (!protector) throw new Error("STORAGE_ENCRYPTION_KEY_REQUIRED");
    return protector.unprotect(input, purpose);
  }
  if (protector) throw new Error("STORAGE_PLAINTEXT_WHEN_ENCRYPTION_REQUIRED");
  return input;
}
