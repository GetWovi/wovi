/**
 * The run queue. The engine only talks to the RunQueue interface, so a real
 * queue (Redis, a managed queue) can replace the in-process one later.
 *
 * InProcessQueue runs jobs in this process, oldest first, with a global limit
 * and a per-workspace limit, so one busy workspace cannot take every slot.
 * A job can wait until a time (retry backoff), and a running job gets an
 * AbortSignal that fires on cancel.
 */

export type QueueJob = {
  runId: string;
  workspaceId: string;
  /** Not started before this time (ms since epoch). */
  notBefore?: number;
};

export type JobHandler = (job: QueueJob, signal: AbortSignal) => Promise<void>;

export type ConcurrencyLimits = { global: number; perWorkspace: number };

export interface RunQueue {
  /** Sets the function that runs each job. Call once, before the first enqueue. */
  start(handler: JobHandler): void;
  enqueue(job: QueueJob): void;
  /** Takes a waiting job out, or aborts a running one. */
  cancel(runId: string): "removed" | "aborted" | "unknown";
  /** Resolves when nothing is waiting or running. */
  idle(): Promise<void>;
  stats(): { waiting: number; running: number };
}

export class InProcessQueue implements RunQueue {
  private handler: JobHandler | null = null;
  private waiting: QueueJob[] = [];
  private running = new Map<string, { workspaceId: string; controller: AbortController }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly limits: ConcurrencyLimits = { global: 4, perWorkspace: 2 },
    private readonly now: () => number = Date.now,
  ) {
    if (limits.global < 1 || limits.perWorkspace < 1) throw new Error("Concurrency limits must be at least 1.");
  }

  start(handler: JobHandler) {
    this.handler = handler;
    this.pump();
  }

  enqueue(job: QueueJob) {
    // A running job may queue its own retry; it starts only after the current attempt ends.
    if (this.waiting.some((j) => j.runId === job.runId)) return;
    this.waiting.push(job);
    this.pump();
  }

  cancel(runId: string): "removed" | "aborted" | "unknown" {
    const i = this.waiting.findIndex((j) => j.runId === runId);
    if (i !== -1) {
      this.waiting.splice(i, 1);
      this.settle();
      return "removed";
    }
    const r = this.running.get(runId);
    if (r) {
      r.controller.abort(new Error("cancelled"));
      return "aborted";
    }
    return "unknown";
  }

  idle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  stats() {
    return { waiting: this.waiting.length, running: this.running.size };
  }

  private isIdle() {
    return this.waiting.length === 0 && this.running.size === 0;
  }

  private settle() {
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((w) => w());
  }

  private runningIn(workspaceId: string) {
    let n = 0;
    for (const r of this.running.values()) if (r.workspaceId === workspaceId) n++;
    return n;
  }

  private pump() {
    if (!this.handler) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const now = this.now();
    while (this.running.size < this.limits.global) {
      const i = this.waiting.findIndex(
        (j) => (j.notBefore ?? 0) <= now && !this.running.has(j.runId) && this.runningIn(j.workspaceId) < this.limits.perWorkspace,
      );
      if (i === -1) break;
      const [job] = this.waiting.splice(i, 1);
      this.launch(job);
    }
    // Wake up for the earliest delayed job.
    const delayed = this.waiting.filter((j) => (j.notBefore ?? 0) > now);
    if (delayed.length && this.running.size < this.limits.global) {
      const next = Math.min(...delayed.map((j) => j.notBefore!));
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, next - now);
    }
  }

  private launch(job: QueueJob) {
    const controller = new AbortController();
    this.running.set(job.runId, { workspaceId: job.workspaceId, controller });
    this.handler!(job, controller.signal)
      .catch((err) => console.error(`Run ${job.runId} worker crashed:`, err))
      .finally(() => {
        this.running.delete(job.runId);
        this.pump();
        this.settle();
      });
  }
}
