/**
 * An end-to-end x402 run against the local server (phase 15), written as a
 * transcript: the 402 with its quote, a payment on the FAKE verifier's
 * pretend chain, the paid call, the receipt, a replay, a reused transfer, an
 * underpayment, a stopped run and a pipeline with a pick.
 *
 * Nothing real: the fake provider answers, the fake verifier checks a
 * pretend chain kept by the local server, and the paying wallet is made in
 * memory for this script and thrown away (its key is never printed or
 * saved). No chain is called and no money moves.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-x402-screens OPENROUTER_API_KEY= WOVI_FAKE_LATENCY_MS=2500 \
 *     WOVI_X402_PAY_TO=0x4020000000000000000000000000000000000402 WOVI_X402_VERIFIER=fake WOVI_X402_ETH_USD=2500 npm start
 *   node scripts/x402-demo.mjs [out.txt]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BASE ?? "http://localhost:3900";
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-x402-screens", "x402-demo.txt");
const API = `${BASE}/api/v1`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const wallet = privateKeyToAccount(generatePrivateKey());
const lines = [];
const say = (...l) => {
  lines.push(...l);
  console.log(l.join("\n"));
};
const short = (v) => (typeof v === "string" && v.length > 22 ? `${v.slice(0, 12)}...${v.slice(-6)}` : v);
const hide = (v) => (typeof v === "string" ? v.replace(/wovi_rt_[A-Za-z0-9_-]+/g, "wovi_rt_...(kept, not printed)") : v);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const unb64 = (s) => JSON.parse(Buffer.from(s, "base64").toString("utf8"));

/** One request, printed like an HTTP exchange with the parts that matter. */
async function http(method, path, { body, headers = {}, show } = {}) {
  const h = { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers };
  const res = await fetch(`${API}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  const sent = Object.entries(headers).map(([k, v]) => `  ${k}: ${k === "x-payment" ? `${v.slice(0, 32)}... (base64, ${v.length} chars)` : hide(v)}`);
  say(`> ${method} /api/v1${path}`, ...sent, ...(body !== undefined ? [`  ${JSON.stringify(body)}`] : []));
  const keep = ["location", "x-payment-response", "x-receipt-token", "retry-after"];
  const got = keep.filter((k) => res.headers.get(k)).map((k) => `  ${k}: ${k === "x-receipt-token" ? "wovi_rt_...(kept, not printed)" : res.headers.get(k)}${k === "x-payment-response" ? `\n    = ${JSON.stringify(unb64(res.headers.get(k)))}` : ""}`);
  say(`< ${res.status} ${res.statusText}`, ...got);
  if (json && show) say(...JSON.stringify(show(json), null, 2).split("\n").map((l) => `  ${l}`));
  say("");
  return { status: res.status, headers: res.headers, json };
}

/** Pays a quote the way a client would: send the transfer, sign the quote message, build X-PAYMENT. */
async function pay(req, o = {}) {
  const sent = await http("POST", "/x402/dev/transfers", { body: { from: wallet.address, amount: o.amount ?? req.maxAmountRequired }, show: (j) => j });
  const txHash = o.txHash ?? sent.json.txHash;
  const message = req.extra.sign.replace("{txHash}", txHash.toLowerCase());
  const signature = await wallet.signMessage({ message });
  say(`# The wallet signs extra.sign with the transaction filled in (EIP-191):`, ...message.split("\n").map((l) => `#   ${l}`), "");
  return { txHash, header: b64({ x402Version: 1, scheme: req.scheme, network: req.network, payload: { nonce: req.extra.nonce, txHash, payer: wallet.address, asset: req.asset, signature } }) };
}

const quoteView = (j) => ({ x402Version: j.x402Version, code: j.code, error: j.error, accepts: j.accepts.map((a) => ({ scheme: a.scheme, network: a.network, maxAmountRequired: a.maxAmountRequired, payTo: a.payTo, asset: a.asset, maxTimeoutSeconds: a.maxTimeoutSeconds, extra: { ...a.extra, nonce: short(a.extra.nonce), sign: "(the message to sign, below)" } })) });
const errView = (j) => ({ code: j.code ?? j.error?.code, error: typeof j.error === "string" ? j.error : j.error?.message, newQuote: j.accepts?.[0] ? short(j.accepts[0].extra.nonce) : undefined });

say(
  "# WOVI x402: pay per call with no account, against the local server.",
  "# The FAKE verifier and a pretend chain: no chain is called and no money moves.",
  `# The paying wallet ${wallet.address} was made in memory for this run only.`,
  "",
);

/* Discovery */
await http("GET", "/x402", { show: (j) => ({ enabled: j.enabled, test: j.test, scheme: j.scheme, network: j.network, payTo: j.payTo, assets: j.assets, confirmations: j.confirmations, endpoints: j.endpoints.map((e) => ({ path: `${e.method} ${e.path}`, prices: e.prices.slice(0, 3).map((p) => `${p.id}: ${p.credits} credits, $${p.usd}`) })), mcp: j.mcp }) });

/* 1. A run of the Hook Writer */
const body = { inputs: { idea: "We stopped taking wedding cake orders so the bakery could open at 6 a.m. again.", platform: "tiktok" } };
say("## 1. Ask without a key: 402 and a quote");
const q1 = await http("POST", "/agents/hook-writer/runs", { body, show: quoteView });
if (q1.status !== 402) throw new Error("expected a 402");
const req1 = q1.json.accepts[0];

say("## 2. Pay the quote on the (pretend) chain, then send the same call with X-PAYMENT");
const p1 = await pay(req1);
const started = await http("POST", "/agents/hook-writer/runs", { body, headers: { "x-payment": p1.header }, show: (j) => ({ id: j.id, status: j.status, agent: j.agent }) });
if (started.status !== 202) throw new Error(`expected 202, got ${started.status}`);
const receipt = started.headers.get("x-receipt-token");
const runId = started.json.id;

say("## 3. Read it with the receipt token until it is done");
for (let i = 0; i < 80; i++) {
  const r = await (await fetch(`${API}/x402/runs/${runId}`, { headers: { authorization: `Bearer ${receipt}` } })).json();
  if (["succeeded", "failed", "cancelled"].includes(r.run.status) && r.payment.status !== "running") break;
  await sleep(400);
}
say("# (polled until it finished)", "");
await http("GET", `/x402/runs/${runId}`, { headers: { authorization: `Bearer ${receipt}` }, show: (j) => ({ run: { id: j.run.id, status: j.run.status, ready: j.run.ready, quality: j.run.quality && { score: j.run.quality.score, bar: j.run.quality.bar }, firstHook: j.run.output?.items?.[0] }, payment: { ...j.payment, transaction: short(j.payment.transaction) } }) });

say("## 4. The same X-PAYMENT again (a lost answer): the same run, no second charge");
await http("POST", "/agents/hook-writer/runs", { body, headers: { "x-payment": p1.header }, show: (j) => ({ id: j.id, sameRun: j.id === runId }) });

say("## 5. The same transfer for a new quote: refused");
const q2 = await http("POST", "/agents/hook-writer/runs", { body, show: (j) => ({ code: j.code, nonce: short(j.accepts[0].extra.nonce) }) });
const reuseSig = await wallet.signMessage({ message: q2.json.accepts[0].extra.sign.replace("{txHash}", p1.txHash.toLowerCase()) });
await http("POST", "/agents/hook-writer/runs", { body, headers: { "x-payment": b64({ x402Version: 1, scheme: "tx-hash", network: "eip155:4663", payload: { nonce: q2.json.accepts[0].extra.nonce, txHash: p1.txHash, payer: wallet.address, asset: q2.json.accepts[0].asset, signature: reuseSig } }) }, show: errView });

say("## 6. Paying too little: refused, and recorded as owed back to the payer");
const q3 = q2.json.accepts[0];
const p3 = await pay(q3, { amount: String(BigInt(q3.maxAmountRequired) / 2n) });
await http("POST", "/agents/hook-writer/runs", { body, headers: { "x-payment": p3.header }, show: errView });

say("## 7. A paid run stopped with its receipt: what it held is owed back");
const capBody = { inputs: { post: "Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight.", platforms: ["tiktok"], length: "short" } };
const q4 = await http("POST", "/agents/caption-writer/runs", { body: capBody, show: (j) => ({ code: j.code, credits: j.accepts[0].extra.credits, priceUsd: j.accepts[0].extra.priceUsd, maxAmountRequired: j.accepts[0].maxAmountRequired }) });
const p4 = await pay(q4.json.accepts[0]);
const s4 = await http("POST", "/agents/caption-writer/runs", { body: capBody, headers: { "x-payment": p4.header }, show: (j) => ({ id: j.id, status: j.status }) });
await http("POST", `/x402/runs/${s4.json.id}/cancel`, { headers: { authorization: `Bearer ${s4.headers.get("x-receipt-token")}` }, show: (j) => ({ run: { id: j.run.id, status: j.run.status }, payment: { status: j.payment.status, charged: j.payment.charged, refund: j.payment.refund } }) });
await sleep(1500);
await http("GET", `/x402/runs/${s4.json.id}`, { headers: { authorization: `Bearer ${s4.headers.get("x-receipt-token")}` }, show: (j) => ({ run: { status: j.run.status }, payment: { status: j.payment.status, charged: j.payment.charged, refund: j.payment.refund } }) });

say("## 8. A pipeline, paid the same way, with a pick");
const pipeBody = { inputs: { post: "Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight.", platform: "tiktok" } };
const q5 = await http("POST", "/pipelines/caption-and-tags/runs", { body: pipeBody, show: (j) => ({ code: j.code, credits: j.accepts[0].extra.credits, priceUsd: j.accepts[0].extra.priceUsd }) });
const p5 = await pay(q5.json.accepts[0]);
const s5 = await http("POST", "/pipelines/caption-and-tags/runs", { body: pipeBody, headers: { "x-payment": p5.header }, show: (j) => ({ id: j.id, status: j.status }) });
const r5 = s5.headers.get("x-receipt-token");
for (let i = 0; i < 120; i++) {
  const r = await (await fetch(`${API}/x402/pipeline-runs/${s5.json.id}`, { headers: { authorization: `Bearer ${r5}` } })).json();
  if (r.pipelineRun.status !== "running") break;
  await sleep(400);
}
say("# (polled until a step waits for a pick)", "");
await http("POST", `/x402/pipeline-runs/${s5.json.id}/pick`, { body: { index: 0 }, headers: { authorization: `Bearer ${r5}` }, show: (j) => ({ status: j.pipelineRun.status }) });
for (let i = 0; i < 120; i++) {
  const r = await (await fetch(`${API}/x402/pipeline-runs/${s5.json.id}`, { headers: { authorization: `Bearer ${r5}` } })).json();
  if (r.pipelineRun.status !== "running" && r.payment.status !== "running") break;
  await sleep(400);
}
say("# (polled until it was ready)", "");
await http("GET", `/x402/pipeline-runs/${s5.json.id}`, { headers: { authorization: `Bearer ${r5}` }, show: (j) => ({ status: j.pipelineRun.status, package: j.pipelineRun.package?.map((p) => p.step), payment: { status: j.payment.status, credits: j.payment.credits, charged: j.payment.charged, refund: j.payment.refund } }) });

say("## 9. A call that sends a key is never quoted: a wrong key is 401, as before. MCP stays on keys.");
await http("POST", "/agents/hook-writer/runs", { body, headers: { authorization: "Bearer wovi_sk_" + "x".repeat(43) }, show: (j) => j });

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join("\n") + "\n");
console.error(`wrote ${OUT}`);
