/**
 * x402: pay per call with no account (phase 15).
 *
 * An unauthenticated call to start a run or a pipeline run gets a 402 with a
 * price quote: the run's estimate in credits (the same pricing as credits,
 * one credit = $0.01), in each accepted asset, a nonce and an expiry. The
 * caller pays on chain, then sends the same request again with X-PAYMENT:
 * the quote's nonce, the transaction hash, and the paying wallet's signature
 * of both. The payment is checked through a PaymentVerifier, the quote and
 * the transaction are used up, the quote lands as credits in the x402
 * workspace and the run starts there, recording its payer.
 *
 * The run settles like any other: it holds the quote and is charged its real
 * price, never more. When it ends, what it did not use leaves the workspace
 * again, and the payer is owed it back: always after a failure or a stop, and
 * after a success from `refundUnusedFromCredits` up. Owed refunds are records
 * for the owner to pay from their own wallet; nothing is ever sent from here.
 *
 * The answer carries X-PAYMENT-RESPONSE and a receipt token that reads (and
 * stops, or picks in) that one run.
 */
import { randomBytes } from "node:crypto";
import { recoverMessageAddress } from "viem";
import type { Accounts } from "@/lib/accounts/accounts";
import { ApiError, toApiError } from "@/lib/api/errors";
import { WindowCounter, type Window } from "@/lib/api/limits";
import { StartPipelineBody, StartRunBody, type ApiPipelineRun, type ApiRun } from "@/lib/api/schemas";
import { parseBody, type KeyCaller, type PublicApi } from "@/lib/api/service";
import type { Credits } from "@/lib/credits/credits";
import type { PipelineEngine } from "@/lib/pipelines/engine";
import type { PipelineRun } from "@/lib/pipelines/run";
import type { RunEngine } from "@/lib/runs/engine";
import { validateRunInputs } from "@/lib/runs/inputs";
import type { Run } from "@/lib/runs/run";
import { X402_SCHEME, X402_USER_ID, X402_VERSION, X402_WORKSPACE_ID, priced, sameAddress, x402Status, type X402Asset, type X402Config, type X402Status } from "./config";
import { atomicForUsd, creditsForAmount, unitsWords, usdMicroForCredits, usdToScaled, usdWords, usedAmount } from "./money";
import { PaymentHeaderError, bodyHash, decodePaymentHeader, isTxHash, sha256, signMessage, signTemplate } from "./protocol";
import type { X402Store } from "./store";
import type { OwedRefund, Payment, PaymentRequirements, Quote, RefundReason, SettleResponse, X402ErrorCode } from "./types";
import { fakeTxId, type PaymentVerifier } from "./verifier";

/** Who an x402 run is started as: a key-like caller in the x402 workspace that may run agents and nothing more. */
export const X402_CALLER: KeyCaller = { kind: "api_key", keyId: "x402", userId: X402_USER_ID, workspaceId: X402_WORKSPACE_ID, role: "editor" };

/** A payment problem: answered with a 402 and a quote to pay (the same one when `retry`). */
export class X402Error extends Error {
  constructor(
    readonly code: X402ErrorCode,
    message: string,
    readonly o: { retry?: boolean; quote?: Quote | null; settle?: SettleResponse } = {},
  ) {
    super(message);
    this.name = "X402Error";
  }
}

export type Kind = "run" | "pipeline";

/** What a paid call answers. */
export type PaidResult =
  | { ok: true; status: 200 | 202; kind: Kind; view: ApiRun | ApiPipelineRun; settle: SettleResponse; receipt: string; payment: Payment }
  /** Paid, but the run could not start: the error, and the payment recorded as owed back. */
  | { ok: false; error: ApiError; settle: SettleResponse; payment: Payment };

/** What a payer sees of their payment. */
export type PaymentView = {
  id: string;
  status: Payment["status"];
  payer: string;
  network: string;
  transaction: string;
  asset: string;
  symbol: string;
  paid: string;
  required: string;
  credits: number;
  charged: number | null;
  refund: { amount: string; status: OwedRefund["status"]; reason: RefundReason } | null;
  test: boolean;
};

export type X402Options = {
  cfg: X402Config;
  /** Whether the app runs on this machine: the fake verifier works only then. */
  local: boolean;
  /** Null: x402 is off, whatever else is set. */
  verifier: PaymentVerifier | null;
  store: X402Store;
  accounts: Accounts;
  api: PublicApi;
  /** The raw credits service: the ledger of the x402 workspace. */
  credits: Credits;
  engine: RunEngine;
  pipelines?: PipelineEngine;
  appUrl: string;
  /** A Chainlink feed's price, scaled to 8 decimals. Only for assets priced by a feed. */
  readFeed?: (feed: string, maxAgeSec: number) => Promise<bigint | null>;
  now?: () => number;
  log?: (line: string) => void;
};

const DAY = 86_400_000;

export class X402 {
  readonly cfg: X402Config;
  readonly counter: WindowCounter;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly work = new Set<Promise<unknown>>();
  private ready: Promise<void> | null = null;

  constructor(readonly o: X402Options) {
    this.cfg = o.cfg;
    this.now = o.now ?? Date.now;
    this.log = o.log ?? ((line) => console.error(line));
    this.counter = new WindowCounter(this.now);
  }

  /* ---------- State ---------- */

  status(): X402Status {
    const s = x402Status(this.cfg, this.o.local);
    if (s.on && !this.o.verifier) return { ...s, on: false, missing: ["No verifier is set up for these settings."] };
    return s;
  }

  get on(): boolean {
    return this.status().on;
  }

  get test(): boolean {
    return this.o.verifier?.test ?? false;
  }

  private iso(ms = this.now()) {
    return new Date(ms).toISOString();
  }

  /** The x402 workspace and the account its runs count toward. Made once, safe to call again. */
  setup(): Promise<void> {
    return (this.ready ??= (async () => {
      const s = this.o.accounts.store;
      const at = this.iso();
      if (!(await s.workspaces.get(X402_WORKSPACE_ID))) {
        await s.workspaces.insert({ id: X402_WORKSPACE_ID, name: "x402 payments", personal: false, plan: "free", createdBy: null, createdAt: at, updatedAt: at }).catch(() => undefined);
      }
      if (!(await s.users.get(X402_USER_ID))) {
        await s.users.insert({ id: X402_USER_ID, email: null, name: "x402 payer", builder: false, personalWorkspaceId: X402_WORKSPACE_ID, createdAt: at, updatedAt: at }).catch(() => undefined);
      }
    })().catch((err) => {
      this.ready = null;
      throw err;
    }));
  }

  /** Runs `fn` alone for one key: one paid try per quote at a time, one settle per payment. */
  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const before = this.locks.get(key) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(fn);
    this.locks.set(key, mine);
    return mine.finally(() => {
      if (this.locks.get(key) === mine) this.locks.delete(key);
    });
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.work.add(p);
    void p.finally(() => this.work.delete(p)).catch(() => undefined);
    return p;
  }

  /** Resolves when no settle is in flight. For tests. */
  async idle(): Promise<void> {
    while (this.work.size) await Promise.allSettled([...this.work]);
  }

  hit(key: string, w: Window, message: string) {
    this.counter.hit(key, w, message);
  }

  /* ---------- What a call costs ---------- */

  /** Checks the request as the run would, before anyone pays for it, and finds its estimate. */
  private async prepare(kind: Kind, target: string, rawBody: unknown): Promise<{ name: string; credits: number }> {
    await this.setup();
    const app = this.o.api.o.app;
    const ws = X402_WORKSPACE_ID;
    const issuesOf = (errors: string[]) =>
      errors.map((e) => {
        const i = e.indexOf(": ");
        return i > 0 && !e.slice(0, i).includes(" ") ? { path: `inputs.${e.slice(0, i)}`, message: e.slice(i + 2) } : { path: "inputs", message: e };
      });
    const noBrain = (b: { brandBrainId?: string }) => {
      if (b.brandBrainId) throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "brandBrainId", message: "Calls paid with x402 have no workspace, so no Brand Brain. Leave it out." }]);
    };
    if (kind === "run") {
      const body = parseBody(StartRunBody, rawBody);
      noBrain(body);
      const found = await app.agent(X402_CALLER, ws, target);
      if (!found) throw new ApiError("not_found", `No agent "${target}" can be paid for with x402.`);
      const v = validateRunInputs(found.spec, body.inputs);
      if (!v.ok) throw new ApiError("invalid_input", "Some inputs need a look.", issuesOf(v.errors));
      const estimate = await this.o.credits.estimateById(found.agentWorkspaceId, target);
      if (!estimate) throw new ApiError("not_ready", "This agent has no price yet.");
      return { name: found.spec.name, credits: body.maxCredits !== undefined ? Math.max(1, Math.min(estimate, body.maxCredits)) : estimate };
    }
    const body = parseBody(StartPipelineBody, rawBody);
    noBrain(body);
    const info = await app.pipeline(X402_CALLER, ws, target);
    if (!info) throw new ApiError("not_found", `No pipeline "${target}" can be paid for with x402.`);
    const v = validateRunInputs({ inputs: info.spec.inputs }, body.inputs);
    if (!v.ok) throw new ApiError("invalid_input", "Some inputs need a look.", issuesOf(v.errors));
    const estimate = await this.o.pipelines?.estimate(ws, target, info.workspaceId);
    if (!estimate) throw new ApiError("not_ready", "This pipeline has no price yet.");
    return { name: info.spec.name, credits: body.maxCredits !== undefined ? Math.max(1, Math.min(estimate, body.maxCredits)) : estimate };
  }

  /** USD per whole unit of an asset, 8 decimals. Null when there is no price right now. */
  private async price(a: X402Asset): Promise<bigint | null> {
    if (a.price.kind === "stable") return BigInt(100000000);
    if (a.price.kind === "fixed") return a.price.usd ? usdToScaled(a.price.usd) : null;
    if (!this.o.readFeed) return null;
    try {
      return await this.o.readFeed(a.price.feed, a.price.maxAgeSec);
    } catch (err) {
      this.log(`[x402] price feed for ${a.symbol} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** A fresh quote for a request, stored single use. Throws the request's own error when it would not run. */
  async quote(kind: Kind, target: string, rawBody: unknown, resource: string, ip: string): Promise<Quote> {
    this.hit(`quote:${ip}`, this.cfg.limits.quotesPerIp, "Too many price quotes from this address. Wait a little and try again.");
    const { name, credits } = await this.prepare(kind, target, rawBody);
    const usdMicro = usdMicroForCredits(credits);
    const accepts: Quote["accepts"] = [];
    for (const a of this.status().assets.filter(priced)) {
      const p = await this.price(a);
      if (p) accepts.push({ asset: a.address, symbol: a.symbol, decimals: a.decimals, amount: atomicForUsd(usdMicro, p, a.decimals).toString() });
    }
    if (!accepts.length) throw new ApiError("not_ready", "No asset has a price right now, so nothing can be quoted. Try again in a little while.");
    const now = this.now();
    const q: Quote = {
      id: `x402q_${randomBytes(18).toString("base64url")}`,
      kind,
      target,
      targetName: name,
      resource,
      bodyHash: bodyHash(rawBody),
      credits,
      usdMicro: usdMicro.toString(),
      payTo: this.cfg.payTo!,
      chainId: this.cfg.chainId,
      network: this.cfg.network,
      accepts,
      ip,
      issuedAt: this.iso(now),
      expiresAt: this.iso(now + this.cfg.quoteSeconds * 1000),
      usedAt: null,
      paymentId: null,
    };
    await this.o.store.quotes.insert(q);
    void this.sweep().catch(() => undefined);
    return q;
  }

  /** The 402's `accepts` for a quote: one entry per asset. */
  requirements(q: Quote, url: string): PaymentRequirements[] {
    return q.accepts.map((a) => ({
      scheme: X402_SCHEME,
      network: q.network,
      maxAmountRequired: a.amount,
      resource: url,
      description: `${q.targetName}: one ${q.kind === "run" ? "run" : "pipeline run"}, about ${q.credits} credits ($${usdWords(q.usdMicro)}). Never charged more; what it does not use is owed back.`,
      mimeType: "application/json",
      payTo: q.payTo,
      maxTimeoutSeconds: this.cfg.quoteSeconds,
      asset: a.asset,
      outputSchema: null,
      extra: { nonce: q.id, expiresAt: q.expiresAt, chainId: q.chainId, symbol: a.symbol, decimals: a.decimals, credits: q.credits, priceUsd: usdWords(q.usdMicro), sign: signTemplate(q.id, q.chainId) },
    }));
  }

  /** Drops quotes that ended a day ago and were never used. */
  private async sweep(): Promise<void> {
    if (Math.random() > 0.05) return;
    const cutoff = this.now() - DAY;
    for (const q of await this.o.store.quotes.find({ usedAt: null })) if (Date.parse(q.expiresAt) < cutoff) await this.o.store.quotes.delete(q.id);
  }

  /* ---------- A paid call ---------- */

  /**
   * Checks X-PAYMENT and starts the run. Payment problems throw X402Error
   * (a 402); request problems throw ApiError. The same header again returns
   * the same run, never a second one.
   */
  async pay(kind: Kind, target: string, rawBody: unknown, header: string, resource: string, ip: string): Promise<PaidResult> {
    await this.setup();
    const verifier = this.o.verifier;
    if (!verifier || !this.on) throw new ApiError("unauthenticated", "x402 is off on this server. Use an API key.");
    const l = this.cfg.limits;
    this.hit(`paid-ip:${ip}`, l.paidPerIp, "Too many paid calls from this address. Wait a little and try again.");
    let payload;
    try {
      payload = decodePaymentHeader(header, this.cfg.maxHeaderBytes);
    } catch (err) {
      if (err instanceof PaymentHeaderError) throw new X402Error("payment_invalid", err.message);
      throw err;
    }
    const pl = payload.payload;
    this.hit(`payer:${pl.payer.toLowerCase()}`, l.paidPerPayer, "Too many paid calls from this wallet. Wait a little and try again.");
    if (payload.network !== this.cfg.network) throw new X402Error("payment_wrong_chain", `Pay on ${this.cfg.network}.`);
    const headerHash = sha256(header.trim());

    return this.lock(`quote:${pl.nonce}`, async () => {
      // The same header again (a retry after a lost answer): the same run, no second charge.
      const [same] = await this.o.store.payments.find({ headerHash });
      if (same) return this.replay(same);

      const quote = await this.o.store.quotes.get(pl.nonce);
      if (!quote) throw new X402Error("payment_unknown_quote", "That nonce is not a quote from this server. Pay the quote below.");
      if (quote.resource !== resource || quote.kind !== kind || quote.target !== target) throw new X402Error("payment_wrong_resource", "That quote is for another call. Pay the quote below.");
      if (quote.bodyHash !== bodyHash(rawBody)) throw new X402Error("payment_wrong_resource", "The body is not the one that was quoted. Send the same body, or pay the quote below.");
      if (quote.usedAt) throw new X402Error("payment_used", "That quote has already been paid and used.");
      if (this.now() > Date.parse(quote.expiresAt) + this.cfg.graceSeconds * 1000) throw new X402Error("payment_expired", "That quote ran out. Pay the new quote below.");

      const paymentId = fakeTxId(this.cfg.chainId, pl.txHash);
      if (await this.o.store.payments.get(paymentId)) throw new X402Error("payment_used", "That transaction already paid for a call. Each transfer pays once.");
      const accept = quote.accepts.find((a) => sameAddress(a.asset, pl.asset));
      if (!accept) throw new X402Error("payment_wrong_asset", "The quote does not take that asset.", { quote });

      let signer: string | null = null;
      try {
        signer = await recoverMessageAddress({ message: signMessage(quote.id, pl.txHash, quote.chainId), signature: pl.signature as `0x${string}` });
      } catch {
        signer = null;
      }
      if (!sameAddress(signer, pl.payer)) throw new X402Error("payment_bad_signature", "The signature is not the payer's signature of the quote message (see extra.sign).");

      const required = BigInt(accept.amount);
      const result = await verifier.verify({
        txHash: pl.txHash,
        payer: pl.payer,
        asset: accept.asset,
        payTo: quote.payTo,
        chainId: quote.chainId,
        required,
        issuedAt: new Date(quote.issuedAt),
        expiresAt: new Date(quote.expiresAt),
        minConfirmations: this.cfg.minConfirmations,
        skewSeconds: this.cfg.skewSeconds,
      });
      const base = (): Payment => ({
        id: paymentId,
        quoteId: quote.id,
        kind,
        target,
        targetName: quote.targetName,
        runId: null,
        pipelineRunId: null,
        payer: pl.payer,
        asset: accept.asset,
        symbol: accept.symbol,
        decimals: accept.decimals,
        required: accept.amount,
        paid: "0",
        txHash: pl.txHash.toLowerCase(),
        chainId: quote.chainId,
        network: quote.network,
        blockNumber: "0",
        blockTime: this.iso(),
        verifier: verifier.name,
        test: verifier.test,
        credits: quote.credits,
        usdMicro: quote.usdMicro,
        headerHash,
        status: "running",
        charged: null,
        used: null,
        unused: null,
        refundId: null,
        outcome: null,
        note: null,
        ip,
        createdAt: this.iso(),
        settledAt: null,
      });

      if (!result.ok) {
        if (!result.owed) throw new X402Error(result.code, result.message, { retry: result.retry, quote: result.retry ? quote : null });
        // It reached us but does not meet the quote: use up the transaction and the quote, and owe it all back.
        const t = result.owed.transfer;
        const row: Payment = { ...base(), paid: t.amount.toString(), blockNumber: t.blockNumber.toString(), blockTime: this.iso(t.blockTime * 1000), status: "rejected", charged: 0, used: "0", unused: t.amount.toString(), outcome: result.code, note: result.message, settledAt: this.iso() };
        await this.o.store.payments.insert(row).catch(() => {
          throw new X402Error("payment_used", "That transaction already paid for a call.");
        });
        await this.o.store.quotes.updateIf(quote.id, { usedAt: null }, { usedAt: this.iso(), paymentId });
        const sym = accept.symbol;
        const note = result.owed.reason === "too_little" ? `Paid ${unitsWords(t.amount, accept.decimals)} ${sym} of the ${unitsWords(required, accept.decimals)} ${sym} quoted.` : `Paid after the quote ended at ${quote.expiresAt.slice(0, 16).replace("T", " ")} UTC.`;
        const refund = await this.recordRefund(row, t.amount, result.owed.reason, note);
        await this.o.store.payments.update({ ...row, refundId: refund.id });
        throw new X402Error(result.code, result.message, { settle: this.settleHeader(row, false, result.code) });
      }

      const t = result.transfer;
      const claimed = await this.o.store.quotes.updateIf(quote.id, { usedAt: null }, { usedAt: this.iso(), paymentId });
      if (!claimed) throw new X402Error("payment_used", "That quote has already been paid and used.");
      const row: Payment = { ...base(), paid: t.amount.toString(), blockNumber: t.blockNumber.toString(), blockTime: this.iso(t.blockTime * 1000) };
      try {
        await this.o.store.payments.insert(row);
      } catch {
        throw new X402Error("payment_used", "That transaction already paid for a call. Each transfer pays once.");
      }
      return this.start(row, rawBody);
    });
  }

  /** Funds the run with the quote and starts it as the x402 caller. */
  private async start(row: Payment, rawBody: unknown): Promise<PaidResult> {
    const ws = X402_WORKSPACE_ID;
    let funded = false;
    try {
      await this.o.credits.payX402(ws, { paymentId: row.id, credits: row.credits, label: `x402: ${row.targetName}`, test: row.test });
      funded = true;
      const body = { ...(rawBody as Record<string, unknown>), maxCredits: row.credits };
      const idem = `x402-${sha256(row.id).slice(0, 40)}`;
      const view = row.kind === "run" ? await this.o.api.startRun(X402_CALLER, row.target, body, idem) : await this.o.api.startPipeline(X402_CALLER, row.target, body, idem);
      const next: Payment = { ...row, ...(row.kind === "run" ? { runId: view.id } : { pipelineRunId: view.id }) };
      await this.o.store.payments.update(next);
      const receipt = await this.newReceipt(next);
      // A fast run may have ended before the payment knew its id.
      void this.track(this.settleById(next.id));
      return { ok: true, status: 202, kind: row.kind, view, settle: this.settleHeader(next, true), receipt, payment: next };
    } catch (err) {
      const error = toApiError(err);
      if (funded) await this.o.credits.adjust(ws, { amount: -row.credits, key: `x402:${row.id}:not_started`, by: "x402", note: "Paid with x402, but the run did not start. Owed back in full." }).catch((e) => this.log(`[x402] could not take back ${row.id}: ${e}`));
      const refund = await this.recordRefund(row, BigInt(row.paid), "not_started", `Paid, but the ${row.kind === "run" ? "run" : "pipeline run"} did not start: ${error.message}`);
      const failed: Payment = { ...row, status: "not_started", charged: 0, used: "0", unused: row.paid, refundId: refund.id, outcome: error.code, note: error.message, settledAt: this.iso() };
      await this.o.store.payments.update(failed);
      return { ok: false, error, settle: this.settleHeader(failed, false, "run_not_started"), payment: failed };
    }
  }

  /** The same X-PAYMENT again: the run it started, with a new receipt. */
  private async replay(p: Payment): Promise<PaidResult> {
    const id = p.runId ?? p.pipelineRunId;
    if (!id || (p.status !== "running" && p.status !== "settled")) throw new X402Error("payment_used", "That payment was already used and did not start a run. It is recorded as owed back.");
    const view = p.kind === "run" ? await this.o.api.getRun(X402_CALLER, id) : await this.o.api.getPipelineRun(X402_CALLER, id);
    return { ok: true, status: 200, kind: p.kind, view, settle: this.settleHeader(p, true), receipt: await this.newReceipt(p), payment: p };
  }

  settleHeader(p: Payment, success: boolean, errorReason?: string): SettleResponse {
    return { success, transaction: p.txHash, network: p.network, payer: p.payer, ...(errorReason ? { errorReason } : {}) };
  }

  /* ---------- Settling ---------- */

  private async recordRefund(p: Payment, amount: bigint, reason: RefundReason, note: string): Promise<OwedRefund> {
    const id = `x402r_${sha256(`${p.id}:${reason}`).slice(0, 20)}`;
    const have = await this.o.store.refunds.get(id);
    if (have) return have;
    const refund = await this.o.verifier!.refund({ id, payment: p, amount, reason, note, now: new Date(this.now()) });
    await this.o.store.refunds.insert(refund).catch(() => undefined);
    return refund;
  }

  /** Settles a payment whose run or pipeline run has ended. Safe to call again. */
  async settleById(paymentId: string): Promise<Payment | null> {
    return this.lock(`settle:${paymentId}`, async () => {
      const p = await this.o.store.payments.get(paymentId);
      if (!p || p.status !== "running") return p;
      const end = await this.endOf(p);
      if (!end) return p;
      const charged = Math.max(0, Math.min(end.charged, p.credits));
      const required = BigInt(p.required);
      const paid = BigInt(p.paid);
      const used = usedAmount(required, paid, charged, p.credits);
      const unused = paid - used;
      const back = p.credits - charged;
      // What the run did not use leaves the x402 workspace, so it holds nothing between calls.
      if (back > 0) await this.o.credits.adjust(X402_WORKSPACE_ID, { amount: -back, key: `x402:${p.id}:back`, by: "x402", note: `x402 ${p.kind} ${end.outcome}: ${back} of ${p.credits} credits not used.` });
      let refundId: string | null = null;
      const unusedCredits = creditsForAmount(unused, required, p.credits);
      if (unused > BigInt(0) && (!end.ok || unusedCredits >= this.cfg.refundUnusedFromCredits)) {
        const reason: RefundReason = end.ok ? "unused" : end.outcome === "cancelled" ? "cancelled" : "failed";
        const words = `${unitsWords(unused, p.decimals)} ${p.symbol}`;
        const what = p.kind === "run" ? "run" : "pipeline run";
        const how = end.outcome === "cancelled" ? "was stopped" : end.outcome === "failed" ? "failed" : `ended (${end.outcome})`;
        refundId = (await this.recordRefund(p, unused, reason, end.ok ? `The ${what} used ${charged} of ${p.credits} credits. ${words} not used.` : `The ${what} ${how} and used ${charged} of ${p.credits} credits. ${words} not used.`)).id;
      }
      const next: Payment = { ...p, status: "settled", charged, used: used.toString(), unused: unused.toString(), refundId, outcome: end.outcome, settledAt: this.iso() };
      await this.o.store.payments.update(next);
      return next;
    });
  }

  /** How a payment's run ended, or null while it goes. */
  private async endOf(p: Payment): Promise<{ ok: boolean; outcome: string; charged: number } | null> {
    if (p.runId) {
      const run = await this.o.engine.getRun(X402_WORKSPACE_ID, p.runId);
      if (!run || !["succeeded", "failed", "cancelled"].includes(run.status)) return null;
      if (run.credits && run.credits.state === "held") return null;
      return { ok: run.status === "succeeded", outcome: run.status, charged: run.credits?.charged ?? 0 };
    }
    if (p.pipelineRunId && this.o.pipelines) {
      const pr = await this.o.pipelines.get(X402_WORKSPACE_ID, p.pipelineRunId);
      if (!pr || !pr.credits || pr.credits.state !== "settled") return null;
      if (pr.status === "running" || pr.status === "waiting") return null;
      return { ok: ["ready", "approved", "rejected"].includes(pr.status), outcome: pr.status, charged: pr.credits.charged };
    }
    return null;
  }

  /** Engine events: a run or pipeline run in the x402 workspace ended. */
  onRun(run: Pick<Run, "id" | "workspaceId" | "parent">) {
    if (run.workspaceId !== X402_WORKSPACE_ID || run.parent) return;
    void this.track(
      (async () => {
        const [p] = await this.o.store.payments.find({ runId: run.id });
        if (p) await this.settleById(p.id);
      })().catch((err) => this.log(`[x402] could not settle run ${run.id}: ${err instanceof Error ? err.message : String(err)}`)),
    );
  }

  onPipeline(pr: Pick<PipelineRun, "id" | "workspaceId">) {
    if (pr.workspaceId !== X402_WORKSPACE_ID) return;
    void this.track(
      (async () => {
        const [p] = await this.o.store.payments.find({ pipelineRunId: pr.id });
        if (p) await this.settleById(p.id);
      })().catch((err) => this.log(`[x402] could not settle pipeline run ${pr.id}: ${err instanceof Error ? err.message : String(err)}`)),
    );
  }

  /** Listens to the engines. Returns a function that stops it. */
  wire(): () => void {
    const off1 = this.o.engine.onFinished((run) => this.onRun(run));
    const off2 = this.o.pipelines?.onSettled((pr) => this.onPipeline(pr));
    return () => {
      off1();
      off2?.();
    };
  }

  /** Settles payments whose runs ended while nobody listened (a restart). */
  async settleOpen(): Promise<number> {
    let n = 0;
    for (const p of await this.o.store.payments.find({ status: "running" })) {
      const done = await this.settleById(p.id);
      if (done && done.status !== "running") n++;
    }
    return n;
  }

  /* ---------- Receipts: reading a paid run without an account ---------- */

  private async newReceipt(p: Payment): Promise<string> {
    const token = `wovi_rt_${randomBytes(24).toString("base64url")}`;
    const now = this.now();
    await this.o.store.receipts.insert({ id: sha256(token), paymentId: p.id, kind: p.kind, targetId: (p.runId ?? p.pipelineRunId)!, createdAt: this.iso(now), expiresAt: this.iso(now + this.cfg.receiptDays * DAY) });
    return token;
  }

  /** The payment a receipt token reads, for this run. Unknown, expired or another run's token: not_found or unauthenticated. */
  async receipt(token: string | null, kind: Kind, id: string, ip: string): Promise<Payment> {
    this.hit(`read:${ip}`, this.cfg.limits.readsPerIp, "Too many reads from this address. Wait a little and try again.");
    if (!token || !/^wovi_rt_[A-Za-z0-9_-]{20,64}$/.test(token)) throw new ApiError("unauthenticated", "Send the receipt token from the paid answer: Authorization: Bearer wovi_rt_...");
    const r = await this.o.store.receipts.get(sha256(token));
    if (!r || Date.parse(r.expiresAt) < this.now()) throw new ApiError("unauthenticated", "That receipt token is not valid or has ended.");
    if (r.kind !== kind || r.targetId !== id) throw new ApiError("not_found", "That receipt is for another run.");
    const p = await this.o.store.payments.get(r.paymentId);
    if (!p) throw new ApiError("not_found", "No such payment.");
    return p;
  }

  async paymentView(p: Payment): Promise<PaymentView> {
    const settled = p.status === "running" ? ((await this.settleById(p.id)) ?? p) : p;
    const refund = settled.refundId ? await this.o.store.refunds.get(settled.refundId) : null;
    return {
      id: settled.id,
      status: settled.status,
      payer: settled.payer,
      network: settled.network,
      transaction: settled.txHash,
      asset: settled.asset,
      symbol: settled.symbol,
      paid: settled.paid,
      required: settled.required,
      credits: settled.credits,
      charged: settled.charged,
      refund: refund ? { amount: refund.amount, status: refund.status, reason: refund.reason } : null,
      test: settled.test,
    };
  }

  /* ---------- The pretend chain (fake verifier, local only) ---------- */

  /** Records a pretend transfer and returns its hash, like a wallet would. Only with the fake verifier on this machine. */
  async fakeTransfer(input: { from: string; to?: string; asset?: string; amount: string; chainId?: number; confirmations?: number; minedAt?: number; success?: boolean }): Promise<{ txHash: string; test: true }> {
    if (this.o.verifier?.name !== "fake" || !this.o.local) throw new ApiError("not_found", "No such endpoint.");
    if (!/^\d{1,40}$/.test(input.amount)) throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "amount", message: "Atomic units, as a whole number in a string." }]);
    const txHash = `0x${randomBytes(32).toString("hex")}`;
    const chainId = input.chainId ?? this.cfg.chainId;
    await this.o.store.fakeTransfers.insert({
      id: fakeTxId(chainId, txHash),
      chainId,
      txHash,
      from: input.from,
      to: input.to ?? this.cfg.payTo ?? "",
      asset: input.asset ?? this.cfg.assets[0].address,
      amount: input.amount,
      blockNumber: String(1_000_000 + (await this.o.store.fakeTransfers.find()).length),
      blockTime: this.iso(input.minedAt ?? this.now()),
      confirmations: input.confirmations ?? this.cfg.minConfirmations,
      success: input.success ?? true,
    });
    return { txHash, test: true };
  }

  /* ---------- The owner's page ---------- */

  async summary(limit = 25) {
    await this.settleOpen().catch(() => 0);
    const payments = (await this.o.store.payments.find()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const refunds = (await this.o.store.refunds.find()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const totals = new Map<string, { symbol: string; decimals: number; received: bigint; owed: bigint; count: number }>();
    for (const p of payments) {
      const t = totals.get(p.asset.toLowerCase()) ?? { symbol: p.symbol, decimals: p.decimals, received: BigInt(0), owed: BigInt(0), count: 0 };
      t.received += BigInt(p.paid);
      t.count += 1;
      totals.set(p.asset.toLowerCase(), t);
    }
    for (const r of refunds.filter((r) => r.status === "owed")) {
      const t = totals.get(r.asset.toLowerCase());
      if (t) t.owed += BigInt(r.amount);
    }
    return {
      status: this.status(),
      payTo: this.cfg.payTo,
      network: this.cfg.network,
      chainId: this.cfg.chainId,
      verifier: this.o.verifier?.name ?? this.cfg.verifier,
      rpcSet: Boolean(this.cfg.rpcUrl),
      minConfirmations: this.cfg.minConfirmations,
      quoteSeconds: this.cfg.quoteSeconds,
      refundUnusedFromCredits: this.cfg.refundUnusedFromCredits,
      payments: payments.slice(0, limit),
      paymentCount: payments.length,
      owed: refunds.filter((r) => r.status === "owed"),
      paidRefunds: refunds.filter((r) => r.status === "paid").slice(0, 10),
      totals: [...totals.values()].map((t) => ({ symbol: t.symbol, decimals: t.decimals, received: t.received.toString(), owed: t.owed.toString(), count: t.count })),
    };
  }

  /** The owner paid a refund from their own wallet: record its transaction. Nothing is checked or sent. */
  async markRefundPaid(id: string, txHash: string, by: string): Promise<OwedRefund> {
    if (!isTxHash(txHash)) throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "txHash", message: "Paste the 0x transaction hash of the refund you sent." }]);
    const done = await this.o.store.refunds.updateIf(id, { status: "owed" }, { status: "paid", paidAt: this.iso(), paidTx: txHash.toLowerCase(), paidBy: by });
    if (!done) throw new ApiError("not_found", "No owed refund with that id.");
    return done;
  }

  /* ---------- Discovery ---------- */

  /** Which endpoints take x402 and what each agent and pipeline costs. Public. */
  async discovery() {
    await this.setup();
    const s = this.status();
    const app = this.o.api.o.app;
    const ws = X402_WORKSPACE_ID;
    const agents: { id: string; name: string; credits: number; usd: string }[] = [];
    for (const a of (await app.lineup(X402_CALLER, ws)).filter((a) => a.status === "live" && a.spec)) {
      const found = await app.agent(X402_CALLER, ws, a.id);
      const credits = found ? await this.o.credits.estimateById(found.agentWorkspaceId, a.id) : null;
      if (credits) agents.push({ id: a.id, name: a.spec!.name, credits, usd: usdWords(usdMicroForCredits(credits)) });
    }
    const pipelines: { id: string; name: string; credits: number; usd: string }[] = [];
    for (const p of await app.pipelines(X402_CALLER, ws)) {
      const credits = await this.o.pipelines?.estimate(ws, p.spec.id, p.workspaceId);
      if (credits) pipelines.push({ id: p.spec.id, name: p.spec.name, credits, usd: usdWords(usdMicroForCredits(credits)) });
    }
    const base = this.o.appUrl.replace(/\/$/, "");
    return {
      x402Version: X402_VERSION,
      enabled: s.on,
      ...(s.on ? {} : { off: "x402 is off on this server until the owner sets a receiving address and a way to check payments." }),
      test: s.on && this.test,
      scheme: X402_SCHEME,
      network: this.cfg.network,
      chainId: this.cfg.chainId,
      payTo: s.on ? this.cfg.payTo : null,
      assets: s.assets.map((a) => ({ symbol: a.symbol, asset: a.address, decimals: a.decimals })),
      creditUsd: "0.01",
      quoteSeconds: this.cfg.quoteSeconds,
      confirmations: this.cfg.minConfirmations,
      pricing: "Each call costs its estimate in credits at $0.01 a credit, quoted in the asset at the time of the 402. A run is never charged more than its quote.",
      endpoints: [
        { method: "POST", path: "/api/v1/agents/{id}/runs", description: "Start a run of one agent. No Authorization header: the answer is a 402 with the quote.", prices: agents },
        { method: "POST", path: "/api/v1/pipelines/{id}/runs", description: "Start a pipeline run. No Authorization header: the answer is a 402 with the quote.", prices: pipelines },
      ],
      receipts: {
        header: "Authorization: Bearer wovi_rt_... (X-Receipt-Token from the paid answer)",
        endpoints: ["GET /api/v1/x402/runs/{id}", "POST /api/v1/x402/runs/{id}/cancel", "GET /api/v1/x402/pipeline-runs/{id}", "POST /api/v1/x402/pipeline-runs/{id}/pick", "POST /api/v1/x402/pipeline-runs/{id}/cancel"],
      },
      payment: {
        header: "X-PAYMENT: base64 of { x402Version: 1, scheme, network, payload: { nonce, txHash, payer, asset, signature } }",
        sign: "The payer signs extra.sign from the 402 with {txHash} filled in (EIP-191 personal_sign).",
        refunds: "What a run does not use, and every failed or stopped run, is owed back to the payer by the owner. Nothing is sent automatically.",
      },
      mcp: "MCP at /mcp stays on API keys. x402 is for the REST endpoints above.",
      openapi: `${base}/api/v1/openapi.json`,
      docs: `${base}/app/settings/api/reference#x402`,
    };
  }
}
