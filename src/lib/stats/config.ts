/**
 * The canary switch. WOVI_CANARY=on turns on canary releases: a live agent's
 * save goes out as a canary, runs are routed, the release panel shows and
 * publishing to everyone goes through the regression gate. Off by default:
 * a save reaches everyone at once, as before, and nothing is routed. Live
 * stats, feedback and the audit log record either way.
 */
export function canaryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.WOVI_CANARY ?? "").trim().toLowerCase() === "on";
}
