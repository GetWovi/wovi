/**
 * The Next.js side of accounts: one Accounts instance per server process, the
 * session cookie, and the checks every state-changing server action runs.
 * Server code only (it reads request headers and cookies).
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { localRegistry } from "@/lib/agents/registry";
import { join } from "node:path";
import { localBrandBrains } from "@/lib/builder/local";
import { creditsEnabled, processCredits } from "@/lib/credits/local";
import { jsonFileBuilderStore } from "@/lib/builder/store";
import { sampleReferences } from "@/lib/quality/service";
import { localEngine, type RunEngine } from "@/lib/runs/engine";
import { localRouter } from "@/lib/stats/local";
import type { Accounts } from "./accounts";
import { CSRF_FIELD, checkCsrfToken, csrfTokenFor, sameOrigin } from "./csrf";
import { AccountError } from "./errors";
import { GuardedAgents, GuardedRuns } from "./guard";
import { dataDirFromEnv, localAccounts } from "./local";
import type { SessionInfo } from "./sessions";
import type { Session } from "./types";

const secure = process.env.NODE_ENV === "production";
/** `__Host-` pins the cookie to this host, over HTTPS, on every path. */
export const SESSION_COOKIE = secure ? "__Host-wovi_session" : "wovi_session";

const g = globalThis as { __wovi?: { accounts?: Accounts; agents?: GuardedAgents; engine?: RunEngine; runs?: GuardedRuns } };
const cache = (g.__wovi ??= {});

export function accounts(): Accounts {
  return (cache.accounts ??= localAccounts());
}

/** The registry as the app may use it: every call names its caller. */
export function appAgents(): GuardedAgents {
  return (cache.agents ??= new GuardedAgents(localRegistry(), accounts()));
}

/**
 * The one run engine of this process, with each agent's mood board next to
 * the Brand Brain. The builder's bench and the guarded runs share it, so
 * there is one queue. Runs left queued or running by a previous process are
 * picked up again on the first use.
 */
export function appEngine(): RunEngine {
  if (!cache.engine) {
    // The quality gate compares each draft with the agent's golden and bad samples from the builder (phase 12).
    // Credits (phase 13): every run holds its estimate and is charged at the end, unless WOVI_CREDITS=off.
    const billing = creditsEnabled() ? processCredits() : null;
    // Canary releases: runs that follow "latest stable" are routed by the releases in stats.json (docs/stats.md).
    cache.engine = localEngine({ brandBrains: localBrandBrains(), references: sampleReferences(jsonFileBuilderStore(join(dataDirFromEnv(), "builder.json")).samples), billing, router: localRouter(dataDirFromEnv()) });
    billing?.useHistory(cache.engine);
    void cache.engine.recover().catch((err) => console.error("Could not recover runs:", err));
  }
  return cache.engine;
}

/** The run engine as the app may use it: every call names its caller. */
export function appRuns(): GuardedRuns {
  return (cache.runs ??= new GuardedRuns(appEngine(), accounts()));
}

export async function requestMeta() {
  const h = await headers();
  // The first X-Forwarded-For hop is only trustworthy behind our own proxy; it is set there at deploy.
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return { ip, userAgent: h.get("user-agent"), origin: h.get("origin"), host: h.get("x-forwarded-host") ?? h.get("host") };
}

/** The signed-in session for a page. Never rotates: pages cannot set cookies. */
export async function readSession(): Promise<SessionInfo | null> {
  return accounts().sessions.get((await cookies()).get(SESSION_COOKIE)?.value);
}

/** The session, or a redirect to sign-in that comes back to `next`. */
export async function requireSession(next: string): Promise<SessionInfo> {
  const info = await readSession();
  if (!info) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return info;
}

export function csrfFor(info: SessionInfo): string {
  return csrfTokenFor(accounts().secret, info.session.id);
}

export async function setSessionCookie(token: string, session: Pick<Session, "expiresAt">) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires: new Date(session.expiresAt) });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
}

/** For actions before sign-in: the request must come from this site. */
export async function checkOrigin() {
  const { origin, host } = await requestMeta();
  if (!sameOrigin(origin, host)) throw new AccountError("forbidden", "This request came from another site.");
}

/**
 * For every state-changing action of a signed-in user: same origin, a live
 * session, and the session's CSRF token from the form (or passed in). Rotates
 * the session token when it is due and sets the new cookie.
 */
export async function actionSession(csrf: FormData | string | null): Promise<SessionInfo> {
  await checkOrigin();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const info = await accounts().sessions.get(token, { rotate: true });
  if (!info) throw new AccountError("unauthenticated", "Your session has ended. Sign in again.");
  const given = csrf instanceof FormData ? csrf.get(CSRF_FIELD) : csrf;
  if (!checkCsrfToken(accounts().secret, info.session.id, given)) {
    throw new AccountError("forbidden", "This form has expired. Reload the page and try again.");
  }
  if (info.newToken) await setSessionCookie(info.newToken, info.session);
  return info;
}
