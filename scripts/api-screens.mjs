/**
 * Screen-sized screenshots of the API, MCP and webhooks (phase 14) with
 * headless Chrome over the DevTools protocol: the API keys and connect page
 * with the MCP configs and curl, the API reference made from the OpenAPI
 * document, the webhook settings with their delivery log, and a phone view.
 * Also writes curl-demo.txt: a real terminal transcript of curl against the
 * local server with a test key (create a run, poll it, read the result).
 *
 * Everything runs on the FAKE provider, the TEST payment provider and the DEV
 * webhook sender: no model key, no network beyond localhost, no real
 * payments, nothing delivered anywhere. Keys are made through the page and
 * never written into the transcript.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-api-screens OPENROUTER_API_KEY= npm run agents:launch
 *   WOVI_DATA_DIR=/tmp/wovi-api-screens OPENROUTER_API_KEY= WOVI_FAKE_LATENCY_MS=2500 npm start
 *   WOVI_DATA_DIR=/tmp/wovi-api-screens OPENROUTER_API_KEY= node scripts/api-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-api-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "maya@example.com";
const PORT = 9354;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), `wovi-api-shots-${process.pid}`);
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
await send("WebAuthn.enable", { enableUI: false });
await send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
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

async function type(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("no element " + ${JSON.stringify(selector)});
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    return true; })()`);
}

async function clickText(text, tag = "button", nth = 0) {
  await evaluate(`(() => { const all = [...document.querySelectorAll(${JSON.stringify(tag)})].filter((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})); const el = all[${nth}]; if (!el) throw new Error("no ${tag} with text " + ${JSON.stringify(text)}); el.click(); return true; })()`);
}

async function waitFor(expression, ms = 60000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(150);
  }
  throw new Error("timed out waiting for " + expression);
}

async function scrollTo(selector, offset = 0) {
  await evaluate(
    `(() => { const el = ${selector === "top" ? "null" : `document.querySelector(${JSON.stringify(selector)})`};
      if (${selector !== "top"} && !el) throw new Error("no element " + ${JSON.stringify(selector)});
      const y = ${selector === "top" ? 0 : `el.getBoundingClientRect().top + window.scrollY - 76 - 16 + (${offset})`};
      window.scrollTo({ top: y, behavior: "instant" }); window.dispatchEvent(new Event("scroll")); return y; })()`,
  );
}

async function dismissToasts() {
  await evaluate(`(() => { document.querySelectorAll('button[aria-label="Dismiss"]').forEach((b) => b.click()); return true; })()`);
}

async function shot(name, settle = 1200) {
  await dismissToasts();
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

/** Warns when anything sticks out sideways (a cut-off page) or the header's logo and nav overlap. */
async function noSideScroll() {
  const overlap = await evaluate(`(() => { const logo = document.querySelector('header a[aria-label="WOVI home"]'); const nav = document.querySelector('header nav a'); if (!logo || !nav || getComputedStyle(nav.parentElement).display === "none") return 0; return logo.getBoundingClientRect().right - nav.getBoundingClientRect().left; })()`);
  if (overlap > 0) console.warn(`WARNING: the logo overlaps the nav by ${overlap}px on ${await evaluate("location.pathname")}`);
  const over = await evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
  if (over > 1) {
    const wide = await evaluate(`[...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => e.tagName + "." + String(e.className).slice(0, 60)).join(" | ")`);
    console.warn(`WARNING: the page scrolls sideways by ${over}px on ${await evaluate("location.pathname")}: ${wide}`);
  }
}



async function clickSelector(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("no element " + ${JSON.stringify(selector)}); el.click(); return true; })()`);
}


const secretOnPage = () => evaluate(`(() => { const all = [...document.querySelectorAll('code[class*="secret"]')]; return all.length ? all[all.length - 1].textContent.trim() : null; })()`);

/** Runs one shell command with the key in the environment, and keeps it for the transcript with the key hidden. */
const transcript = [];
function sh(cmd, key) {
  const out = execFileSync("/bin/sh", ["-c", cmd], { encoding: "utf8", env: { ...process.env, WOVI_KEY: key } });
  if (out.includes(key)) throw new Error("a key reached the output");
  transcript.push(`$ ${cmd}`, out.trimEnd(), "");
  return out;
}

/* ---------- Desktop ---------- */
await setViewport(1440, 900, false);

await open("/sign-in?next=%2Fapp");
await waitFor(`document.querySelector('input[name="email"]')`);
await type('input[name="email"]', EMAIL);
await clickText("Email me a sign-in link");
await waitFor(has("We sent a link and a six-digit code"), 20000);
await sleep(500);
await type('input[name="code"]', latestCode(EMAIL));
await clickText("Sign in");
await waitFor(path("/app/welcome"), 30000);
await waitFor(has("Hi, I am Wovi"));
await clickText("Skip for now");
await waitFor(path("/app"), 30000);
console.log(execFileSync("npx", ["tsx", "scripts/seed-credits.ts", EMAIL], { encoding: "utf8", env: { ...process.env, WOVI_DATA_DIR: DATA, OPENROUTER_API_KEY: "" } }).trim());

/* Credits through the test provider, so runs from the API can start */
await open("/app/credits");
await waitFor(has("Test mode."));
await scrollTo("#top-up", -8);
await clickSelector('button[aria-label^="Test top-up: 2,500 credits"]');
await waitFor(has("2,500 credits added"), 20000);

/* Two keys, made on the page. Each secret is read once from the page and kept in memory only. */
await open("/app/settings/api");
await waitFor(has("Use the agents from anywhere"));
await type('input[name="name"]', "Claude on my laptop");
await type('select[name="role"]', "editor");
await clickText("Make key");
await waitFor(`document.querySelector('code[class*="secret"]')`, 20000);
const editorKey = await secretOnPage();
await open("/app/settings/api");
await type('input[name="name"]', "Our scheduler");
await type('select[name="role"]', "admin");
await clickText("Make key");
await waitFor(`document.querySelectorAll('code[class*="secret"]').length > 0`, 20000);
const adminKey = await secretOnPage();
if (!/^wovi_sk_/.test(editorKey ?? "") || !/^wovi_sk_/.test(adminKey ?? "") || editorKey === adminKey) throw new Error("could not read the new keys");

/* A webhook, added on the page, with a test sent through the dev sender */
await open("/app/settings/webhooks");
await waitFor(has("Add a webhook"));
await type('input[name="url"]', "https://example.com/wovi-hook");
await clickSelector('input[name="events"][value="pipeline.waiting"]');
await type('input[name="description"]', "Our scheduler");
await clickText("Add webhook");
await waitFor(has("Copy the signing secret now"), 20000);
await open("/app/settings/webhooks");
await waitFor(has("example.com/wovi-hook"));
await clickText("Send a test");
await waitFor(has("Test logged on this machine"), 20000);

/* The curl transcript: a real run on the fake provider, polled until it lands */
const API = `${BASE}/api/v1`;
transcript.push("# WOVI REST API, against the local server (fake provider, test credits).", "# The key is a test key made on Settings, API and assistants; it is kept in $WOVI_KEY and never printed.", "");
sh(`curl -s ${API}/me -H "Authorization: Bearer $WOVI_KEY" | jq -c '{workspace, key, limits}'`, adminKey);
sh(`curl -s ${API}/agents -H "Authorization: Bearer $WOVI_KEY" | jq -r '.data[] | "\\(.id)  about \\(.estimate.credits) credits  bar \\(.quality.bar)"'`, adminKey);
const created = sh(
  `curl -s -D - -o /tmp/wovi-run.json ${API}/agents/hook-writer/runs -H "Authorization: Bearer $WOVI_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: demo-hooks-1" -d '{"inputs":{"idea":"We stopped taking wedding cake orders so the bakery could open at 6 a.m. again.","platform":"tiktok"}}' | grep -iE '^(HTTP|location|ratelimit-remaining)'; jq '{id, status, agent, charge}' /tmp/wovi-run.json`,
  adminKey,
);
const runId = /"id": "(run_[a-z0-9]+)"/.exec(created)?.[1];
if (!runId) throw new Error("no run id in the create answer");
sh(`curl -s ${API}/runs/${runId} -H "Authorization: Bearer $WOVI_KEY" | jq -c '{id, status}'`, adminKey);
for (let i = 0; i < 60; i++) {
  const now = await (await fetch(`${API}/runs/${runId}`, { headers: { authorization: `Bearer ${adminKey}` } })).json();
  if (["succeeded", "failed", "cancelled"].includes(now.status)) break;
  await sleep(500);
}
transcript.push("# (polled again until it finished)", "");
sh(`curl -s ${API}/runs/${runId} -H "Authorization: Bearer $WOVI_KEY" | jq '{id, status, ready, agent: .agent.name, brandBrain: .brandBrain.name, quality: {score: .quality.score, bar: .quality.bar, verdict: .quality.verdict}, charge, hooks: .output.items}'`, adminKey);
sh(`curl -s -X POST ${API}/runs/${runId}/approve -H "Authorization: Bearer $WOVI_KEY" | jq -c .`, adminKey);
sh(`curl -s ${API}/agents/hook-writer/runs -H "Authorization: Bearer $WOVI_KEY" -H "Content-Type: application/json" -d '{"inputs":{"idea":"cake"}}' | jq -c .`, editorKey);
sh(`curl -s ${API}/credits -H "Authorization: Bearer $WOVI_KEY" | jq -c .`, adminKey);
writeFileSync(join(OUT, "curl-demo.txt"), transcript.join("\n") + "\n");
console.log("wrote curl-demo.txt");

/* An MCP call over HTTP, so the delivery log shows a second run too */
sh(`curl -s ${BASE}/mcp -H "Authorization: Bearer $WOVI_KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run_agent","arguments":{"agent":"caption-writer","inputs":{"post":"Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight.","platforms":["tiktok"],"length":"short"},"wait_seconds":20}}}' | jq -r '.result.content[0].text' | head -3`, editorKey);
transcript.length = 0;

/* 01 The API keys and connect page */
await open("/app/settings/api");
await waitFor(has("Our scheduler"));
await noSideScroll();
await shot("01-api-keys-and-connect", 1200);

/* 02 The same page: the curl calls, and what a key can and cannot do */
await scrollTo('[aria-label="Call the API"]', -8);
await shot("02-api-curl", 1200);

/* 03 The API reference, from the OpenAPI document */
await open("/app/settings/api/reference");
await waitFor(has("Keys, limits and errors"));
await noSideScroll();
await shot("03-api-reference", 1200);
await scrollTo("#startrun", -72);
await shot("04-api-reference-start-a-run", 1200);

/* 05 Webhooks with their delivery log */
await open("/app/settings/webhooks");
await waitFor(has("run.finished"));
await waitFor(`document.querySelectorAll('[aria-label="Latest deliveries"] li').length >= 3`, 30000);
await noSideScroll();
await shot("05-webhooks", 1200);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);
await open("/app/settings/api");
await waitFor(has("Use the agents from anywhere"));
await noSideScroll();
await shot("06-phone-api", 1500);

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
