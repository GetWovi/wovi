/**
 * The launch page (/token/launch) in headless Chrome against a local fork, with a wallet injected into the page:
 * an EIP-1193 provider whose requests this script answers. It "is" whichever wallet the step needs, and sends by
 * having the fork impersonate that wallet, so no key exists anywhere. Screen-sized shots at 1440x900 and 390x844,
 * each checked for sideways scroll. Run by scripts/launch-rehearsal.sh:
 *
 *   node scripts/launch-screens.mjs pre    before the launch: start, wrong wallet, short of ETH, ready; then the
 *                                          button pressed on a snapshot of the fork (rolled back after)
 *   node scripts/launch-screens.mjs post   after the launch: the page shows the token instead of a button
 *
 * FORK_RPC (http://127.0.0.1:<port> only), FORK_LAUNCHER, BASE (the server, pointed at the fork), OUT (folder).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3911";
const MODE = process.argv[2] ?? "pre";
const OUT = process.env.OUT ?? join(process.env.HOME, "WOVI-launch-screens");
const RPC = process.env.FORK_RPC ?? "";
const LAUNCHER = process.env.FORK_LAUNCHER ?? "";
const STRANGER = "0x5ec0000000000000000000000000000000057a9e";
const PORT = 9358;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(RPC)) throw new Error("FORK_RPC must be the local fork, http://127.0.0.1:<port>");
if (!/^0x[0-9a-fA-F]{40}$/.test(LAUNCHER)) throw new Error("FORK_LAUNCHER is not an address");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let rpcId = 0;
async function fork(method, params = []) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const j = await res.json();
  if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
  return j.result;
}
const hexWei = (eth) => `0x${(BigInt(Math.round(eth * 1e6)) * BigInt(1e12)).toString(16)}`;

const profile = join(tmpdir(), `wovi-launch-shots-${process.pid}`);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--lang=en-US", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });

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
  } else if (msg.method) events.forEach((fn) => fn(msg));
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

/* The wallet in the page. `account` is whoever the step needs; a send goes to the fork as that wallet, impersonated. */
let account = LAUNCHER;
let signDelay = 0;
const sent = [];
await send("Runtime.addBinding", { name: "__woviBridge" });
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    let n = 0; const waiting = new Map();
    window.__woviReply = (id, result, error) => { const w = waiting.get(id); if (!w) return; waiting.delete(id); error ? w.reject(Object.assign(new Error(error.message), { code: error.code })) : w.resolve(result); };
    window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, request: ({ method, params }) => new Promise((resolve, reject) => { const id = ++n; waiting.set(id, { resolve, reject }); window.__woviBridge(JSON.stringify({ id, method, params: params ?? [] })); }) };
  })();`,
});
events.push(async (msg) => {
  if (msg.method !== "Runtime.bindingCalled" || msg.params.name !== "__woviBridge") return;
  const { id, method, params } = JSON.parse(msg.params.payload);
  let result = null;
  let error = null;
  try {
    if (method === "eth_requestAccounts" || method === "eth_accounts") result = [account];
    else if (method === "eth_chainId") result = "0x1237";
    else if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") result = null;
    else if (method === "eth_sendTransaction") {
      if (signDelay) await sleep(signDelay);
      const tx = params[0];
      const keys = Object.keys(tx).sort().join(",");
      if (keys !== "data,from,gas,to,value") throw new Error(`the page sent other fields: ${keys}`);
      sent.push(tx);
      await fork("anvil_impersonateAccount", [tx.from]);
      result = await fork("eth_sendTransaction", [tx]);
      await fork("anvil_stopImpersonatingAccount", [tx.from]);
      console.log("  the page's wallet sent", result, "value", BigInt(tx.value).toString(), "gas", BigInt(tx.gas).toString());
    } else error = { code: 4200, message: `not supported here: ${method}` };
  } catch (e) {
    error = { code: -32000, message: String(e.message).slice(0, 200) };
  }
  await send("Runtime.evaluate", { expression: `window.__woviReply(${id}, ${JSON.stringify(result)}, ${JSON.stringify(error)})`, contextId: msg.params.executionContextId });
});

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  await send("Emulation.setUserAgentOverride", {
    userAgent: mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 MetaMaskMobile" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
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
async function open(path) {
  const loaded = untilLoad();
  await send("Page.navigate", { url: `${BASE}${path}` });
  await loaded;
  await evaluate(`(async () => { localStorage.setItem("wovi-theme", "night"); document.documentElement.setAttribute("data-theme", "night"); await document.fonts.ready; return true; })()`);
  await sleep(700);
}
const has = (text) => `document.body.textContent.includes(${JSON.stringify(text)})`;
async function waitFor(expression, ms = 90000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(150);
  }
  const where = await evaluate(`location.href + " | " + document.body.innerText.slice(0, 600)`).catch(() => "?");
  throw new Error("timed out waiting for " + expression + " on " + where);
}
async function clickText(text) {
  await evaluate(`(() => { const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) throw new Error("no button " + ${JSON.stringify(text)}); el.click(); return true; })()`);
}
async function scrollTo(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 0; const y = el.getBoundingClientRect().top + window.scrollY - 92; window.scrollTo({ top: y, behavior: "instant" }); return y; })()`);
}
async function noSideScroll(name) {
  const over = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  if (over > 1) {
    const wide = await evaluate(`[...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => e.tagName + "." + String(e.className).slice(0, 60)).join(" | ")`);
    throw new Error(`${name}: the page scrolls sideways by ${over}px: ${wide}`);
  }
  const dash = await evaluate(`document.body.innerText.includes("\\u2014")`);
  if (dash) throw new Error(`${name}: an em dash on the page`);
}
async function shot(name, settle = 900) {
  await sleep(settle);
  await noSideScroll(name);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("  wrote", join(OUT, `${name}.png`));
}
const clearRemembered = () => evaluate(`(() => { Object.keys(localStorage).filter((k) => k.startsWith("wovi-launch-tx:")).forEach((k) => localStorage.removeItem(k)); return true; })()`);

const desktop = () => setViewport(1440, 900, false);
const phone = () => setViewport(390, 844, true);

try {
  if (MODE === "pre") {
    await fork("anvil_setBalance", [LAUNCHER, hexWei(1)]);
    await fork("anvil_setBalance", [STRANGER, hexWei(1)]);

    /* Desktop: before connecting, another wallet, too little ETH, ready */
    await desktop();
    account = STRANGER;
    await open("/token/launch");
    await waitFor(has("Connect MetaMask"));
    await shot("01-launch-start-desktop");
    await clickText("Connect MetaMask");
    await waitFor(has("This wallet is not the launch wallet"));
    await scrollTo('[aria-label="Launch"]');
    await shot("02-launch-wrong-wallet-desktop");

    account = LAUNCHER;
    await fork("anvil_setBalance", [LAUNCHER, hexWei(0.002)]);
    await open("/token/launch");
    await clickText("Connect MetaMask");
    await waitFor(has("does not hold enough ETH"));
    await scrollTo('[aria-label="Launch"]');
    await shot("03-launch-short-desktop");
    await fork("anvil_setBalance", [LAUNCHER, hexWei(1)]);

    await open("/token/launch");
    await clickText("Connect MetaMask");
    await waitFor(has("Token address it will have"));
    await shot("04-launch-ready-desktop");

    /* Phone, inside MetaMask's browser: the deep link's ?link=launch connects by itself */
    await phone();
    account = STRANGER;
    await open("/token/launch");
    await waitFor(has("Connect MetaMask"));
    await shot("01-launch-start-phone");
    await open("/token/launch?link=launch");
    await waitFor(has("This wallet is not the launch wallet"));
    await scrollTo('[aria-label="Launch"]');
    await shot("02-launch-wrong-wallet-phone");
    account = LAUNCHER;
    await open("/token/launch?link=launch");
    await waitFor(has("Token address it will have"));
    await scrollTo('[aria-label="Launch"]');
    await shot("04-launch-ready-phone");

    /* The button, pressed, on a snapshot of the fork that is rolled back afterwards */
    for (const [label, size] of [
      ["desktop", desktop],
      ["phone", phone],
    ]) {
      const snap = await fork("evm_snapshot");
      await size();
      account = LAUNCHER;
      await open("/token/launch");
      await clearRemembered();
      await clickText("Connect MetaMask");
      await waitFor(has("Token address it will have"));
      const predicted = await evaluate(`[...document.querySelectorAll("b")].find((b) => b.previousElementSibling?.textContent === "Token address it will have")?.textContent ?? ""`);
      signDelay = 2500;
      await clickText("Launch $WOVI");
      await waitFor(has("Confirm the launch in MetaMask"), 20000);
      await scrollTo('[aria-label="Launch"]');
      await shot(`05-launch-confirm-${label}`, 300);
      // A second press while it is out does nothing.
      await evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Launch $WOVI"); if (b) b.click(); return true; })()`);
      signDelay = 0;
      await waitFor(has("$WOVI is live"), 120000);
      const token = await evaluate(`[...document.querySelectorAll("b")].find((b) => b.previousElementSibling?.textContent === "Token")?.textContent ?? ""`);
      if (!token || token.toLowerCase() !== predicted.toLowerCase()) throw new Error(`the launched token ${token} is not the predicted ${predicted}`);
      await scrollTo('[aria-label="Launched"]');
      await shot(`06-launch-done-${label}`);
      await fork("evm_revert", [snap]);
      console.log(`  ${label}: launched ${token} from the button, as predicted; the fork rolled back`);
    }
    if (sent.length !== 2) throw new Error(`the page sent ${sent.length} transactions for two presses on two snapshots, not 2`);
  } else if (MODE === "post") {
    await desktop();
    await open("/token/launch");
    await waitFor(has("Already launched"));
    await shot("07-launch-already-desktop");
    await phone();
    await open("/token/launch");
    await waitFor(has("Already launched"));
    await shot("07-launch-already-phone");
  } else throw new Error("pre or post");
} finally {
  ws.close();
  chrome.kill();
}
