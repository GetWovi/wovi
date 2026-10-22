/**
 * The Next.js side of Brand Brains: one instance per server process, and the
 * session checks every page and action runs.
 */
import type { Principal } from "@/lib/accounts/accounts";
import { accounts, actionSession, csrfFor, requireSession } from "@/lib/accounts/server";
import type { BrandBrains } from "./brains";
import { localBrands } from "./local";

const g = globalThis as { __woviBrands?: BrandBrains };

export function appBrands(): BrandBrains {
  return (g.__woviBrands ??= localBrands(accounts()));
}

/** For pages: the signed-in person, their current workspace and its role. Sends anyone else to sign in. */
export async function brandPage(next: string) {
  const info = await requireSession(next);
  const me: Principal = { kind: "user", userId: info.user.id };
  const workspaceId = info.session.workspaceId;
  const role = await accounts().roleIn(me, workspaceId);
  return { info, me, workspaceId, role, csrf: csrfFor(info), brands: appBrands() };
}

/** For actions: origin, session and CSRF checks, in the session's current workspace. */
export async function brandAction(csrf: string) {
  const info = await actionSession(csrf);
  const me: Principal = { kind: "user", userId: info.user.id };
  return { info, me, workspaceId: info.session.workspaceId, brands: appBrands() };
}
