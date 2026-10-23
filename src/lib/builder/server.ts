/**
 * The Next.js side of the builder: one Builder per process, and the guard
 * every builder page and action runs. A page for anyone who is not a builder
 * is a 404, the same as a page that does not exist.
 */
import { notFound } from "next/navigation";
import type { Principal } from "@/lib/accounts/accounts";
import { accounts, actionSession, appEngine, csrfFor, readSession } from "@/lib/accounts/server";
import type { SessionInfo } from "@/lib/accounts/sessions";
import type { User } from "@/lib/accounts/types";
import type { Builder } from "./builder";
import { localBuilder } from "./local";
import { appReleases } from "@/lib/stats/server";

const g = globalThis as { __woviBuilder?: Builder };

export function appBuilder(): Builder {
  // Canary releases and the audit log (docs/stats.md) come with the builder of the app.
  return (g.__woviBuilder ??= localBuilder(accounts(), undefined, appEngine(), appReleases()));
}

export type BuilderContext = { info: SessionInfo; user: User; me: Principal; csrf: string; builder: Builder };

/** For pages: the signed-in builder, or a 404 for everyone else. */
export async function requireBuilder(): Promise<BuilderContext> {
  const info = await readSession();
  if (!info) notFound();
  const me: Principal = { kind: "user", userId: info.user.id };
  const builder = appBuilder();
  const user = await builder.builderFor(me);
  if (!user) notFound();
  return { info, user, me, csrf: csrfFor(info), builder };
}

/** For actions: origin, session and CSRF checks, then the builder check. Throws not_found for non-builders. */
export async function builderAction(csrf: FormData | string | null): Promise<BuilderContext> {
  const info = await actionSession(csrf);
  const me: Principal = { kind: "user", userId: info.user.id };
  const builder = appBuilder();
  const user = await builder.requireBuilder(me);
  return { info, user, me, csrf: csrfFor(info), builder };
}
