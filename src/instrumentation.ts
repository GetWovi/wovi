/**
 * Runs once when the server starts. Phase 17: the $WOVI jobs (the keeper and
 * the holder checks), which start only when the burn pot is set
 * (src/lib/token/jobs.ts). Phase 18: the retention sweep for logs, once a
 * day, only when WOVI_RETENTION_SWEEP=on (src/lib/privacy/privacy.ts).
 * Clip samples: the queue that reads uploaded clips, so clips left unread by
 * a restart are picked up again; off with WOVI_CLIP_SAMPLES=off.
 * Stablecoin top-ups: the stablecoin's symbol and decimals read on chain and
 * checked once a receiving address is set (src/lib/chainpay/local.ts).
 * Production: the settings a server is missing, logged once (src/lib/runtime.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Production fails closed: say once, at start, which parts refuse to run and why (src/lib/runtime.ts).
  const { productionProblems } = await import("./lib/runtime");
  for (const problem of productionProblems()) console.error(`[wovi] ${problem}`);
  if ((process.env.WOVI_CLIP_SAMPLES ?? "on").trim().toLowerCase() !== "off") {
    const { startClipQueue } = await import("./lib/clips/local");
    void startClipQueue().catch((err) => console.error("Could not start the clip queue:", err));
  }
  if (process.env.WOVI_RETENTION_SWEEP === "on") {
    const { startRetentionSweep } = await import("./lib/privacy/jobs");
    startRetentionSweep();
  }
  if (process.env.WOVI_PAY_TO?.trim() || process.env.WOVI_X402_PAY_TO?.trim()) {
    const { checkStablecoinAtStart } = await import("./lib/chainpay/local");
    void checkStablecoinAtStart().catch((err) => console.error("Could not check the stablecoin:", (err as Error)?.name ?? "error"));
  }
  if (!process.env.WOVI_BURN_POT_ADDRESS) return;
  const { startTokenJobs } = await import("./lib/token/jobs");
  startTokenJobs();
}
