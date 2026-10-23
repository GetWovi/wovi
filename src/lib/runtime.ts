/**
 * Where this process runs, decided once and the same way everywhere.
 *
 * A local app is one on this machine: not in production (`next dev`, tests,
 * scripts), or in production with WOVI_APP_URL on localhost. Only a local app
 * may use the dev helpers: the generated secret in .data/secret, the dev
 * mailer, test payments (free credits), the fake model provider, the fake
 * trend lookup, the fake x402 verifier and the fake clip reader.
 *
 * Production fails closed: with NODE_ENV=production and WOVI_APP_URL missing
 * the app cannot tell it is on localhost, so it counts as a server and every
 * dev helper stays off. The parts that need a setting refuse with a clear
 * message instead of falling back (productionProblems lists them at start).
 * Client-safe: no Node imports.
 */

export const LOCAL_APP_URL = "http://localhost:3900";

type Env = Record<string, string | undefined>;

const isLocalHost = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";

/** True when the app runs on this machine only, where dev secrets, the dev mailer, test payments and fakes are fine. */
export function isLocalApp(env: Env = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  // `next build` renders pages in production mode on the build machine, before any server runs; it never serves anyone.
  if (env.NEXT_PHASE === "phase-production-build") return true;
  const url = env.WOVI_APP_URL?.trim();
  if (!url) return false;
  try {
    return isLocalHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** A production server: in production and not on localhost. Dev helpers are never reachable here. */
export function isProductionServer(env: Env = process.env): boolean {
  return !isLocalApp(env);
}

export class ProductionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionConfigError";
  }
}

/**
 * The site's address, without a trailing slash. Local work falls back to
 * http://localhost:3900. A production server without WOVI_APP_URL throws, so
 * no link, redirect or webhook ever points at localhost by accident.
 */
export function appUrlFromEnv(env: Env = process.env): string {
  const url = env.WOVI_APP_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  if (env.NODE_ENV === "production" && env.NEXT_PHASE !== "phase-production-build") throw new ProductionConfigError("Set WOVI_APP_URL (the site's https address) before running in production.");
  return LOCAL_APP_URL;
}

/**
 * What a production server is missing, in plain words. Empty on a local app
 * and on a server with everything set. Logged once at start; each part
 * refuses on its own as well.
 */
export function productionProblems(env: Env = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const out: string[] = [];
  const url = env.WOVI_APP_URL?.trim();
  if (!url) out.push("WOVI_APP_URL is not set: sign-in links, payments and webhooks are off, and the app runs as a server with every dev helper off.");
  if (isLocalApp(env)) return out;
  if (!env.WOVI_SECRET?.trim()) out.push("WOVI_SECRET is not set: accounts and sign-in refuse to start.");
  if (!env.EMAIL_PROVIDER?.trim()) out.push("EMAIL_PROVIDER is not set: sign-in by email is off (no dev mailer on a server).");
  if (!env.OPENROUTER_API_KEY?.trim()) out.push("OPENROUTER_API_KEY is not set: agents cannot run (no fake model on a server).");
  return out;
}
