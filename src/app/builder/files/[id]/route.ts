import { notFound } from "next/navigation";
import { requireBuilder } from "@/lib/builder/server";

/** Serves a builder upload back to builders only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { builder, me } = await requireBuilder();
  const { id } = await params;
  const file = await builder.getFile(me, id);
  if (!file) notFound();
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
