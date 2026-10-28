import { notFound } from "next/navigation";
import type { Principal } from "@/lib/accounts/accounts";
import { readSession } from "@/lib/accounts/server";
import { appVideo, videoAllowed } from "@/lib/video/server";

/**
 * Where making a video is (voice, scenes, captions, done or failed), with the
 * whole video, for members of its workspace only. The storyboard polls it
 * while the video is made: a route, not a server action, so it never waits
 * behind another action in the queue.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const info = await readSession();
  if (!info || !videoAllowed(info.user)) notFound();
  const { id } = await params;
  const me: Principal = { kind: "user", userId: info.user.id };
  const video = await appVideo()
    .get(me, info.session.workspaceId, id)
    .catch(() => null);
  if (!video) notFound();
  return Response.json({ video, prices: appVideo().prices(video) }, { headers: { "cache-control": "no-store" } });
}
