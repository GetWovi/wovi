/**
 * The REST API, /api/v1 (phase 14). Everything happens in RestApi; this
 * file only hands it the request. See docs/api.md.
 */
import { appRest } from "@/lib/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handle = (req: Request) => appRest().handle(req);

export { handle as GET, handle as POST, handle as PUT, handle as DELETE, handle as PATCH };
