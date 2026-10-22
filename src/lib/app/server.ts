/**
 * The Next.js side of the app screens: one AppApi per server process on the
 * local stores, and the checks every page and action runs.
 */
import { join } from "node:path";
import { redirect } from "next/navigation";
import type { Principal } from "@/lib/accounts/accounts";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { accounts, actionSession, appAgents, appRuns, csrfFor, readSession, requireSession } from "@/lib/accounts/server";
import type { SessionInfo } from "@/lib/accounts/sessions";
import { appBrands } from "@/lib/brand/server";
import { AppApi } from "./api";
import { jsonFileAppStore } from "./store";

const g = globalThis as { __woviApp?: AppApi };

export function appApi(): AppApi {
  return (g.__woviApp ??= new AppApi({ accounts: accounts(), agents: appAgents(), runs: appRuns(), brands: appBrands(), store: jsonFileAppStore(join(dataDirFromEnv(), "app.json")) }));
}

export type AppContext = { info: SessionInfo; me: Principal; workspaceId: string; csrf: string; api: AppApi };

/** For pages: the signed-in person and their current workspace. Anyone else goes to sign in and comes back here. */
export async function appPage(next: string): Promise<AppContext> {
  const info = await requireSession(next);
  return context(info);
}

/** For pages that may show to anyone signed in, without a redirect: null when nobody is. */
export async function appPageOrNull(): Promise<AppContext | null> {
  const info = await readSession();
  return info ? context(info) : null;
}

/** For actions: origin, session and CSRF checks, in the session's current workspace. */
export async function appAction(csrf: FormData | string | null): Promise<AppContext> {
  return context(await actionSession(csrf));
}

function context(info: SessionInfo): AppContext {
  return { info, me: { kind: "user", userId: info.user.id }, workspaceId: info.session.workspaceId, csrf: csrfFor(info), api: appApi() };
}

/** Sends a person who has not set anything up yet into onboarding. */
export async function redirectToOnboarding(ctx: AppContext) {
  if (await ctx.api.needsOnboarding(ctx.me, ctx.workspaceId)) redirect("/app/welcome");
}
