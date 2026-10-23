import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { notFound } from "next/navigation";
import { requireBuilder } from "@/lib/builder/server";
import { appClips } from "@/lib/clips/server";

/** Streams a clip back to builders only, with byte ranges so the player can seek. Never read whole into memory. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { me } = await requireBuilder();
  const { id } = await params;
  const video = await appClips().videoPath(me, id);
  if (!video) notFound();
  const size = video.sizeBytes;
  const headers: Record<string, string> = {
    "content-type": video.mimeType,
    "accept-ranges": "bytes",
    "content-disposition": `inline; filename="${video.name.replace(/["\r\n]/g, "")}"`,
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    start = Math.max(0, start);
    const body = Readable.toWeb(createReadStream(video.path, { start, end })) as unknown as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(video.path)) as unknown as ReadableStream;
  return new Response(body, { headers: { ...headers, "content-length": String(size) } });
}
