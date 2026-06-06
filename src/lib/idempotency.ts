import crypto from "crypto";

/**
 * Generate a fingerprint for deduplication.
 * Hash = SHA-256(phone + message_text + 5-minute time bucket)
 * The time bucket prevents the same message content from being rejected
 * if sent again hours later, while catching rapid retries.
 */
export function generateMessageHash(phone: string, message: string): string {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const input = `${phone}:${message.trim().toLowerCase()}:${bucket}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}
