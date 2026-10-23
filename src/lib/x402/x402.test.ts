import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SAMPLE_RUNS } from "@/lib/runs/samples";
import { RunSchema } from "@/lib/api/schemas";
import { handleMcp } from "@/lib/api/mcp";
import { DEFAULT_X402, NATIVE_ASSET, X402_WORKSPACE_ID, x402ConfigFromEnv, x402Status } from "./config";
import { atomicForUsd, creditsForAmount, unitsWords, usdMicroForCredits, usdToScaled, usdWords, usedAmount } from "./money";
import { lookupOnChain, onchainVerifier, readFeed, TRANSFER_TOPIC, type ChainReader } from "./onchain";
import { PaymentHeaderError, bodyHash, decodePaymentHeader, decodeSettleResponse, encodePaymentHeader } from "./protocol";
import { PaymentRequiredSchema, X402DiscoverySchema, X402PipelineRunResultSchema, X402RunResultSchema } from "./schemas";
import { PAY_TO, testX402 } from "./test-helpers";
import type { PaymentRequirements } from "./types";
import { checkTransfer, type ObservedTransfer, type VerifyRequest } from "./verifier";

const HOOK = SAMPLE_RUNS["hook-writer"].inputs;
const START = "/agents/hook-writer/runs";
const IDEA = "Gerald the sourdough starter turns nine on Saturday and gets his own cake";

/** The first quote of a 402. */
const first = (r: { json: { accepts: PaymentRequirements[] } }) => r.json.accepts[0];

async function quoted(t: Awaited<ReturnType<typeof testX402>>, body: unknown = { inputs: HOOK }, path = START) {
  const r = await t.call("POST", path, { body });
  expect(r.status).toBe(402);
  return { res: r, req: first(r) };
}

describe("x402: off by default", () => {
  it("stays off without a receiving address and a way to check payments, and the API answers 401 as before", async () => {
    expect(x402Status(DEFAULT_X402, true)).toMatchObject({ on: false });
    expect(x402Status(DEFAULT_X402, true).missing.join(" ")).toContain("WOVI_X402_PAY_TO");
    // A pay-to address alone is not enough: no RPC, no price.
    const env = x402ConfigFromEnv({ WOVI_X402_PAY_TO: PAY_TO });
    expect(env.payTo).toBe(PAY_TO);
    expect(x402Status(env, false).on).toBe(false);
    expect(x402Status(env, false).missing.join(" ")).toContain("RPC URL");
    expect(x402Status(env, false).missing.join(" ")).toContain("USD price");
    // All three: on.
    const on = x402ConfigFromEnv({ WOVI_X402_PAY_TO: PAY_TO, WOVI_X402_RPC_URL: "https://rpc.example.org", WOVI_X402_ETH_USD: "2500" });
    expect(x402Status(on, false)).toMatchObject({ on: true, verifier: "onchain", test: false });
    expect(on).toMatchObject({ chainId: 4663, network: "eip155:4663" });
    // The fake verifier never runs off this machine.
    expect(x402Status(x402ConfigFromEnv({ WOVI_X402_PAY_TO: PAY_TO, WOVI_X402_VERIFIER: "fake", WOVI_X402_ETH_USD: "2500" }), false).on).toBe(false);
    expect(x402Status(x402ConfigFromEnv({ WOVI_X402_PAY_TO: "0x123", WOVI_X402_RPC_URL: "https://x", WOVI_X402_ETH_USD: "1" }), false).on).toBe(false);
    // A stablecoin can sit next to ETH in the list.
    const usdc = "0x0000000000000000000000000000000000005dc0";
    const both = x402ConfigFromEnv({ WOVI_X402_ASSETS: JSON.stringify([{ symbol: "ETH", address: NATIVE_ASSET, decimals: 18, price: { kind: "fixed", usd: "2500" } }, { symbol: "USDC", address: usdc, decimals: 6, price: { kind: "stable" } }]) });
    expect(both.assets.map((a) => a.symbol)).toEqual(["ETH", "USDC"]);

    const t = await testX402({ cfg: { payTo: null } });
    expect(t.x402.on).toBe(false);
    const r = await t.call("POST", START, { body: { inputs: HOOK } });
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe("unauthenticated");
    const d = X402DiscoverySchema.parse((await t.call("GET", "/x402")).json);
    expect(d).toMatchObject({ enabled: false, payTo: null });
    expect(await t.store.quotes.find()).toEqual([]);
  });
});

describe("x402: the 402", () => {
  it("answers an unauthenticated start with a quote in the x402 shape, priced like credits", async () => {
    const t = await testX402();
    const { res, req } = await quoted(t);
    const body = PaymentRequiredSchema.parse(res.json);
    expect(body).toMatchObject({ x402Version: 1, code: "payment_required" });
    expect(body.accepts).toHaveLength(1);
    const estimate = (await t.credits!.estimateById("ws_wovi", "hook-writer"))!;
    expect(req).toMatchObject({ scheme: "tx-hash", network: "eip155:4663", payTo: PAY_TO, asset: NATIVE_ASSET, resource: "http://localhost:3900/api/v1/agents/hook-writer/runs", maxTimeoutSeconds: 600, mimeType: "application/json" });
    expect(req.extra).toMatchObject({ chainId: 4663, symbol: "ETH", decimals: 18, credits: estimate, priceUsd: usdWords(usdMicroForCredits(estimate)) });
    // Wei, exact: the estimate in USD at $2,500 an ETH, rounded up.
    expect(req.maxAmountRequired).toBe(atomicForUsd(usdMicroForCredits(estimate), usdToScaled("2500"), 18).toString());
    expect(req.extra.sign).toContain(`Nonce: ${req.extra.nonce}`);
    expect(Date.parse(req.extra.expiresAt) - t.clock.t).toBe(600_000);
    const [q] = await t.store.quotes.find();
    expect(q).toMatchObject({ id: req.extra.nonce, kind: "run", target: "hook-writer", credits: estimate, usedAt: null, resource: "POST /api/v1/agents/hook-writer/runs", bodyHash: bodyHash({ inputs: HOOK }) });
    // maxCredits lowers the quote, never raises it.
    expect(first(await t.call("POST", START, { body: { inputs: HOOK, maxCredits: 1 } })).extra.credits).toBe(1);
    expect(first(await t.call("POST", START, { body: { inputs: HOOK, maxCredits: 999 } })).extra.credits).toBe(estimate);
  });

  it("checks the request before quoting, so nobody pays for a call that cannot run", async () => {
    const t = await testX402();
    const short = await t.call("POST", START, { body: { inputs: { idea: "cake", platform: "tiktok" } } });
    expect(short.status).toBe(422);
    expect(short.json.error.issues[0].path).toBe("inputs.idea");
    const brain = await t.call("POST", START, { body: { inputs: HOOK, brandBrainId: "bb_x" } });
    expect(brain.status).toBe(422);
    expect(brain.json.error.issues[0].path).toBe("brandBrainId");
    expect((await t.call("POST", "/agents/nope/runs", { body: { inputs: HOOK } })).status).toBe(404);
    expect((await t.call("POST", START, { body: "{nope" })).status).toBe(400);
    expect(await t.store.quotes.find()).toEqual([]);
  });
});

describe("x402: paying", () => {
  it("starts the run on a good payment, settles it like credits and reads it with the receipt", async () => {
    const t = await testX402();
    const { req } = await quoted(t);
    const { header, txHash } = await t.pay(req);
    const res = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": header } });
    expect(res.status).toBe(202);
    const run = RunSchema.parse(res.json);
    const settle = decodeSettleResponse(res.headers.get("x-payment-response")!);
    expect(settle).toEqual({ success: true, transaction: txHash.toLowerCase(), network: "eip155:4663", payer: t.payer.address });
    const receipt = res.headers.get("x-receipt-token")!;
    expect(receipt).toMatch(/^wovi_rt_/);
    expect(res.headers.get("location")).toBe(`/api/v1/x402/runs/${run.id}`);

    await t.engine.waitForRun(X402_WORKSPACE_ID, run.id);
    await t.x402.idle();
    const [p] = await t.store.payments.find();
    expect(p).toMatchObject({ id: `4663:${txHash.toLowerCase()}`, payer: t.payer.address, paid: req.maxAmountRequired, txHash: txHash.toLowerCase(), runId: run.id, status: "settled", outcome: "succeeded", credits: req.extra.credits, test: true });
    // Never more than quoted; the rest is under the refund minimum, so nothing is owed.
    expect(p.charged).toBeGreaterThan(0);
    expect(p.charged).toBeLessThanOrEqual(req.extra.credits);
    expect(BigInt(p.used!) + BigInt(p.unused!)).toBe(BigInt(p.paid));
    expect(p.refundId).toBeNull();
    // The x402 workspace holds nothing between calls; its ledger shows the payment, the hold and the charge.
    const bal = await t.credits!.balance(X402_WORKSPACE_ID);
    expect(bal).toMatchObject({ available: 0, held: 0 });
    const kinds = (await t.credits!.ledger(X402_WORKSPACE_ID)).map((e) => e.kind).reverse();
    expect(kinds).toEqual(["top_up", "hold", "release", "charge", "adjustment"]);
    // The quote is used up.
    expect((await t.store.quotes.get(req.extra.nonce))!.usedAt).not.toBeNull();

    // The receipt reads this run and nothing else.
    const read = await t.call("GET", `/x402/runs/${run.id}`, { headers: { authorization: `Bearer ${receipt}` } });
    expect(read.status).toBe(200);
    const result = X402RunResultSchema.parse(read.json);
    expect(result.run.status).toBe("succeeded");
    expect(result.run.output).not.toBeNull();
    expect(result.payment).toMatchObject({ status: "settled", payer: t.payer.address, charged: p.charged, refund: null, test: true });
    expect((await t.call("GET", `/x402/runs/${run.id}`)).status).toBe(401);
    expect((await t.call("GET", `/x402/runs/${run.id}`, { headers: { authorization: "Bearer wovi_rt_" + "x".repeat(32) } })).status).toBe(401);
    expect((await t.call("GET", `/x402/runs/run_other`, { headers: { authorization: `Bearer ${receipt}` } })).status).toBe(404);
    // A key from another workspace never sees x402 runs.
    const key = await t.key("admin");
    expect((await t.call("GET", `/runs/${run.id}`, { key })).status).toBe(404);
  });

  it("owes back what a run did not use when it is over the refund minimum", async () => {
    const t = await testX402({ cfg: { refundUnusedFromCredits: 1 } });
    const { req } = await quoted(t);
    const { header } = await t.pay(req);
    const res = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": header } });
    await t.engine.waitForRun(X402_WORKSPACE_ID, res.json.id);
    await t.x402.idle();
    const [p] = await t.store.payments.find();
    expect(p.charged).toBeLessThan(p.credits);
    const [r] = await t.store.refunds.find();
    expect(r).toMatchObject({ paymentId: p.id, to: t.payer.address, reason: "unused", status: "owed", amount: p.unused, test: true });
    expect(BigInt(r.amount)).toBe(BigInt(req.maxAmountRequired) - usedAmount(BigInt(req.maxAmountRequired), BigInt(req.maxAmountRequired), p.charged!, p.credits));
  });

  it("returns the same run for the same X-PAYMENT, and refuses a reused transaction or quote", async () => {
    const t = await testX402();
    const { req } = await quoted(t);
    const { header, txHash } = await t.pay(req);
    const a = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": header } });
    expect(a.status).toBe(202);
    const again = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": header } });
    expect(again.status).toBe(200);
    expect(again.json.id).toBe(a.json.id);
    expect(again.headers.get("x-receipt-token")).toMatch(/^wovi_rt_/);
    expect(await t.store.payments.find()).toHaveLength(1);
    expect((await t.engine.listRuns(X402_WORKSPACE_ID)).length).toBe(1);

    // The same transaction for a new quote: refused.
    const { req: req2 } = await quoted(t);
    const reuseTx = await t.pay(req2, { txHash });
    const b = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": reuseTx.header } });
    expect(b.status).toBe(402);
    expect(b.json.code).toBe("payment_used");
    expect(PaymentRequiredSchema.parse(b.json).accepts[0].extra.nonce).not.toBe(req2.extra.nonce);

    // The used quote with a new transaction: refused.
    const reuseQuote = await t.pay(req);
    const c = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": reuseQuote.header } });
    expect(c.status).toBe(402);
    expect(c.json.code).toBe("payment_used");
    expect((await t.engine.listRuns(X402_WORKSPACE_ID)).length).toBe(1);
  });

  it("refuses a transaction that already topped up credits (a stablecoin or ETH to the same address), and takes the next one", async () => {
    const toppedUp = new Set<string>();
    const t = await testX402({ usedElsewhere: async (id) => toppedUp.has(id) });
    const { req } = await quoted(t);
    const { header, txHash } = await t.pay(req);
    toppedUp.add(`4663:${txHash.toLowerCase()}`);
    const r = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": header } });
    expect(r.status).toBe(402);
    expect(r.json.code).toBe("payment_used");
    expect(await t.store.payments.find()).toEqual([]);
    const { req: req2 } = await quoted(t);
    const ok = await t.pay(req2);
    expect((await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": ok.header } })).status).toBe(202);
  });

  it("refuses the wrong amount, recipient, chain, asset, payer, signature, body or network", async () => {
    const t = await testX402();
    const send = (header: string, body: unknown = { inputs: HOOK }) => t.call("POST", START, { body, headers: { "x-payment": header } });
    const { req } = await quoted(t);

    const low = await send((await t.pay(req, { amount: (BigInt(req.maxAmountRequired) - BigInt(1)).toString() })).header);
    expect(low.status).toBe(402);
    expect(low.json.code).toBe("payment_amount_too_low");
    expect(decodeSettleResponse(low.headers.get("x-payment-response")!)).toMatchObject({ success: false, errorReason: "payment_amount_too_low" });
    // It reached us: recorded and owed back in full, and the quote is used up.
    const [short] = await t.store.payments.find({ status: "rejected" });
    const [owed] = await t.store.refunds.find();
    expect(owed).toMatchObject({ paymentId: short.id, reason: "too_little", amount: short.paid, status: "owed" });

    const { req: r2 } = await quoted(t);
    const other = "0x1111111111111111111111111111111111111111";
    expect((await send((await t.pay(r2, { to: other })).header)).json.code).toBe("payment_wrong_recipient");
    expect((await send((await t.pay(r2, { chainId: 1 })).header)).json.code).toBe("payment_wrong_chain");
    expect((await send((await t.pay(r2, { asset: "0x2222222222222222222222222222222222222222" })).header)).json.code).toBe("payment_wrong_asset");
    expect((await send((await t.pay(r2, { success: false })).header)).json.code).toBe("payment_failed");
    // Someone else's transfer with our signature, or our transfer signed by someone else.
    const mallory = privateKeyToAccount(generatePrivateKey());
    const theirs = await t.x402.fakeTransfer({ from: mallory.address, amount: r2.maxAmountRequired });
    expect((await send((await t.pay(r2, { txHash: theirs.txHash })).header)).json.code).toBe("payment_wrong_payer");
    expect((await send((await t.pay(r2, { signer: mallory })).header)).json.code).toBe("payment_bad_signature");
    // Another body than the one quoted.
    expect((await send((await t.pay(r2)).header, { inputs: { ...HOOK, platform: "x" } })).json.code).toBe("payment_wrong_resource");
    // Not base64 JSON, another network, an unknown nonce.
    expect((await send("not-a-payment")).json.code).toBe("payment_invalid");
    const p = await t.pay(r2);
    const decoded = decodePaymentHeader(p.header, 4096);
    expect((await send(encodePaymentHeader({ ...decoded, network: "eip155:1" }))).json.code).toBe("payment_wrong_chain");
    expect((await send((await t.pay(r2, { nonce: "x402q_" + "a".repeat(24) })).header)).json.code).toBe("payment_unknown_quote");
    // None of them started a run, and the quote still works for the right payment.
    expect((await t.engine.listRuns(X402_WORKSPACE_ID)).length).toBe(0);
    const ok = await send((await t.pay(r2)).header);
    expect(ok.status).toBe(202);
  });

  it("lets quotes expire, waits for confirmations, and owes back a transfer that came too late", async () => {
    const t = await testX402();
    const { req } = await quoted(t);
    // Not enough confirmations yet: try the same payment again, with the same quote.
    const early = await t.pay(req, { confirmations: 1 });
    const wait = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": early.header } });
    expect(wait.status).toBe(402);
    expect(wait.json.code).toBe("payment_not_confirmed");
    expect(wait.headers.get("retry-after")).toBe("5");
    expect(wait.json.accepts[0].extra.nonce).toBe(req.extra.nonce);

    // A transfer mined after the quote ended, sent in the grace window: owed back, nothing runs.
    const late = await t.pay(req, { minedAt: Date.parse(req.extra.expiresAt) + 1000 });
    t.clock.t = Date.parse(req.extra.expiresAt) + 60_000;
    const tooLate = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": late.header } });
    expect(tooLate.json.code).toBe("payment_too_late");
    expect((await t.store.refunds.find())[0]).toMatchObject({ reason: "too_late", status: "owed" });

    // A transfer made before the quote existed does not count.
    const { req: r2 } = await quoted(t);
    const old = await t.pay(r2, { minedAt: t.clock.t - 3_600_000 });
    expect((await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": old.header } })).json.code).toBe("payment_too_old");

    // Past the quote and its grace: expired, with a new quote to pay.
    const { req: r3 } = await quoted(t);
    const pay3 = await t.pay(r3);
    t.clock.t += (DEFAULT_X402.quoteSeconds + DEFAULT_X402.graceSeconds) * 1000 + 1000;
    const expired = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": pay3.header } });
    expect(expired.status).toBe(402);
    expect(expired.json.code).toBe("payment_expired");
    expect(expired.json.accepts[0].extra.nonce).not.toBe(r3.extra.nonce);
    expect((await t.engine.listRuns(X402_WORKSPACE_ID)).length).toBe(0);
  });
});

describe("x402: refunds", () => {
  it("owes everything back when the run fails, and what is left when it is stopped", async () => {
    const t = await testX402({ fake: { respond: () => new Error("provider down") } });
    const { req } = await quoted(t);
    const res = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": (await t.pay(req)).header } });
    expect(res.status).toBe(202);
    const done = await t.engine.waitForRun(X402_WORKSPACE_ID, res.json.id);
    expect(done.status).toBe("failed");
    await t.x402.idle();
    const [p] = await t.store.payments.find();
    expect(p).toMatchObject({ status: "settled", outcome: "failed", charged: 0, used: "0", unused: req.maxAmountRequired });
    const [r] = await t.store.refunds.find();
    expect(r).toMatchObject({ reason: "failed", amount: req.maxAmountRequired, to: t.payer.address, status: "owed" });
    expect(await t.credits!.balance(X402_WORKSPACE_ID)).toMatchObject({ available: 0, held: 0 });
  });

  it("stops a run with its receipt and owes back what it held", async () => {
    const t = await testX402({ fake: { latencyMs: 400 } });
    const { req } = await quoted(t);
    const res = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": (await t.pay(req)).header } });
    const receipt = res.headers.get("x-receipt-token")!;
    const stop = await t.call("POST", `/x402/runs/${res.json.id}/cancel`, { headers: { authorization: `Bearer ${receipt}` } });
    expect(stop.status).toBe(200);
    await t.engine.waitForRun(X402_WORKSPACE_ID, res.json.id);
    await t.x402.idle();
    const [p] = await t.store.payments.find();
    expect(p).toMatchObject({ status: "settled", outcome: "cancelled", charged: 0 });
    expect((await t.store.refunds.find())[0]).toMatchObject({ reason: "cancelled", amount: req.maxAmountRequired });
    expect((await t.call("GET", `/x402/runs/${res.json.id}`, { headers: { authorization: `Bearer ${receipt}` } })).json.payment.refund).toMatchObject({ status: "owed", reason: "cancelled" });
  });

  it("owes everything back when a paid run cannot start", async () => {
    const t = await testX402();
    // The Repurposer asks to confirm rights; the engine refuses it after payment.
    const body = { inputs: { post: SAMPLE_RUNS.repurposer.inputs.source, posted_on: "x", to: ["tiktok"] } };
    const { req } = await quoted(t, body, "/agents/repurposer/runs");
    const res = await t.call("POST", "/agents/repurposer/runs", { body, headers: { "x-payment": (await t.pay(req)).header } });
    expect(res.status).toBe(422);
    expect(decodeSettleResponse(res.headers.get("x-payment-response")!)).toMatchObject({ success: false, errorReason: "run_not_started" });
    const [p] = await t.store.payments.find();
    expect(p).toMatchObject({ status: "not_started", charged: 0 });
    expect((await t.store.refunds.find())[0]).toMatchObject({ reason: "not_started", amount: req.maxAmountRequired });
    expect(await t.credits!.balance(X402_WORKSPACE_ID)).toMatchObject({ available: 0, held: 0 });
    // The refund is a record only; the owner marks it paid with their own transaction.
    const [r] = await t.store.refunds.find();
    await expect(t.x402.markRefundPaid(r.id, "0x123", "usr_owner")).rejects.toThrow();
    const paid = await t.x402.markRefundPaid(r.id, "0x" + "ab".repeat(32), "usr_owner");
    expect(paid).toMatchObject({ status: "paid", paidTx: "0x" + "ab".repeat(32) });
    await expect(t.x402.markRefundPaid(r.id, "0x" + "ab".repeat(32), "usr_owner")).rejects.toThrow();
  });
});

describe("x402: pipelines", () => {
  it("pays for a pipeline run, picks with the receipt and settles when it is ready", async () => {
    const t = await testX402();
    const body = { inputs: { start: "my_idea", idea: IDEA, platform: "tiktok", length: "s30" } };
    const { req } = await quoted(t, body, "/pipelines/idea-to-post/runs");
    expect(req.extra.credits).toBe(await t.pipelineEngine.estimate(X402_WORKSPACE_ID, "idea-to-post", "ws_wovi"));
    const res = await t.call("POST", "/pipelines/idea-to-post/runs", { body, headers: { "x-payment": (await t.pay(req)).header } });
    expect(res.status).toBe(202);
    expect(res.headers.get("location")).toBe(`/api/v1/x402/pipeline-runs/${res.json.id}`);
    const receipt = res.headers.get("x-receipt-token")!;
    await t.pipelineEngine.waitUntilSettled(X402_WORKSPACE_ID, res.json.id);
    const auth = { authorization: `Bearer ${receipt}` };
    const waiting = X402PipelineRunResultSchema.parse((await t.call("GET", `/x402/pipeline-runs/${res.json.id}`, { headers: auth })).json);
    expect(waiting.pipelineRun.status).toBe("waiting");
    expect(waiting.payment.status).toBe("running");
    const picked = await t.call("POST", `/x402/pipeline-runs/${res.json.id}/pick`, { headers: auth, body: { index: 1 } });
    expect(picked.status).toBe(200);
    await t.pipelineEngine.waitUntilSettled(X402_WORKSPACE_ID, res.json.id);
    await t.x402.idle();
    const [p] = await t.store.payments.find();
    expect(p).toMatchObject({ kind: "pipeline", pipelineRunId: res.json.id, status: "settled", outcome: "ready" });
    expect(p.charged).toBeGreaterThan(0);
    expect(p.charged).toBeLessThanOrEqual(p.credits);
    expect(await t.credits!.balance(X402_WORKSPACE_ID)).toMatchObject({ available: 0, held: 0 });
    // A run's receipt does not open the pipeline run, and the other way round.
    expect((await t.call("GET", `/x402/runs/${res.json.id}`, { headers: auth })).status).toBe(404);
  });
});

describe("x402: limits and discovery", () => {
  it("limits quotes and paid tries per address and per payer", async () => {
    const t = await testX402({ cfg: { limits: { ...DEFAULT_X402.limits, quotesPerIp: { max: 3, windowMs: 60_000 }, paidPerPayer: { max: 2, windowMs: 60_000 } } } });
    const ip = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 3; i++) expect((await t.call("POST", START, { body: { inputs: HOOK }, headers: ip })).status).toBe(402);
    const fourth = await t.call("POST", START, { body: { inputs: HOOK }, headers: ip });
    expect(fourth.status).toBe(429);
    expect(fourth.json.error.code).toBe("rate_limited");
    expect(Number(fourth.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another address still gets quotes.
    const { req } = await quoted(t);
    const bad = await t.pay(req, { amount: "1" });
    await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": bad.header } });
    await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": bad.header } });
    const third = await t.call("POST", START, { body: { inputs: HOOK }, headers: { "x-payment": bad.header } });
    expect(third.status).toBe(429);
    expect(third.json.error.message).toContain("wallet");
    t.clock.t += 61_000;
    expect((await t.call("POST", START, { body: { inputs: HOOK } })).status).toBe(402);
  });

  it("lists which endpoints take x402 with their prices, and MCP stays on keys", async () => {
    const t = await testX402();
    const res = await t.call("GET", "/x402");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const d = X402DiscoverySchema.parse(res.json);
    expect(d).toMatchObject({ enabled: true, test: true, scheme: "tx-hash", network: "eip155:4663", chainId: 4663, payTo: PAY_TO, creditUsd: "0.01" });
    expect(d.endpoints.map((e) => e.path)).toEqual(["/api/v1/agents/{id}/runs", "/api/v1/pipelines/{id}/runs"]);
    const hook = d.endpoints[0].prices.find((p) => p.id === "hook-writer")!;
    expect(hook.credits).toBe(await t.credits!.estimateById("ws_wovi", "hook-writer"));
    expect(hook.usd).toBe(usdWords(usdMicroForCredits(hook.credits)));
    expect(d.endpoints[1].prices.map((p) => p.id)).toContain("idea-to-post");
    expect(d.mcp).toContain("API keys");
    // MCP without a key is still 401, with x402 on.
    const mcp = await handleMcp(new Request("http://localhost:3900/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) }), { rest: t.rest, api: t.api });
    expect(mcp.status).toBe(401);
    // With a key, starts work as before: no 402, no quote.
    await t.topUp();
    const key = await t.key("editor");
    expect((await t.call("POST", START, { key, body: { inputs: HOOK } })).status).toBe(202);
    expect(await t.store.quotes.find()).toEqual([]);
  });

  it("describes x402 in the OpenAPI document", async () => {
    const t = await testX402();
    const doc = (await t.call("GET", "/openapi.json")).json;
    for (const path of ["/agents/{id}/runs", "/pipelines/{id}/runs"]) {
      const op = doc.paths[path].post;
      expect(op["x-x402"]).toMatchObject({ version: 1, scheme: "tx-hash", network: "eip155:4663", paymentHeader: "X-PAYMENT", responseHeader: "X-PAYMENT-RESPONSE" });
      expect(op.security).toEqual([{ apiKey: [] }, {}]);
      expect(op.responses["402"].content["application/json"].schema.oneOf).toEqual([{ $ref: "#/components/schemas/Error" }, { $ref: "#/components/schemas/PaymentRequired" }]);
      expect(Object.keys(op.responses["202"].headers)).toEqual(["X-PAYMENT-RESPONSE", "X-Receipt-Token"]);
    }
    expect(doc.paths["/x402"].get.operationId).toBe("x402Discovery");
    expect(Object.keys(doc.paths).filter((p) => p.startsWith("/x402"))).toHaveLength(6);
    expect(doc.components.securitySchemes.receipt).toMatchObject({ type: "http", scheme: "bearer" });
    expect(doc.components.schemas.PaymentRequired.properties.accepts.items).toEqual({ $ref: "#/components/schemas/PaymentRequirements" });
    expect(doc.components.schemas.X402RunResult.properties.run).toEqual({ $ref: "#/components/schemas/Run" });
    expect(doc.tags.map((x: { name: string }) => x.name)).toContain("x402");
    const refs = JSON.stringify(doc).match(/#\/components\/schemas\/[A-Za-z0-9]+/g) ?? [];
    for (const r of new Set(refs)) expect(doc.components.schemas[r.split("/").pop()!], r).toBeDefined();
  });
});

describe("x402: pieces", () => {
  it("does money in exact whole units", () => {
    expect(usdToScaled("2500")).toBe(BigInt("250000000000"));
    expect(usdToScaled("0.5")).toBe(BigInt(50000000));
    expect(() => usdToScaled("1e3")).toThrow();
    // 4 credits = $0.04 at $2,500 an ETH = 0.000016 ETH exactly.
    expect(atomicForUsd(usdMicroForCredits(4), usdToScaled("2500"), 18)).toBe(BigInt("16000000000000"));
    // Rounded up, never down: $0.01 at $3,000 is 3.333... micro-ETH.
    expect(atomicForUsd(usdMicroForCredits(1), usdToScaled("3000"), 18)).toBe(BigInt("3333333333334"));
    // A stablecoin with 6 decimals.
    expect(atomicForUsd(usdMicroForCredits(4), usdToScaled("1"), 6)).toBe(BigInt(40000));
    expect(usedAmount(BigInt(1000), BigInt(1000), 1, 3)).toBe(BigInt(333));
    expect(usedAmount(BigInt(1000), BigInt(900), 3, 3)).toBe(BigInt(900));
    expect(creditsForAmount(BigInt(667), BigInt(1000), 3)).toBe(2);
    expect(usdWords(BigInt(40000))).toBe("0.04");
    expect(usdWords(BigInt(1234567))).toBe("1.234567");
    expect(unitsWords(BigInt("16000000000000"), 18)).toBe("0.000016");
  });

  it("checks transfers with one set of rules", () => {
    const req: VerifyRequest = { txHash: "0x" + "1".repeat(64), payer: "0xAbC0000000000000000000000000000000000001", asset: NATIVE_ASSET, payTo: PAY_TO, chainId: 4663, required: BigInt(100), issuedAt: new Date(1_000_000_000), expiresAt: new Date(1_000_600_000), minConfirmations: 3, skewSeconds: 120 };
    const t: ObservedTransfer = { chainId: 4663, txHash: req.txHash, from: req.payer.toLowerCase(), to: PAY_TO.toUpperCase().replace("0X", "0x"), asset: NATIVE_ASSET.toLowerCase(), amount: BigInt(100), blockNumber: BigInt(5), blockTime: 1_000_100, confirmations: 3, success: true };
    expect(checkTransfer(t, req).ok).toBe(true);
    expect(checkTransfer({ ...t, amount: BigInt(150) }, req).ok).toBe(true);
    const code = (o: Partial<ObservedTransfer>) => {
      const r = checkTransfer({ ...t, ...o }, req);
      return r.ok ? "ok" : r.code;
    };
    expect(code({ chainId: 1 })).toBe("payment_wrong_chain");
    expect(code({ success: false })).toBe("payment_failed");
    expect(code({ from: "0x" + "9".repeat(40) })).toBe("payment_wrong_payer");
    expect(code({ to: "0x" + "9".repeat(40) })).toBe("payment_wrong_recipient");
    expect(code({ asset: "0x" + "9".repeat(40) })).toBe("payment_wrong_asset");
    expect(code({ confirmations: 2 })).toBe("payment_not_confirmed");
    expect(code({ blockTime: 999_000 })).toBe("payment_too_old");
    expect(code({ blockTime: 999_900 })).toBe("ok");
    expect(code({ blockTime: 1_000_601 })).toBe("payment_too_late");
    expect(code({ amount: BigInt(99) })).toBe("payment_amount_too_low");
  });

  it("reads ETH and token transfers through an RPC reader, with no real chain", async () => {
    const payer = "0x00000000000000000000000000000000000000a1";
    const token = "0x0000000000000000000000000000000000005dc0";
    const hash = "0x" + "c".repeat(64);
    const pad = (a: string) => "0x" + a.slice(2).padStart(64, "0");
    const reader = (o: { chainId?: number; value?: bigint; to?: string; logs?: { address: string; topics: string[]; data: string }[]; missing?: boolean } = {}): ChainReader => ({
      getChainId: async () => o.chainId ?? 4663,
      getTransaction: async () => {
        if (o.missing) throw Object.assign(new Error("Transaction could not be found"), { name: "TransactionNotFoundError" });
        return { from: payer, to: o.to ?? PAY_TO, value: o.value ?? BigInt(500), blockNumber: BigInt(10) };
      },
      getTransactionReceipt: async () => ({ status: "success", blockNumber: BigInt(10), logs: o.logs ?? [] }),
      getBlock: async () => ({ timestamp: BigInt(1_000_100) }),
      getBlockNumber: async () => BigInt(12),
      readContract: async ({ functionName }) => (functionName === "decimals" ? 8 : [BigInt(1), BigInt(250000000000), BigInt(0), BigInt(1_000_000), BigInt(1)]),
    });
    const req: VerifyRequest = { txHash: hash, payer, asset: NATIVE_ASSET, payTo: PAY_TO, chainId: 4663, required: BigInt(500), issuedAt: new Date(1_000_000_000), expiresAt: new Date(1_000_600_000), minConfirmations: 3, skewSeconds: 120 };

    const eth = await lookupOnChain(reader(), req);
    expect(eth).toMatchObject({ ok: true, transfer: { amount: BigInt(500), confirmations: 3, to: PAY_TO, blockTime: 1_000_100 } });
    expect((await onchainVerifier({ rpcUrl: null }, reader())!.verify(req)).ok).toBe(true);
    expect(await lookupOnChain(reader({ chainId: 1 }), req)).toMatchObject({ ok: false, code: "payment_wrong_chain" });
    expect(await lookupOnChain(reader({ missing: true }), req)).toMatchObject({ ok: false, code: "payment_not_found", retry: true });
    const v = onchainVerifier({ rpcUrl: null }, reader({ to: "0x" + "7".repeat(40) }))!;
    expect(await v.verify(req)).toMatchObject({ ok: false, code: "payment_wrong_recipient" });
    expect(v.test).toBe(false);
    expect(onchainVerifier({ rpcUrl: null })).toBeNull();

    // A token: its Transfer logs from the payer to payTo, added up.
    const logs = [
      { address: token, topics: [TRANSFER_TOPIC, pad(payer), pad(PAY_TO)], data: "0x" + (300).toString(16).padStart(64, "0") },
      { address: token, topics: [TRANSFER_TOPIC, pad(payer), pad(PAY_TO)], data: "0x" + (200).toString(16).padStart(64, "0") },
      { address: token, topics: [TRANSFER_TOPIC, pad(payer), pad("0x" + "7".repeat(40))], data: "0x" + (999).toString(16).padStart(64, "0") },
    ];
    const tok = await lookupOnChain(reader({ logs, to: token, value: BigInt(0) }), { ...req, asset: token });
    expect(tok).toMatchObject({ ok: true, transfer: { amount: BigInt(500), asset: token, to: PAY_TO } });
    const none = await onchainVerifier({ rpcUrl: null }, reader({ logs: [], to: token, value: BigInt(0) }))!.verify({ ...req, asset: token });
    expect(none.ok).toBe(false);

    // A Chainlink feed: scaled to 8 decimals, and stale prices refused.
    expect(await readFeed(reader(), token, 3600, 1_000_100)).toBe(BigInt(250000000000));
    expect(await readFeed(reader(), token, 3600, 1_010_000)).toBeNull();
  });

  it("reads X-PAYMENT strictly", () => {
    const ok = { x402Version: 1 as const, scheme: "tx-hash", network: "eip155:4663", payload: { nonce: "x402q_" + "a".repeat(24), txHash: "0x" + "1".repeat(64), payer: PAY_TO, asset: NATIVE_ASSET, signature: "0x" + "2".repeat(130) } };
    expect(decodePaymentHeader(encodePaymentHeader(ok), 4096)).toEqual(ok);
    const bad = (o: object) => () => decodePaymentHeader(encodePaymentHeader({ ...ok, ...o } as typeof ok), 4096);
    expect(bad({ scheme: "exact" })).toThrow(PaymentHeaderError);
    expect(bad({ x402Version: 2 })).toThrow(PaymentHeaderError);
    expect(bad({ payload: { ...ok.payload, txHash: "0x12" } })).toThrow(/txHash/);
    expect(bad({ payload: { ...ok.payload, payer: "me" } })).toThrow(/payer/);
    expect(() => decodePaymentHeader("x".repeat(5000), 4096)).toThrow(/longer/);
    expect(bodyHash({ b: 1, a: { d: 2, c: 3 } })).toBe(bodyHash({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
