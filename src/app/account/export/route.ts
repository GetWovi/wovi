/**
 * "Download my data" (phase 18, GDPR Art. 15 and 20): everything WOVI holds
 * about the signed-in person, as one JSON file. Read only; the session cookie
 * decides whose data it is, and the answer is never cached.
 */
import { readSession } from "@/lib/accounts/server";
import { appPrivacy } from "@/lib/safety/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const info = await readSession();
  if (!info) return new Response("Sign in first.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  const data = await appPrivacy().export(info.user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="wovi-my-data-${day}.json"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
