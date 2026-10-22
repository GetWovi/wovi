/**
 * Screen-sized screenshots of $WOVI on the site (phase 17) with headless
 * Chrome over the DevTools protocol, at 1440x900 and 390x844, each checked
 * for sideways scroll and a header overlap.
 *
 *   node scripts/token-screens.mjs soon       # server with WOVI_TOKEN_PAGE=on and no contracts
 *   node scripts/token-screens.mjs deployed   # server pointed at a local fork with the contracts deployed, not launched
 *   node scripts/token-screens.mjs pay        # the same fork after the launch and trades: link, holder credits, pay
 *   node scripts/token-screens.mjs live       # after burns: the live page and the owner's keeper card (docs/token.md)
 *
 * Pay and live sign in as a builder (start the server with WOVI_BUILDER_EMAILS=maya@example.com) and drives a wallet
 * injected into the page: a throwaway key from the fork rehearsal (FORK_KEYS, the line named "user"), signing and
 * sending on the local fork at FORK_RPC only. It never touches the live chain, and nothing it holds is real.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const MODE = process.argv[2] ?? "live";
const OUT = process.argv[3] ?? join(process.env.HOME, "WOVI-token-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "maya@example.com";
const PORT = 9357;
mkdirSync(OUT, { recursive: true });

/* ---------- The wallet in the page (live mode only, on the local fork) ---------- */
let user = null;
let walletClient = null;
if (MODE === "pay" || MODE === "live") {
  const rpc = process.env.FORK_RPC;
  if (!rpc || !/^http:\/\/127\.0\.0\.1:\d+$/.test(rpc)) throw new Error("FORK_RPC must be the local fork, http://127.0.0.1:<port>");
  const line = readFileSync(process.env.FORK_KEYS, "utf8")
    .split("\n")
    .find((l) => l.startsWith("user "));
  user = privateKeyToAccount(line.split(" ")[2]);
  const chain = { id: 4663, name: "Robinhood Chain (local fork)", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
  walletClient = createWalletClient({ account: user, chain, transport: http(rpc) });
}

const profile = join(tmpdir(), `wovi-token-shots-${process.pid}`);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--lang=en-US", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });

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

/* The injected wallet: an EIP-1193 provider whose requests go to this script, which answers with the fork key. */
let signDelay = 0;
if (MODE === "pay" || MODE === "live") {
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
      else if (method === "personal_sign") {
        if (signDelay) await sleep(signDelay);
        result = await user.signMessage({ message: { raw: params[0] } });
      } else if (method === "eth_sendTransaction") {
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

async function applyTheme(theme) {
  await evaluate(`(async () => { localStorage.setItem("wovi-theme", "${theme}"); document.documentElement.setAttribute("data-theme", "${theme}"); await document.fonts.ready; return true; })()`);
}

async function open(path, theme = "night") {
  const loaded = untilLoad();
  await send("Page.navigate", { url: `${BASE}${path}` });
  await loaded;
  await applyTheme(theme);
  await sleep(700);
}

async function clickText(text, tag = "button", nth = 0) {
  await evaluate(`(() => { const all = [...document.querySelectorAll(${JSON.stringify(tag)})].filter((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})); const el = all[${nth}]; if (!el) throw new Error("no ${tag} with text " + ${JSON.stringify(text)}); el.click(); return true; })()`);
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
  const where = await evaluate(`location.href + " | " + document.body.innerText.slice(0, 300)`).catch(() => "?");
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
  const overlap = await evaluate(`(() => { const logo = document.querySelector('header a[aria-label="WOVI home"]'); const nav = document.querySelector('header nav a'); if (!logo || !nav || getComputedStyle(nav.parentElement).display === "none") return 0; return logo.getBoundingClientRect().right - nav.getBoundingClientRect().left; })()`);
  if (overlap > 0) console.warn(`WARNING: the logo overlaps the nav by ${overlap}px on ${await evaluate("location.pathname")}`);
  const over = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  if (over > 1) {
    const wide = await evaluate(`[...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => e.tagName + "." + String(e.className).slice(0, 60)).join(" | ")`);
    console.warn(`WARNING: the page scrolls sideways by ${over}px on ${await evaluate("location.pathname")}: ${wide}`);
  }
}

async function signIn(next) {
  await open(`/sign-in?next=${encodeURIComponent(next)}`);
  // Signed in already (the sign-in page sends a session on): nothing to do.
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

/* ---------- The three states of /token ---------- */
const stateShots = async (prefix, waitText) => {
  await setViewport(1440, 900, false);
  await open("/token");
  await waitFor(has(waitText));
  await noSideScroll();
  await shot(`${prefix}-desktop`, 1500);
  await setViewport(390, 844, true);
  await open("/token");
  await waitFor(has(waitText));
  await noSideScroll();
  await shot(`${prefix}-phone`, 1500);
};

if (MODE === "soon") {
  await stateShots("01-token-soon", "Before the contracts");
} else if (MODE === "deployed") {
  await stateShots("02-token-deployed", "Deployed, not launched");
  await setViewport(1440, 900, false);
  await open("/token");
  await scrollTo("#addresses", -8);
  await shot("02-token-deployed-addresses", 1200);
} else if (MODE === "pay") {
  /* 04 The wallet link: before, while the wallet asks for a signature, and after with the badge */
  await setViewport(1440, 900, false);
  await signIn("/account");
  await open("/account");
  await scrollTo("#wovi", -60);
  await waitFor(has("Not a holder yet"));
  await noSideScroll();
  await shot("04-link-1-before", 1200);
  signDelay = 4000;
  await clickText("Link a wallet");
  await waitFor(has("Sign the message in your wallet"), 20000);
  await shot("04-link-2-sign-in-wallet", 300);
  signDelay = 0;
  await waitFor(has("Wallet linked"), 30000);
  await sleep(1500);
  await open("/account");
  await scrollTo("#wovi", -60);
  await waitFor(has("$WOVI holder"));
  await shot("04-link-3-holder-badge", 1200);

  /* 05 The owner's holder check: this month's snapshot and holder credits */
  await open("/app/settings/token");
  await waitFor(has("Holders"));
  await clickText("Check holders now");
  await waitFor(has("Holders checked."), 60000);

  /* 06 Credits: holder credits beside paid credits, and paying with $WOVI */
  await open("/app/credits");
  await waitFor(has("Holder credits"));
  await noSideScroll();
  await shot("06-credits-holder", 1500);
  await scrollTo("#pay-wovi", -8);
  await shot("06-credits-pay-with-wovi", 1200);
  await evaluate(`(() => { const b = document.querySelector('button[aria-label="Pay for 500 credits with $WOVI"]'); b.click(); return true; })()`);
  await waitFor(has("Send from my wallet"), 30000);
  await scrollTo("#pay-wovi", -8);
  await shot("06-credits-pay-quote", 1200);
  signDelay = 2500;
  await clickText("Send from my wallet");
  await waitFor(has("Confirm the transfer in your wallet"), 20000);
  await shot("06-credits-pay-confirm-in-wallet", 300);
  signDelay = 0;
  await waitFor(has("500 credits added") + " || document.querySelector('[role=alert]')", 120000);
  const problem = await evaluate(`document.querySelector('#pay-wovi [role=alert]')?.textContent ?? ""`);
  if (problem) throw new Error("the payment was not counted: " + problem);
  await shot("06-credits-paid-toast", 400, true);
  await open("/app/credits");
  await waitFor(has("Holder credits"));
  await shot("06-credits-after-paying", 1500);
  await scrollTo('[aria-label="History"]', -8);
  await shot("06-credits-history", 1200);

  /* 07 Phones: the holder card and credits */
  await setViewport(390, 844, true);
  await open("/account");
  await scrollTo("#wovi", -60);
  await noSideScroll();
  await shot("07-phone-account-holder", 1500);
  await open("/app/credits");
  await noSideScroll();
  await shot("07-phone-credits", 1500);
  await scrollTo("#holder-credits", -8);
  await shot("07-phone-credits-holder", 1200);
} else {
  /* 03 The live page: the top, the next burn, the burns, the addresses and the perks, then a phone */
  await setViewport(1440, 900, false);
  await signIn("/app/settings/token");
  await open("/token");
  await waitFor(has("Live on Robinhood Chain"));
  await noSideScroll();
  await shot("03-token-live-desktop", 1500);
  await scrollTo("#how", -8);
  await shot("03-token-live-next-burn", 1200);
  await scrollTo("#burns", -8);
  await shot("03-token-live-burns", 1200);
  await scrollTo("#addresses", -8);
  await shot("03-token-live-addresses-perks", 1200);
  await open("/token", "light");
  await waitFor(has("Live on Robinhood Chain"));
  await shot("03-token-live-desktop-light", 1500);
  await setViewport(390, 844, true);
  await open("/token");
  await waitFor(has("Live on Robinhood Chain"));
  await noSideScroll();
  await shot("03-token-live-phone", 1500);
  await scrollTo('[aria-label="Burned so far"]', -8);
  await shot("03-token-live-phone-counter", 1200);
  await scrollTo("#burns", -8);
  await shot("03-token-live-phone-burns", 1200);

  /* 05 The owner's keeper card after the burns, on a desktop and a phone */
  await setViewport(1440, 900, false);
  await open("/app/settings/token");
  await waitFor(has("The keeper looks every"));
  await noSideScroll();
  await shot("05-owner-keeper-card", 1500);
  await scrollTo('[aria-label="Holders"]', -8);
  await shot("05-owner-holders-and-token", 1200);
  await setViewport(390, 844, true);
  await open("/app/settings/token");
  await noSideScroll();
  await shot("07-phone-owner-keeper", 1500);

  // A phone has no wallet in its browser: the button must open this page inside MetaMask's browser.
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://metamask.app.link/*" }] });
  const deep = new Promise((resolve) => {
    events.push((msg) => {
      if (msg.method === "Fetch.requestPaused") {
        resolve(msg.params.request.url);
        void send("Fetch.failRequest", { requestId: msg.params.requestId, errorReason: "Aborted" });
      }
    });
  });
  await open("/account#wovi");
  await clickText("Link another wallet");
  const url = await Promise.race([deep, sleep(10000).then(() => null)]);
  console.log(url ? `phone deep link: ${url}` : "WARNING: no MetaMask link from the phone");
  await send("Fetch.disable");
}

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
