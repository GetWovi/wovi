/**
 * x402 over HTTP (phase 15): the part of /api/v1 that needs no API key.
 *
 *   POST /agents/{id}/runs, POST /pipelines/{id}/runs  with no Authorization:
 *        no X-PAYMENT      402 with the quote (x402 v1 body)
 *        a good X-PAYMENT  202 with the run, X-PAYMENT-RESPONSE and X-Receipt-Token
 *        a bad one         402 with the reason and a quote to pay
 *   GET  /x402                                  which endpoints take x402, and the prices
 *   GET  /x402/runs/{id}, POST .../cancel       a paid run, with its receipt token
 *   GET  /x402/pipeline-runs/{id}, POST .../pick, POST .../cancel
 *   POST /x402/dev/transfers                    the fake verifier's pretend wallet (local only)
 *
 * With x402 off, an unauthenticated start is not ours: the API answers 401
 * as before. Calls with an API key never come here.
 */
import { ApiError, toApiError } from "@/lib/api/errors";
import { clientIp, readJsonBody } from "@/lib/api/rest";
import { X402_VERSION } from "./config";
import { PAYMENT_RESPONSE_HEADER, RECEIPT_HEADER, encodeSettleResponse } from "./protocol";
import { X402Error, X402_CALLER, type Kind, type X402 } from "./service";
import type { PaymentRequiredBody, Quote, SettleResponse, X402ErrorCode } from "./types";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const EXPOSE = { "Access-Control-Expose-Headers": `${PAYMENT_RESPONSE_HEADER}, ${RECEIPT_HEADER}, Location, Retry-After` };
const START = /^\/(agents|pipelines)\/([A-Za-z0-9_.-]{1,100})\/runs\/?$/;
const ID = "([A-Za-z0-9_.-]{1,100})";

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { ...JSON_HEADERS, ...EXPOSE, ...extra } });
}

function errorResponse(err: unknown, log: (line: string) => void, extra: Record<string, string> = {}): Response {
  const e = toApiError(err);
  if (e.code === "internal_error") log(`[x402] ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  const headers: Record<string, string> = { ...extra };
  if (e.retryAfterSec !== undefined) headers["Retry-After"] = String(e.retryAfterSec);
  return json(e.status, e.toJSON(), headers);
}

export class X402Http {
  private readonly log: (line: string) => void;

  constructor(
    private readonly x402: X402,
    private readonly o: { appUrl: string; maxBodyBytes: number; log?: (line: string) => void },
  ) {
    this.log = o.log ?? ((line) => console.error(line));
  }

  /** The answer for x402's part of the API, or null when the request is not ours. `path` is under /api/v1. */
  async handle(req: Request, path: string): Promise<Response | null> {
    if (path === "/x402" || path === "/x402/" || path.startsWith("/x402/")) return this.own(req, path);
    if (req.method !== "POST" || req.headers.has("authorization")) return null;
    const m = START.exec(path);
    if (!m || !this.x402.on) return null;
    return this.start(req, m[1] === "agents" ? "run" : "pipeline", m[1], m[2]);
  }

  private paymentRequired(q: Quote | null, url: string, error: string, code: X402ErrorCode, o: { settle?: SettleResponse; retry?: boolean } = {}): Response {
    const body: PaymentRequiredBody = { x402Version: X402_VERSION, error, code, accepts: q ? this.x402.requirements(q, url) : [] };
    const headers: Record<string, string> = {};
    if (o.settle) headers[PAYMENT_RESPONSE_HEADER] = encodeSettleResponse(o.settle);
    if (o.retry) headers["Retry-After"] = "5";
    return json(402, body, headers);
  }

  private async start(req: Request, kind: Kind, segment: string, target: string): Promise<Response> {
    const ip = clientIp(req.headers);
    const resource = `POST /api/v1/${segment}/${target}/runs`;
    const url = `${this.o.appUrl.replace(/\/$/, "")}/api/v1/${segment}/${target}/runs`;
    let body: unknown;
    try {
      body = (await readJsonBody(req, this.o.maxBodyBytes)) ?? {};
      const header = req.headers.get("x-payment");
      if (!header) {
        const q = await this.x402.quote(kind, target, body, resource, ip);
        return this.paymentRequired(q, url, "X-PAYMENT header is required. Pay one of the quotes in accepts, then send this request again with X-PAYMENT.", "payment_required");
      }
      const r = await this.x402.pay(kind, target, body, header, resource, ip);
      const settle = { [PAYMENT_RESPONSE_HEADER]: encodeSettleResponse(r.settle) };
      if (!r.ok) return errorResponse(r.error, this.log, settle);
      const where = `/api/v1/x402/${kind === "run" ? "runs" : "pipeline-runs"}/${r.view.id}`;
      return json(r.status, r.view, { ...settle, [RECEIPT_HEADER]: r.receipt, Location: where });
    } catch (err) {
      if (!(err instanceof X402Error)) return errorResponse(err, this.log);
      // A payment problem: say why, and offer a quote (the same one when trying again later makes sense).
      let q = err.o.quote ?? null;
      if (!q) q = await this.x402.quote(kind, target, body, resource, ip).catch(() => null);
      return this.paymentRequired(q, url, err.message, err.code, { settle: err.o.settle, retry: err.o.retry });
    }
  }

  private async own(req: Request, path: string): Promise<Response> {
    const ip = clientIp(req.headers);
    const p = path.replace(/\/$/, "");
    try {
      if (p === "/x402") {
        if (req.method !== "GET") return this.notAllowed("GET");
        return json(200, await this.x402.discovery(), { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" });
      }
      if (p === "/x402/dev/transfers") {
        if (req.method !== "POST") return this.notAllowed("POST");
        const b = ((await readJsonBody(req, 4096)) ?? {}) as Record<string, unknown>;
        return json(201, await this.x402.fakeTransfer({ from: String(b.from ?? ""), amount: String(b.amount ?? ""), ...(typeof b.to === "string" ? { to: b.to } : {}), ...(typeof b.asset === "string" ? { asset: b.asset } : {}) }));
      }
      const token = bearer(req.headers) ?? req.headers.get(RECEIPT_HEADER.toLowerCase());
      const api = this.x402.o.api;
      let m = new RegExp(`^/x402/runs/${ID}(/cancel)?$`).exec(p);
      if (m) {
        const want = m[2] ? "POST" : "GET";
        if (req.method !== want) return this.notAllowed(want);
        const pay = await this.x402.receipt(token, "run", m[1], ip);
        const run = m[2] ? await api.cancelRun(X402_CALLER, m[1]) : await api.getRun(X402_CALLER, m[1]);
        if (m[2]) await this.x402.settleById(pay.id);
        return json(200, { run, payment: await this.x402.paymentView((await this.x402.o.store.payments.get(pay.id)) ?? pay) });
      }
      m = new RegExp(`^/x402/pipeline-runs/${ID}(/pick|/cancel)?$`).exec(p);
      if (m) {
        const want = m[2] ? "POST" : "GET";
        if (req.method !== want) return this.notAllowed(want);
        const pay = await this.x402.receipt(token, "pipeline", m[1], ip);
        let pipelineRun;
        if (m[2] === "/pick") pipelineRun = await api.pick(X402_CALLER, m[1], await readJsonBody(req, 4096));
        else if (m[2] === "/cancel") pipelineRun = await api.cancelPipelineRun(X402_CALLER, m[1]);
        else pipelineRun = await api.getPipelineRun(X402_CALLER, m[1]);
        if (m[2] === "/cancel") await this.x402.settleById(pay.id);
        return json(200, { pipelineRun, payment: await this.x402.paymentView((await this.x402.o.store.payments.get(pay.id)) ?? pay) });
      }
      throw new ApiError("not_found", "No such endpoint. See /api/v1/x402.");
    } catch (err) {
      return errorResponse(err, this.log);
    }
  }

  private notAllowed(allow: string): Response {
    return json(405, new ApiError("method_not_allowed", `Use ${allow}.`).toJSON(), { Allow: allow });
  }
}

function bearer(headers: Headers): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(headers.get("authorization") ?? "");
  return m ? m[1] : null;
}
