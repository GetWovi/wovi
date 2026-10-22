import { notFound } from "next/navigation";
import type { Principal } from "@/lib/accounts/accounts";
import { readSession } from "@/lib/accounts/server";
import { appBrands } from "@/lib/brand/server";

/** Serves a mood board image back to members of its workspace only. Anyone else gets a 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ ws: string; id: string }> }) {
  const info = await readSession();
  if (!info) notFound();
  const { ws, id } = await params;
  const me: Principal = { kind: "user", userId: info.user.id };
  const file = await appBrands()
    .getFile(me, ws, id)
    .catch(() => null);
  if (!file || !file.meta.mimeType.startsWith("image/")) notFound();
  const safeName = file.meta.name.replace(/["\r\n]/g, "");
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.meta.mimeType,
      "content-length": String(file.bytes.byteLength),
      "content-disposition": `inline; filename="${safeName}"`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
