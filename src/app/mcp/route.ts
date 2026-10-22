/**
 * The MCP server, /mcp (phase 14): Streamable HTTP, stateless, with the same
 * API keys as the REST API. See docs/mcp.md.
 */
import { handleMcp } from "@/lib/api/mcp";
import { appPublicApi, appRest } from "@/lib/api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handle = (req: Request) => handleMcp(req, { rest: appRest(), api: appPublicApi() });

export { handle as GET, handle as POST, handle as DELETE };
