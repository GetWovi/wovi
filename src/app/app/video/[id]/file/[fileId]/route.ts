import { notFound } from "next/navigation";
import type { Principal } from "@/lib/accounts/accounts";
import { readSession } from "@/lib/accounts/server";
import { appVideo, videoAllowed } from "@/lib/video/server";

/**
 * A video's pictures and the video itself, for members of its workspace only.
 * Byte ranges are answered, because Safari on a phone only plays a video that
 * way. `?download=1` saves it instead of playing it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const info = await readSession();
  if (!info || !videoAllowed(info.user)) notFound();
  const { id, fileId } = await params;
  const me: Principal = { kind: "user", userId: info.user.id };
  const file = await appVideo()
    .file(me, info.session.workspaceId, id, fileId)
    .catch(() => null);
  if (!file) notFound();
  const type = file.meta.mimeType;
  if (!type.startsWith("image/") && !["video/mp4", "video/quicktime", "video/webm"].includes(type)) notFound();
  const size = file.bytes.byteLength;
  const name = file.meta.name.replace(/["\r\n]/g, "");
  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(Buffer.from(file.bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(Buffer.from(file.bytes), { headers: { ...headers, "content-length": String(size) } });
}
