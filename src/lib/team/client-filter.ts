/**
 * Working for one client: a view filter kept in a cookie, per workspace. It
 * narrows the review queue and History to that client's Brand Brains and
 * pre-picks the client's default brand in the agent and pipeline forms. It is
 * a convenience, not access control: members see every client anyway.
 */
import { cookies } from "next/headers";

export const CLIENT_COOKIE = "wovi_client";

/** The client picked for this workspace, or null for all. */
export async function readClientFilter(workspaceId: string): Promise<string | null> {
  const raw = (await cookies()).get(CLIENT_COOKIE)?.value ?? "";
  const [ws, id] = raw.split(":");
  return ws === workspaceId && id && /^cli_[a-f0-9]{20}$/.test(id) ? id : null;
}

export async function writeClientFilter(workspaceId: string, clientId: string | null) {
  const jar = await cookies();
  if (!clientId) jar.set(CLIENT_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  else jar.set(CLIENT_COOKIE, `${workspaceId}:${clientId}`, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 90 });
}
