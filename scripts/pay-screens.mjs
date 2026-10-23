/**
 * Screen-sized screenshots of paying for credits with USDC, ETH and a card,
 * with headless Chrome over the DevTools protocol, at 1440x900 and 390x844,
 * each checked for sideways scroll.
 *
 *   node scripts/pay-screens.mjs chain    # USDC and ETH on a local fork of Robinhood Chain
 *   node scripts/pay-screens.mjs nousdc   # the launch state: USDC not available yet, ETH on
 *   node scripts/pay-screens.mjs card     # cards through Stripe in test mode, against a local stand-in for Stripe's API
 *
 * chain: start the server with WOVI_PAY_RPC_URL (and FORK_RPC here) on a LOCAL anvil fork, WOVI_PAY_TO a throwaway
 * address, WOVI_USDC_ADDRESS a stand-in 6-decimal token deployed on that fork, and WOVI_BUILDER_EMAILS=maya@example.com.
 * The wallet injected into the page answers with FORK_USER_KEY, a throwaway key funded on the fork only. Nothing
 * here touches the real chain: FORK_RPC must be http://127.0.0.1:<port>.
 *
 * card: start the server with a made-up STRIPE_SECRET_KEY=sk_test_..., STRIPE_WEBHOOK_SECRET=whsec_... (the same
 * value in this script's env) and STRIPE_API_BASE=http://127.0.0.1:12111. This script answers Stripe's API calls
 * there (a Checkout Session, a refund) and signs the webhook the way Stripe does. No request goes to Stripe.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Stripe from "stripe";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const MODE = process.argv[2] ?? "chain";
const OUT = process.argv[3] ?? join(process.env.HOME, "WOVI-pay-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "maya@example.com";
const PORT = Number(process.env.CDP_PORT ?? 9371);
mkdirSync(OUT, { recursive: true });

/* ---------- The wallet (chain mode, the local fork only) ---------- */
let user = null;
let walletClient = null;
if (MODE === "chain" || MODE === "nousdc") {
  const rpc = process.env.FORK_RPC;
  if (!rpc || !/^http:\/\/127\.0\.0\.1:\d+$/.test(rpc)) throw new Error("FORK_RPC must be the local fork, http://127.0.0.1:<port>");
  user = privateKeyToAccount(process.env.FORK_USER_KEY);
  const chain = { id: 4663, name: "Robinhood Chain (local fork)", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
  walletClient = createWalletClient({ account: user, chain, transport: http(rpc) });
}

/* ---------- A stand-in for Stripe's API on this machine (card mode) ---------- */
const sessions = new Map();
let stripeServer = null;
if (MODE === "card") {
  let n = 0;
  stripeServer = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const p = new URLSearchParams(body);
      const json = (code, obj) => {
        res.writeHead(code, { "content-type": "application/json", "request-id": `req_${++n}` });
        res.end(JSON.stringify(obj));
      };
      if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
        const id = `cs_test_${Date.now()}${++n}`;
        const s = { id, object: "checkout.session", topUpId: p.get("client_reference_id"), workspaceId: p.get("metadata[workspaceId]"), credits: p.get("metadata[credits]"), amount: Number(p.get("line_items[0][price_data][unit_amount]")), success: p.get("success_url"), name: p.get("line_items[0][price_data][product_data][name]"), suffix: p.get("payment_intent_data[statement_descriptor_suffix]") };
        sessions.set(id, s);
        console.log("stripe stand-in: session", id, s.name, s.amount, "suffix", s.suffix);
        return json(200, { id, object: "checkout.session", url: `http://127.0.0.1:12111/pay/${id}` });
      }
      if (req.method === "POST" && req.url === "/v1/refunds") {
        console.log("stripe stand-in: refund", p.get("payment_intent"), p.get("amount"));
        return json(200, { id: `re_test_${++n}`, object: "refund", status: "succeeded", amount: Number(p.get("amount")) });
      }
      if (req.method === "GET" && req.url.startsWith("/pay/")) {
        const s = sessions.get(req.url.slice(5));
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;margin:0;background:#f6f9fc;color:#30313d"><div style="max-width:420px;margin:40px auto;padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08)"><p style="margin:0 0 4px;color:#6b7280">Stripe test mode (a local stand-in for these screenshots)</p><h1 style="font-size:22px;margin:0 0 4px">${s?.name ?? "WOVI credits"}</h1><p style="font-size:32px;font-weight:700;margin:0 0 20px">$${((s?.amount ?? 0) / 100).toFixed(2)}</p><div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px">4242 4242 4242 4242 &nbsp; 12/34 &nbsp; 123</div><button style="width:100%;padding:14px;border:0;border-radius:8px;background:#0B1230;color:#fff;font-size:16px">Pay</button></div>`);
      }
      json(404, { error: { type: "invalid_request_error", message: "not in the stand-in" } });
    });
  }).listen(12111, "127.0.0.1");
}

/** A webhook call signed with the endpoint's secret, as Stripe sends it. */
async function webhook(type, object) {
  const payload = JSON.stringify({ id: `evt_${Date.now()}${Math.random().toString(16).slice(2, 8)}`, object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const r = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
  const text = await r.text();
  console.log("webhook", type, r.status, text);
  if (r.status !== 200) throw new Error("webhook refused");
}

const paidSession = (s) => ({ id: s.id, object: "checkout.session", mode: "payment", client_reference_id: s.topUpId, metadata: { topUpId: s.topUpId, workspaceId: s.workspaceId, credits: s.credits }, payment_status: "paid", status: "complete", amount_total: s.amount, currency: "usd", currency_conversion: null, payment_intent: `pi_test_${s.topUpId}`, livemode: false });

/* ---------- Chrome ---------- */
const profile = join(tmpdir(), `wovi-pay-shots-${process.pid}`);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--lang=en-US", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
// Chrome goes away with this script, also when a step fails.
process.on("exit", () => chrome.kill("SIGKILL"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await target());
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method) {
    events.forEach((fn) => fn(msg));
  }
};
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""));
  return r.result?.value;
}

await send("Page.enable");
await send("Runtime.enable");

/* The injected wallet (desktop only): an EIP-1193 provider answered by this script with the fork key. */
let signDelay = 0;
if (user) {
  await send("Runtime.addBinding", { name: "__woviBridge" });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      if (/iPhone|Android/.test(navigator.userAgent)) return;
      let n = 0; const waiting = new Map();
      window.__woviReply = (id, result, error) => { const w = waiting.get(id); if (!w) return; waiting.delete(id); error ? w.reject(Object.assign(new Error(error.message), { code: error.code })) : w.resolve(result); };
      window.ethereum = { isMetaMask: true, request: ({ method, params }) => new Promise((resolve, reject) => { const id = ++n; waiting.set(id, { resolve, reject }); window.__woviBridge(JSON.stringify({ id, method, params: params ?? [] })); }) };
    })();`,
  });
  events.push(async (msg) => {
    if (msg.method !== "Runtime.bindingCalled" || msg.params.name !== "__woviBridge") return;
    const { id, method, params } = JSON.parse(msg.params.payload);
    let result = null;
    let error = null;
    try {
      if (method === "eth_requestAccounts" || method === "eth_accounts") result = [user.address];
      else if (method === "eth_chainId") result = "0x1237";
      else if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") result = null;
      else if (method === "personal_sign") result = await user.signMessage({ message: { raw: params[0] } });
      else if (method === "eth_sendTransaction") {
        if (signDelay) await sleep(signDelay);
        const tx = params[0];
        result = await walletClient.sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value ?? "0x0") });
        console.log("wallet sent", result);
      } else error = { code: 4200, message: `not supported here: ${method}` };
    } catch (e) {
      error = { code: -32000, message: String(e.message).slice(0, 200) };
    }
    await send("Runtime.evaluate", { expression: `window.__woviReply(${id}, ${JSON.stringify(result)}, ${JSON.stringify(error)})`, contextId: msg.params.executionContextId });
  });
}

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  await send("Emulation.setUserAgentOverride", {
    userAgent: mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: mobile ? "coarse" : "fine" }] });
}

function untilLoad() {
  return new Promise((resolve) => {
    const fn = (msg) => {
      if (msg.method === "Page.loadEventFired") {
        events.splice(events.indexOf(fn), 1);
        resolve();
      }
    };
    events.push(fn);
  });
}

async function open(path, theme = "night") {
  const loaded = untilLoad();
  await send("Page.navigate", { url: path.startsWith("http") ? path : `${BASE}${path}` });
  await loaded;
  if (!path.startsWith("http://127.0.0.1:12111")) await evaluate(`(async () => { localStorage.setItem("wovi-theme", "${theme}"); document.documentElement.setAttribute("data-theme", "${theme}"); await document.fonts.ready; return true; })()`);
  await sleep(700);
}

async function clickText(text, tag = "button", nth = 0) {
  await evaluate(`(() => { const all = [...document.querySelectorAll(${JSON.stringify(tag)})].filter((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})); const el = all[${nth}]; if (!el) throw new Error("no ${tag} with text " + ${JSON.stringify(text)}); el.click(); return true; })()`);
}
async function clickSel(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("no element " + ${JSON.stringify(selector)}); el.click(); return true; })()`);
}
async function type(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("no element " + ${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true; })()`);
}
async function waitFor(expression, ms = 60000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(150);
  }
  const where = await evaluate(`location.href + " | " + document.body.innerText.slice(0, 400)`).catch(() => "?");
  throw new Error("timed out waiting for " + expression + " on " + where);
}
async function scrollTo(selector, offset = 0) {
  await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("no element " + ${JSON.stringify(selector)});
      const y = el.getBoundingClientRect().top + window.scrollY - 76 - 16 + (${offset});
      window.scrollTo({ top: y, behavior: "instant" }); return y; })()`,
  );
}
async function dismissToasts() {
  await evaluate(`(() => { document.querySelectorAll('button[aria-label="Dismiss"]').forEach((b) => b.click()); return true; })()`);
}
async function shot(name, settle = 1200, keepToasts = false) {
  if (!keepToasts) await dismissToasts();
  await sleep(settle);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("wrote", `${name}.png`);
}
const has = (text) => `document.body.textContent.includes(${JSON.stringify(text)})`;
const path = (p) => `location.pathname === ${JSON.stringify(p)}`;

function latestCode(to) {
  const dir = join(DATA, "mail");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(`${to}.txt`))
    .sort();
  if (!files.length) throw new Error(`no mail to ${to} in ${dir}`);
  const code = /code: (\d{6})/.exec(readFileSync(join(dir, files[files.length - 1]), "utf8"))?.[1];
  if (!code) throw new Error("no code");
  return code;
}

async function noSideScroll() {
  const over = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  if (over > 1) {
    const wide = await evaluate(`[...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => e.tagName + "." + String(e.className).slice(0, 60)).join(" | ")`);
    console.warn(`WARNING: the page scrolls sideways by ${over}px on ${await evaluate("location.pathname")}: ${wide}`);
  }
}

async function signIn(next) {
  await open(`/sign-in?next=${encodeURIComponent(next)}`);
  if (await evaluate(path(next))) return;
  await waitFor(`document.querySelector('input[name="email"]')`);
  await type('input[name="email"]', EMAIL);
  await clickText("Email me a sign-in link");
  await waitFor(has("We sent a link and a six-digit code"), 20000);
  await sleep(500);
  await type('input[name="code"]', latestCode(EMAIL));
  await clickText("Sign in");
  await waitFor(`location.pathname === "/app/welcome" || location.pathname === ${JSON.stringify(next)}`, 30000);
  if (await evaluate(path("/app/welcome"))) {
    await waitFor(has("Hi, I am Wovi"));
    await clickText("Skip for now");
    await waitFor(path("/app"), 30000);
  }
}

/** Ticks the purchase consent in a section. */
async function consent(section) {
  await evaluate(`(() => { const b = document.querySelector('${section} input[type=checkbox]'); if (!b.checked) b.click(); return true; })()`);
  await sleep(200);
}

async function linkWallet() {
  await open("/account");
  if (await evaluate(has(user.address))) return;
  await clickText("Link a wallet");
  await waitFor(has("Wallet linked"), 30000);
  await sleep(1000);
}

/** One payment from the injected wallet on the desktop: the price, the wallet step, the paid state. */
async function payDesktop(asset, pack, prefix) {
  await open("/app/credits");
  await waitFor(`document.querySelector("#pay-chain")`);
  if (asset === "eth") await clickSel('#pay-chain [role=radio]:nth-child(2)');
  await consent("#pay-chain");
  await scrollTo("#pay-chain", -8);
  await shot(`${prefix}-1-pick`, 900);
  await clickSel(`#pay-chain button[aria-label="Pay for ${pack.toLocaleString("en-US")} credits with ${asset === "eth" ? "ETH" : "USDC"}"]`);
  await waitFor(has("Send from my wallet"), 30000);
  await scrollTo("#pay-chain", -8);
  await shot(`${prefix}-2-price`, 900);
  signDelay = 2500;
  await clickText("Send from my wallet");
  await waitFor(has("Confirm the payment in your wallet"), 20000);
  await shot(`${prefix}-3-confirm-in-wallet`, 300);
  signDelay = 0;
  await waitFor(has("Waiting for Robinhood Chain"), 30000);
  await shot(`${prefix}-4-waiting-for-chain`, 200);
  await waitFor(`document.querySelector("#pay-chain [role=status]")?.textContent.includes("added") || document.querySelector('#pay-chain [role=alert]')`, 120000);
  const problem = await evaluate(`document.querySelector('#pay-chain [role=alert]')?.textContent ?? ""`);
  if (problem) throw new Error("the payment was not counted: " + problem);
  await scrollTo("#pay-chain", -8);
  await shot(`${prefix}-5-paid`, 900);
}

if (MODE === "chain") {
  await setViewport(1440, 900, false);
  await signIn("/account");
  await linkWallet();

  // The credits page with both ways side by side with $WOVI and cards.
  await open("/app/credits");
  await waitFor(`document.querySelector("#pay-chain")`);
  await noSideScroll();
  await shot("01-credits-desktop", 1500);
  await scrollTo("#pay-chain", -8);
  await shot("02-usdc-eth-desktop", 1200);

  await payDesktop("usdc", 500, "03-usdc-desktop");
  await payDesktop("eth", 1000, "04-eth-desktop");

  await open("/app/credits");
  await scrollTo('[aria-label="History"]', -8);
  await shot("05-history-desktop", 1200);
  await scrollTo("#withdraw", -8);
  await shot("05-withdraw-list-desktop", 1200);

  // A phone: no wallet in the browser, so the transaction is pasted (sent here from the fork key).
  await setViewport(390, 844, true);
  await open("/app/credits");
  await noSideScroll();
  await scrollTo("#pay-chain", -8);
  await shot("06-usdc-eth-phone", 1200);
  await clickSel('#pay-chain [role=radio]:nth-child(2)');
  await consent("#pay-chain");
  await clickSel('#pay-chain button[aria-label="Pay for 500 credits with ETH"]');
  await waitFor(has("Send from my wallet"), 30000);
  await scrollTo("#pay-chain", -8);
  await noSideScroll();
  await shot("07-eth-price-phone", 1200);
  const amount = await evaluate(`document.querySelector("#pay-chain b").textContent`);
  const payTo = process.env.WOVI_PAY_TO;
  const wei = (() => {
    const [w, f = ""] = amount.replace(/[^0-9.]/g, "").split(".");
    return BigInt(w) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
  })();
  const hash = await walletClient.sendTransaction({ to: payTo, value: wei });
  console.log("sent from the script", hash, wei);
  await type('#pay-chain input[name="tx"]', hash);
  await sleep(300);
  await clickText("Check");
  await waitFor(`document.querySelector("#pay-chain [role=status]")?.textContent.includes("added") || document.querySelector('#pay-chain [role=alert]')`, 120000);
  const problem = await evaluate(`document.querySelector('#pay-chain [role=alert]')?.textContent ?? ""`);
  if (problem) throw new Error("the phone payment was not counted: " + problem);
  await scrollTo("#pay-chain", -8);
  await shot("08-eth-paid-phone", 1200);

  // The owner's page: card, USDC and ETH status.
  await setViewport(1440, 900, false);
  await open("/app/settings/token");
  await scrollTo('[aria-label="Card payments"]', -8);
  await noSideScroll();
  await shot("09-owner-payments-desktop", 1200);
  await setViewport(390, 844, true);
  await open("/app/settings/token");
  await scrollTo('[aria-label="USDC and ETH payments"]', -8);
  await noSideScroll();
  await shot("10-owner-usdc-eth-phone", 1200);
} else if (MODE === "nousdc") {
  await setViewport(1440, 900, false);
  await signIn("/app/credits");
  await open("/app/credits");
  await scrollTo("#pay-chain", -8);
  await noSideScroll();
  await shot("11-launch-state-usdc-not-yet-desktop", 1200);
  await setViewport(390, 844, true);
  await open("/app/credits");
  await scrollTo("#pay-chain", -8);
  await noSideScroll();
  await shot("11-launch-state-usdc-not-yet-phone", 1200);
} else if (MODE === "card") {
  await setViewport(1440, 900, false);
  await signIn("/app/credits");
  await open("/app/credits");
  await waitFor(has("Stripe test mode"));
  await noSideScroll();
  await shot("20-card-packs-desktop", 1500);
  await consent("#top-up");
  await clickSel('#top-up button[aria-label^="Pay by card: 1,000 credits"]');
  await waitFor(`location.host === "127.0.0.1:12111"`, 30000);
  await sleep(500);
  await shot("21-card-stripe-standin-desktop", 600);
  const s = [...sessions.values()].at(-1);
  // Back from the page before Stripe's webhook: the waiting note.
  await open(s.success.replace("{CHECKOUT_SESSION_ID}", s.id));
  await waitFor(has("Your credits land as soon as Stripe confirms"));
  await scrollTo("#top-up", -8);
  await shot("22-card-back-waiting-desktop", 900);
  await webhook("checkout.session.completed", paidSession(s));
  await waitFor(has("credits are in your balance"), 30000);
  await scrollTo("#top-up", -8);
  await shot("23-card-paid-desktop", 1200);
  await open("/app/credits");
  await scrollTo('[aria-label="History"]', -8);
  await shot("24-card-history-desktop", 1200);

  // Withdraw from it, then the owner refunds it to the card through Stripe.
  await scrollTo("#withdraw", -8);
  await clickText("Withdraw from this purchase");
  await sleep(300);
  await clickText("Confirm withdrawal");
  await waitFor(has("Withdrawn:"), 20000);
  await open("/app/settings/safety");
  await waitFor(has("Refund to the card through Stripe"));
  await scrollTo('[aria-label="Money owed back"]', -8);
  await shot("25-owner-refund-button-desktop", 1200);
  await clickText("Refund to the card through Stripe");
  await waitFor(has("Refunded through Stripe ("), 20000);
  await shot("26-owner-refunded-desktop", 1200, true);
  await open("/app/settings/token");
  await scrollTo('[aria-label="Card payments"]', -8);
  await shot("27-owner-card-status-desktop", 1200);

  // A phone.
  await setViewport(390, 844, true);
  await open("/app/credits");
  await noSideScroll();
  await scrollTo("#top-up", -8);
  await shot("28-card-packs-phone", 1500);
  await consent("#top-up");
  await clickSel('#top-up button[aria-label^="Pay by card: 500 credits"]');
  await waitFor(`location.host === "127.0.0.1:12111"`, 30000);
  const s2 = [...sessions.values()].at(-1);
  await webhook("checkout.session.completed", paidSession(s2));
  await open(s2.success.replace("{CHECKOUT_SESSION_ID}", s2.id));
  await waitFor(has("credits are in your balance"), 30000);
  await scrollTo("#top-up", -8);
  await noSideScroll();
  await shot("29-card-paid-phone", 1200);
}

ws.close();
chrome.kill();
stripeServer?.close();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
