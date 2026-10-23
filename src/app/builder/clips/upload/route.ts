import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { AccountError } from "@/lib/accounts/errors";
import { builderAction } from "@/lib/builder/server";
import { appClips } from "@/lib/clips/server";

/**
 * One clip per request, as the raw body (not a form), so it streams straight
 * to disk with the size limit and is never held whole in memory. The browser
 * sends it with XMLHttpRequest for the progress bar:
 *
 *   POST /builder/clips/upload
 *   content-type: video/mp4
 *   x-wovi-csrf: <the page's token>
 *   x-file-name: <encodeURIComponent(name)>
 *   x-file-size: <bytes>
 *   x-wovi-rights: yes
 *
 * Builders only; a 404 for everyone else, like every builder page.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  try {
    const { me } = await builderAction(req.headers.get("x-wovi-csrf"));
    if (!req.body) return json(400, { ok: false, error: "Pick a clip first." });
    let name = "clip";
    try {
      name = decodeURIComponent(req.headers.get("x-file-name") ?? "clip");
    } catch {
      name = "clip";
    }
    const declared = Number(req.headers.get("x-file-size") ?? req.headers.get("content-length") ?? "0");
    const clip = await appClips().upload(me, {
      name,
      mimeType: req.headers.get("content-type") ?? "",
      sizeBytes: Number.isFinite(declared) && declared > 0 ? declared : 1,
      stream: Readable.fromWeb(req.body as unknown as NodeReadableStream<Uint8Array>),
      rights: req.headers.get("x-wovi-rights") === "yes",
    });
    return json(200, { ok: true, clip: { id: clip.id, name: clip.file.name, status: clip.status, durationSec: clip.probe?.durationSec ?? null } });
  } catch (err) {
    // The route and the library can sit in different server chunks, so the class is checked by name too.
    if (err instanceof AccountError || (err instanceof Error && err.name === "AccountError" && "code" in err)) {
      const e = err as AccountError;
      const status = e.code === "not_found" ? 404 : e.code === "unauthenticated" ? 401 : e.code === "forbidden" ? 403 : 400;
      return json(status, { ok: false, error: status === 404 ? "Not found." : e.message });
    }
    console.error("Clip upload failed:", err);
    return json(500, { ok: false, error: "The upload stopped on the server. Try again." });
  }
}
