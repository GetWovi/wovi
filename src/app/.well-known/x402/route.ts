/**
 * /.well-known/x402 (phase 15): which endpoints take x402 payments and what
 * each call costs, the same as GET /api/v1/x402. No key. See docs/x402.md.
 */
import { appX402 } from "@/lib/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await appX402().discovery(), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
}
