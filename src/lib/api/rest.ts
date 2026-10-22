/**
 * The REST API's HTTP side (phase 14): one function from a web Request to a
 * Response, so the Next.js route and the tests run the same code.
 *
 * Every request: the key from `Authorization: Bearer wovi_sk_...` (checked in
 * constant time against its hash), the per-key and per-workspace rate
 * limits, the body size limit, the route, then one call into PublicApi.
 * Errors come back in one shape (errors.ts). Keys are never logged: the only
 * thing logged is an internal error's id and message.
 */
import type { Accounts } from "@/lib/accounts/accounts";
import { ApiError, toApiError } from "./errors";
import { WindowCounter, type Hit } from "./limits";
import { openApiDocument } from "./openapi";
import { matchRoute } from "./routes";
import type { KeyCaller, PublicApi } from "./service";
import { randomBytes } from "node:crypto";

export const API_BASE = "/api/v1";

export type RestOptions = {
  api: PublicApi;
  accounts: Accounts;
  /** The site's address, for the OpenAPI document's server. */
  appUrl: string;
  now?: () => number;
  log?: (line: string) => void;
};

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}

/** The key from the Authorization header, or null. Never logged. */
export function bearerKey(headers: Headers): string | null {
  const h = headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  return m ? m[1] : null;
}

/** Reads a body up to `max` bytes. Too large is payload_too_large; not JSON is invalid_request. */
export async function readJsonBody(req: Request, max: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) throw new ApiError("payload_too_large", `The body is larger than ${Math.round(max / 1024)} KB.`);
  if (!req.body) return undefined;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError("payload_too_large", `The body is larger than ${Math.round(max / 1024)} KB.`);
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("invalid_request", "The body is not valid JSON.");
  }
}

export class RestApi {
  readonly counter: WindowCounter;
  private readonly log: (line: string) => void;

  constructor(private readonly o: RestOptions) {
    this.counter = new WindowCounter(o.now ?? Date.now);
    this.log = o.log ?? ((line) => console.error(line));
  }

  /**
   * The key behind a request, or an ApiError: unauthenticated without a live
   * key, rate_limited after too many bad keys from one address. Shared with MCP.
   */
  async authenticate(headers: Headers): Promise<KeyCaller> {
    const key = bearerKey(headers);
    if (!key) throw new ApiError("unauthenticated", "Send your API key as: Authorization: Bearer wovi_sk_...");
    const caller = await this.o.accounts.apiKeys.authenticate(key);
    if (!caller) {
      this.counter.hit(`bad:${clientIp(headers)}`, this.o.api.limits.badKeysPerIp, "Too many unknown keys from this address. Wait a little and try again.");
      throw new ApiError("unauthenticated", "That API key is not valid. It may have been revoked.");
    }
    return caller;
  }

  /** Counts a request against the key and its workspace. Returns the key's numbers for the headers. */
  limit(caller: KeyCaller, starts = false): Hit {
    const l = this.o.api.limits;
    const hit = this.counter.hit(`key:${caller.keyId}`, l.perKey);
    this.counter.hit(`ws:${caller.workspaceId}`, l.perWorkspace, "This workspace made too many requests. Wait a little and try again.");
    if (starts) this.limitStart(caller);
    return hit;
  }

  /** Counts one run or pipeline start against the key. */
  limitStart(caller: KeyCaller): void {
    this.counter.hit(`start:${caller.keyId}`, this.o.api.limits.startsPerKey, "This key started too many runs. Wait a little and try again.");
  }

  async handle(req: Request): Promise<Response> {
    const requestId = `req_${randomBytes(8).toString("hex")}`;
    const url = new URL(req.url);
    const path = url.pathname.startsWith(API_BASE) ? url.pathname.slice(API_BASE.length) : url.pathname;
    let rate: Hit | null = null;
    try {
      if (path === "/openapi.json" || path === "/openapi.json/") {
        if (req.method !== "GET") throw new ApiError("method_not_allowed", "Use GET.");
        return json(200, openApiDocument(this.o.appUrl), requestId, null, { "Access-Control-Allow-Origin": "*" });
      }
      const caller = await this.authenticate(req.headers);
      const found = matchRoute(req.method, path);
      if (!found) {
        rate = this.limit(caller);
        throw new ApiError("not_found", "No such endpoint. See /api/v1/openapi.json.");
      }
      if ("allow" in found) {
        rate = this.limit(caller);
        const res = json(405, new ApiError("method_not_allowed", `Use ${found.allow.join(" or ")}.`).toJSON(), requestId, rate);
        res.headers.set("Allow", found.allow.join(", "));
        return res;
      }
      const { route, params } = found;
      rate = this.limit(caller, route.starts);
      const body = req.method === "GET" || req.method === "DELETE" ? undefined : await readJsonBody(req, this.o.api.limits.maxBodyBytes);
      const result = await route.handle({ api: this.o.api, caller, params, query: url.searchParams, body, idempotencyKey: route.idempotent ? req.headers.get("idempotency-key") : null });
      const res = json(route.status, result, requestId, rate);
      if (route.status === 202 && result && typeof result === "object" && "id" in result) {
        res.headers.set("Location", `${API_BASE}${route.path.startsWith("/pipelines") ? "/pipeline-runs" : "/runs"}/${(result as { id: string }).id}`);
      }
      return res;
    } catch (err) {
      const e = toApiError(err);
      if (e.code === "internal_error") this.log(`[api] ${requestId} ${req.method} ${path}: ${err instanceof Error ? err.message : String(err)}`);
      const res = json(e.status, e.toJSON(), requestId, rate);
      if (e.retryAfterSec !== undefined) res.headers.set("Retry-After", String(e.retryAfterSec));
      if (e.code === "unauthenticated") res.headers.set("WWW-Authenticate", 'Bearer realm="wovi"');
      return res;
    }
  }
}

function json(status: number, body: unknown, requestId: string, rate: Hit | null, extra: Record<string, string> = {}): Response {
  const headers: Record<string, string> = { ...JSON_HEADERS, "X-Request-Id": requestId, ...extra };
  if (rate) {
    headers["RateLimit-Limit"] = String(rate.limit);
    headers["RateLimit-Remaining"] = String(rate.remaining);
    headers["RateLimit-Reset"] = String(rate.resetSec);
  }
  return new Response(JSON.stringify(body, null, 2), { status, headers });
}
