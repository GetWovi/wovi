import { describe, expect, it } from "vitest";
import { InProcessQueue, type QueueJob } from "./queue";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tracker() {
  let now = 0;
  let max = 0;
  const perWs = new Map<string, number>();
  const maxPerWs = new Map<string, number>();
  const order: string[] = [];
  const handler = async (job: QueueJob, signal: AbortSignal) => {
    order.push(job.runId);
    now++;
    max = Math.max(max, now);
    perWs.set(job.workspaceId, (perWs.get(job.workspaceId) ?? 0) + 1);
    maxPerWs.set(job.workspaceId, Math.max(maxPerWs.get(job.workspaceId) ?? 0, perWs.get(job.workspaceId)!));
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 15);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
    });
    now--;
    perWs.set(job.workspaceId, perWs.get(job.workspaceId)! - 1);
  };
  return { handler, order, max: () => max, maxPerWs };
}

describe("in-process queue", () => {
  it("keeps to the global and per-workspace limits, oldest first", async () => {
    const q = new InProcessQueue({ global: 3, perWorkspace: 2 });
    const t = tracker();
    q.start(t.handler);
    for (let i = 0; i < 6; i++) q.enqueue({ runId: `a${i}`, workspaceId: "ws_a" });
    for (let i = 0; i < 3; i++) q.enqueue({ runId: `b${i}`, workspaceId: "ws_b" });
    await q.idle();
    expect(t.max()).toBe(3);
    expect(t.maxPerWs.get("ws_a")).toBe(2);
    expect(t.maxPerWs.get("ws_b")).toBeLessThanOrEqual(2);
    expect(t.order.slice(0, 3)).toEqual(["a0", "a1", "b0"]);
    expect(t.order).toHaveLength(9);
  });

  it("holds a job until its notBefore time", async () => {
    const q = new InProcessQueue({ global: 2, perWorkspace: 2 });
    const t = tracker();
    q.start(t.handler);
    const start = Date.now();
    q.enqueue({ runId: "later", workspaceId: "ws_a", notBefore: start + 40 });
    q.enqueue({ runId: "now", workspaceId: "ws_a" });
    await wait(5);
    expect(t.order).toEqual(["now"]);
    await q.idle();
    expect(t.order).toEqual(["now", "later"]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(39);
  });

  it("cancel removes a waiting job and aborts a running one", async () => {
    const q = new InProcessQueue({ global: 1, perWorkspace: 1 });
    const t = tracker();
    q.start(t.handler);
    q.enqueue({ runId: "one", workspaceId: "ws_a" });
    q.enqueue({ runId: "two", workspaceId: "ws_a" });
    expect(q.cancel("two")).toBe("removed");
    expect(q.cancel("one")).toBe("aborted");
    expect(q.cancel("nope")).toBe("unknown");
    await q.idle();
    expect(t.order).toEqual(["one"]);
    expect(q.stats()).toEqual({ waiting: 0, running: 0 });
  });

  it("does not queue the same waiting job twice", async () => {
    const q = new InProcessQueue({ global: 1, perWorkspace: 1 });
    const t = tracker();
    q.enqueue({ runId: "x", workspaceId: "ws_a" });
    q.enqueue({ runId: "x", workspaceId: "ws_a" });
    q.start(t.handler);
    await q.idle();
    expect(t.order).toEqual(["x"]);
  });
});
