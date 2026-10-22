/**
 * Runs once when the server starts. Phase 17: the $WOVI jobs (the keeper and
 * the holder checks), which start only when the burn pot is set
 * (src/lib/token/jobs.ts). Nothing else changes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.WOVI_BURN_POT_ADDRESS) return;
  const { startTokenJobs } = await import("./lib/token/jobs");
  startTokenJobs();
}
