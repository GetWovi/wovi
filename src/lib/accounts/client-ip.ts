/**
 * The client's address for rate limits, from the headers the proxy in front
 * of WOVI sets.
 *
 * X-Forwarded-For is a list: whatever the client sent first, then one
 * address per proxy, each added on the right. Only the entries the trusted
 * proxies added can be believed, so the client is the entry
 * WOVI_TRUSTED_PROXY_HOPS places from the right: with Railway's one edge
 * proxy (the default, 1) that is the last entry, the address the edge saw.
 * A client that sends its own X-Forwarded-For only adds entries further
 * left, which are never read.
 *
 *   WOVI_TRUSTED_PROXY_HOPS=1     proxies in front that each add one entry (default 1; Railway's edge)
 *   WOVI_TRUSTED_PROXY_HOPS=0     no proxy: forwarded headers are ignored, every request counts as one address
 *   WOVI_CLIENT_IP_HEADER=x-real-ip  read this one header instead, when the proxy sets it and replaces any the client sent
 */

type HeaderBag = { get(name: string): string | null };
type Env = Record<string, string | undefined>;

/** Addresses only: IPv4, IPv6, optionally with a port in brackets or after a colon. Anything else is not trusted. */
const ADDRESS = /^[0-9A-Fa-f:.[\]]{2,47}$/;

export function trustedHops(env: Env = process.env): number {
  const raw = env.WOVI_TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

export function clientIpFrom(headers: HeaderBag, env: Env = process.env): string {
  const clean = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return s && ADDRESS.test(s) ? s : null;
  };
  const one = env.WOVI_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (one) return clean(headers.get(one)) ?? "unknown";
  const hops = trustedHops(env);
  if (hops === 0) return "direct";
  const list = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return "local";
  return clean(list[Math.max(0, list.length - hops)]) ?? "unknown";
}
