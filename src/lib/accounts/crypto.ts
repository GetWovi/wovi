/** Random tokens, hashes and constant-time compares. Node crypto only. */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** A URL-safe random token. 32 bytes is 256 bits. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** A lowercase id like `usr_3f9a...`, valid as a workspace id too. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

/** Six digits, leading zeros kept. */
export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
