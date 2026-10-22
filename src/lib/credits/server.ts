/**
 * The Next.js side of credits: one GuardedCredits per server process, on the
 * same credits service the app's run engine bills through.
 */
import { accounts, appEngine } from "@/lib/accounts/server";
import { GuardedCredits } from "./guard";
import { processCredits } from "./local";

const g = globalThis as { __woviGuardedCredits?: GuardedCredits };

export function appCredits(): GuardedCredits {
  if (!g.__woviGuardedCredits) {
    const credits = processCredits();
    // The engine gives the estimates its run history; make sure it exists.
    credits.useHistory(appEngine());
    g.__woviGuardedCredits = new GuardedCredits(credits, accounts());
  }
  return g.__woviGuardedCredits;
}
