/**
 * Runs once when the server starts. Phase 17: the $WOVI jobs (the keeper and
 * the holder checks), which start only when the burn pot is set
 * (src/lib/token/jobs.ts). Phase 18: the retention sweep for logs, once a
 * day, only when WOVI_RETENTION_SWEEP=on (src/lib/privacy/privacy.ts).
 * Clip samples: the queue that reads uploaded clips, so clips left unread by
 * a restart are picked up again; off with WOVI_CLIP_SAMPLES=off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.WOVI_CLIP_SAMPLES ?? "on").trim().toLowerCase() !== "off") {
    const { startClipQueue } = await import("./lib/clips/local");
    void startClipQueue().catch((err) => console.error("Could not start the clip queue:", err));
  }
  if (process.env.WOVI_RETENTION_SWEEP === "on") {
    const { startRetentionSweep } = await import("./lib/privacy/jobs");
    startRetentionSweep();
  }
  if (!process.env.WOVI_BURN_POT_ADDRESS) return;
  const { startTokenJobs } = await import("./lib/token/jobs");
  startTokenJobs();
}
