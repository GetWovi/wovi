/**
 * CSRF protection for state-changing requests. Two checks, both required:
 *
 * 1. Same origin: the request's Origin header names this host. Browsers set
 *    it on every cross-site POST, so a form on another site fails here.
 * 2. A token tied to the session: HMAC(secret, session id). Pages put it in a
 *    hidden field (or an x-wovi-csrf header for fetch); a forged request from
 *    elsewhere cannot read it. It stays the same across token rotation and
 *    dies with the session.
 *
 * Next.js server actions also compare Origin and Host on their own; these
 * checks hold for route handlers too and do not depend on that.
 */
import { hmac, safeEqual } from "./crypto";

export const CSRF_FIELD = "csrf";
export const CSRF_HEADER = "x-wovi-csrf";

export function csrfTokenFor(secret: string, sessionId: string): string {
  return hmac(secret, `csrf:${sessionId}`);
}

export function checkCsrfToken(secret: string, sessionId: string, token: unknown): boolean {
  return typeof token === "string" && token.length === 64 && safeEqual(token, csrfTokenFor(secret, sessionId));
}

/** True when the Origin header is present and names the same host as the request. */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
