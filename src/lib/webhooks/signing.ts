/**
 * Signing webhook deliveries, and sealing the signing secrets at rest.
 *
 * Every delivery carries `Wovi-Signature: t=<unix seconds>,v1=<hex>`, where
 * the hex is HMAC-SHA256 of `<t>.<body>` with the endpoint's secret. A
 * receiver recomputes it, compares in constant time, and refuses a `t` that
 * is too old, so a captured delivery cannot be replayed later.
 *
 * The secret has to be read back to sign, so it cannot be stored as a hash
 * like API keys. It is sealed with AES-256-GCM under a key made from the
 * server secret, and shown to a person once, when it is made.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { randomToken, safeEqual } from "@/lib/accounts/crypto";

export const SECRET_PREFIX = "whsec_";
export const SIGNATURE_HEADER = "Wovi-Signature";
/** How old a signature may be before a receiver should refuse it. */
export const DEFAULT_TOLERANCE_SEC = 300;

export function newSigningSecret(): string {
  return `${SECRET_PREFIX}${randomToken(24)}`;
}

export function secretHint(secret: string): string {
  return `${SECRET_PREFIX}...${secret.slice(-4)}`;
}

/** `t=<seconds>,v1=<hex>` for a body. */
export function signatureHeader(secret: string, body: string, unixSeconds: number): string {
  const v1 = createHmac("sha256", secret).update(`${unixSeconds}.${body}`).digest("hex");
  return `t=${unixSeconds},v1=${v1}`;
}

/**
 * What a receiver runs: true when the header was made with this secret for
 * this exact body, within the tolerance. Constant-time compare.
 */
export function verifySignature(secret: string, header: string | null | undefined, body: string, nowSeconds: number, toleranceSec = DEFAULT_TOLERANCE_SEC): boolean {
  if (typeof header !== "string") return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || typeof parts.v1 !== "string") return false;
  if (Math.abs(nowSeconds - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return safeEqual(expected, parts.v1);
}

const sealKey = (serverSecret: string) => createHash("sha256").update(`wovi-webhook-secrets:${serverSecret}`).digest();

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>`, base64url. */
export function sealSecret(serverSecret: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(serverSecret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function openSecret(serverSecret: string, sealed: string): string {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unknown sealed secret format.");
  const decipher = createDecipheriv("aes-256-gcm", sealKey(serverSecret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
