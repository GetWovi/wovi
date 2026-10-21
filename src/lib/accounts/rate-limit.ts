/**
 * Fixed-window counters kept in the account store, so limits hold across
 * restarts and, with a shared database, across servers.
 */
import { AccountError } from "./errors";
import type { Collection } from "./store";
import type { RateBucket } from "./types";

export type Limit = { max: number; windowMs: number };

export class RateLimiter {
  constructor(
    private readonly buckets: Collection<RateBucket>,
    private readonly now: () => Date,
  ) {}

  /** Counts one hit. Throws rate_limited once the window is full. */
  async hit(key: string, limit: Limit, message = "Too many tries. Wait a little and try again."): Promise<void> {
    const now = this.now().getTime();
    const row = await this.buckets.get(key);
    if (!row || Date.parse(row.resetAt) <= now) {
      const fresh: RateBucket = { id: key, count: 1, resetAt: new Date(now + limit.windowMs).toISOString() };
      if (row) await this.buckets.update(fresh);
      else await this.buckets.insert(fresh).catch(() => this.buckets.update(fresh));
      return;
    }
    if (row.count >= limit.max) {
      throw new AccountError("rate_limited", message, Math.ceil((Date.parse(row.resetAt) - now) / 1000));
    }
    await this.buckets.update({ ...row, count: row.count + 1 });
  }

  /** Clears a key, for example after a successful sign-in. */
  async reset(key: string): Promise<void> {
    await this.buckets.delete(key);
  }
}
