/**
 * The Next.js side of pipelines: one GuardedPipelines per server process, on
 * the app's one run engine, so pipeline steps share the queue with every
 * other run. Pipeline runs left running by a previous process are driven
 * again on first use.
 */
import { accounts, appEngine } from "@/lib/accounts/server";
import type { GuardedPipelines } from "./guard";
import { localPipelines } from "./local";

const g = globalThis as { __woviPipelines?: GuardedPipelines };

export function appPipelines(): GuardedPipelines {
  if (!g.__woviPipelines) {
    g.__woviPipelines = localPipelines(accounts(), appEngine());
    void g.__woviPipelines.engine.recover().catch((err) => console.error("Could not recover pipeline runs:", err));
  }
  return g.__woviPipelines;
}
