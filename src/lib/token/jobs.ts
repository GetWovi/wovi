/**
 * SERVER ONLY. The in-process $WOVI jobs (phase 17), started once per server
 * from src/instrumentation.ts. With no burn pot set nothing starts, so the
 * site behaves exactly as before.
 *
 *   keeper   every WOVI_KEEPER_EVERY_MINUTES (15), when its key and both
 *            contracts are set and WOVI_KEEPER is not off (keeper.ts)
 *   holders  every hour: everyone's holder status again once it is
 *            WOVI_HOLDER_CHECK_HOURS old; this month's holder credits once the
 *            month has no snapshot yet (with tiers set); last month's holder
 *            credits written off
 *
 * One of each runs at a time. Every failure is logged with node addresses and
 * anything key-like scrubbed, and the next tick tries again.
 */
import { scrub } from "./chain";
import { keeperStatus } from "./config";
import { keeperOnce, markStopping, tokenServices } from "./local";

const g = globalThis as { __woviTokenJobs?: { timers: ReturnType<typeof setInterval>[] } };
const HOUR = 3600_000;

const log = (what: string, err: unknown) => console.error(`[wovi] ${what}: ${scrub(String((err as Error)?.message ?? err))}`);

/** The holders' hourly look. `force` reads everyone again now (the owner's button). */
export async function holdersTick(force = false): Promise<void> {
  const s = tokenServices();
  if (!s.config.holder.on) return;
  const sum = await s.holders.summary();
  const due = force || !sum.lastCheck || Date.now() - Date.parse(sum.lastCheck) >= s.config.holder.checkHours * HOUR;
  if (due) await s.holders.refreshAll();
  await s.holders.expire();
  await s.holders.allocate();
}

export function startTokenJobs(): { keeper: boolean; holders: boolean } {
  if (g.__woviTokenJobs) return { keeper: false, holders: false };
  const s = tokenServices();
  const c = s.config;
  g.__woviTokenJobs = { timers: [] };
  if (!c.pot) return { keeper: false, holders: false };
  process.once("SIGTERM", markStopping);
  process.once("SIGINT", markStopping);

  const keeperOn = keeperStatus(c).on;
  if (keeperOn) {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await keeperOnce(s);
        if (r.done === "error") console.error(`[wovi] keeper: ${r.reason}`);
        else if (r.done === "ran" && (r.sweep || r.burn)) console.log(`[wovi] keeper: sent ${[r.sweep && `a sweep (${r.sweep.tx})`, r.burn && `a burn (${r.burn.tx})`].filter(Boolean).join(" and ")}`);
        else if (r.done === "refused") console.warn(`[wovi] keeper: ${r.reason}`);
      } catch (err) {
        log("keeper", err);
      } finally {
        busy = false;
      }
    };
    const first = setTimeout(tick, 30_000);
    first.unref?.();
    const t = setInterval(tick, c.keeper.everyMinutes * 60_000);
    t.unref?.();
    g.__woviTokenJobs.timers.push(t);
  }

  let busy = false;
  const holders = async () => {
    if (busy) return;
    busy = true;
    try {
      await holdersTick();
    } catch (err) {
      log("holders", err);
    } finally {
      busy = false;
    }
  };
  const first = setTimeout(holders, 45_000);
  first.unref?.();
  const t = setInterval(holders, HOUR);
  t.unref?.();
  g.__woviTokenJobs.timers.push(t);
  console.log(`[wovi] $WOVI jobs: keeper ${keeperOn ? `on, every ${c.keeper.everyMinutes} minutes` : "off"}; holder checks on${c.holder.tiers.length ? ", holder credits on" : ""}`);
  return { keeper: keeperOn, holders: true };
}
