/**
 * Limits for the REST API and MCP (phase 14): how many requests a key and a
 * whole workspace may make, how many runs a key may start, and how big a
 * body may be.
 *
 * The counters are fixed windows kept in memory, one set per server process,
 * so a busy API never writes to the account store on every request. With more
 * than one server they move to a shared store (Redis) behind the same class.
 */
import { ApiError } from "./errors";

export type Window = { max: number; windowMs: number };

export type ApiLimits = {
  /** Every request with one key. */
  perKey: Window;
  /** Every request in one workspace, all its keys together. */
  perWorkspace: Window;
  /** Runs and pipeline runs started with one key. */
  startsPerKey: Window;
  /** The largest request body, in bytes. */
  maxBodyBytes: number;
  /** Failed key checks from one address, so keys cannot be guessed. */
  badKeysPerIp: Window;
};

export const DEFAULT_API_LIMITS: ApiLimits = {
  perKey: { max: 120, windowMs: 60_000 },
  perWorkspace: { max: 300, windowMs: 60_000 },
  startsPerKey: { max: 30, windowMs: 60_000 },
  maxBodyBytes: 128 * 1024,
  badKeysPerIp: { max: 20, windowMs: 60_000 },
};

export type Hit = { limit: number; remaining: number; resetSec: number };

export class WindowCounter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Counts one hit against `key`. Throws rate_limited once the window is
   * full; otherwise returns what is left, for the RateLimit headers.
   */
  hit(key: string, w: Window, message = "Too many requests. Wait a little and try again."): Hit {
    const now = this.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + w.windowMs };
      this.buckets.set(key, b);
      if (this.buckets.size > 10_000) this.sweep(now);
    }
    const resetSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    if (b.count >= w.max) throw new ApiError("rate_limited", message, [], resetSec);
    b.count += 1;
    return { limit: w.max, remaining: w.max - b.count, resetSec };
  }

  private sweep(now: number) {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}
