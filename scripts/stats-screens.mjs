/**
 * Screen-sized screenshots of live stats and canary releases with headless
 * Chrome over the DevTools protocol, at 1440x900 and 390x844: the gallery
 * cards with live stats, an agent page's live stats, the feedback bar under a
 * result, the builder's stats per version, the canary panel and the audit
 * log. Everything runs on the FAKE provider and SAMPLE data on a throwaway
 * local data dir: no key, no network, no money, no real email. Never point it
 * at a real data dir.
 *
 * It signs in through the real email flow (the dev mailer writes the code
 * into <dataDir>/mail/), skips onboarding, joins the builder as Funkai with
 * Chrome's virtual authenticator, then runs scripts/seed-stats.ts.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-stats-screens OPENROUTER_API_KEY= npm run agents:launch
 *   WOVI_CANARY=on WOVI_DATA_DIR=/tmp/wovi-stats-screens OPENROUTER_API_KEY= npm start
 *   WOVI_DATA_DIR=/tmp/wovi-stats-screens OPENROUTER_API_KEY= node scripts/stats-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-stats-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "maya@example.com";
const PORT = 9353;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), `wovi-stats-shots-${process.pid}`);
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



if (!/wovi-stats-screens|tmp/.test(DATA)) throw new Error(`Refusing to put sample data in ${DATA}. Use a throwaway data dir like /tmp/wovi-stats-screens.`);

async function signIn() {
  await send("Network.clearBrowserCookies");
  await open("/sign-in?next=%2Fapp");
  await waitFor(`document.querySelector('input[name="email"]')`);
  await type('input[name="email"]', EMAIL);
  await clickText("Email me a sign-in link");
  await waitFor(has("We sent a link and a six-digit code"), 20000);
  await sleep(500);
  await type('input[name="code"]', latestCode(EMAIL));
  await clickText("Sign in");
  await waitFor(`location.pathname.startsWith("/app")`, 30000);
}

async function both(name, fn) {
  await setViewport(1440, 900, false);
  await fn(false);
  await noSideScroll();
  await shot(`${name}-desktop`, 1400);
  await setViewport(390, 844, true);
  await fn(true);
  await noSideScroll();
  await shot(`${name}-phone`, 1400);
}

/* ---------- Accounts: the owner, then the builder ---------- */
await setViewport(1440, 900, false);
await signIn();
if (await evaluate(path("/app/welcome"))) {
  await waitFor(has("Hi, I am Wovi"));
  await clickText("Skip for now");
  await waitFor(path("/app"), 30000);
}
const codeOut = execFileSync("npx", ["tsx", "scripts/builder-code.ts", "--label", "Stats screens"], { encoding: "utf8", env: { ...process.env, WOVI_DATA_DIR: DATA } });
const CODE = /(wovi_builder_[A-Za-z0-9_-]+)/.exec(codeOut)?.[1];
if (!CODE) throw new Error("No builder code came back:\n" + codeOut);
await open("/builder/join");
await type('input[name="code"]', CODE);
await type('input[name="name"]', "Funkai");
await clickText("Create my passkey and join");
await waitFor(`location.pathname === "/builder" && document.querySelector('a[href^="/builder/agents/"]')`, 30000);

const seeded = JSON.parse(execFileSync("npx", ["tsx", "scripts/seed-stats.ts", EMAIL], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, WOVI_DATA_DIR: DATA, WOVI_FAKE_LATENCY_MS: "0", OPENROUTER_API_KEY: "" } }).trim().split("\n").pop());
console.log("seeded", seeded);

/* ---------- The builder (Funkai's session) ---------- */

/* The canary panel: v-next beside the stable version, the gold-set gate, publish and roll back */
await both("05-builder-canary-panel", async (phone) => {
  await open("/builder/agents/hook-writer/stats");
  await waitFor(has("Regression gate"));
  await scrollTo('h2', phone ? -8 : -60);
});

/* Live stats per version, beside Quality */
await both("04-builder-stats-per-version", async () => {
  await open("/builder/agents/hook-writer/stats");
  await waitFor(has("Live stats per version"));
  await evaluate(`(() => { const h = [...document.querySelectorAll("h2,h3")].find((x) => x.textContent.includes("Live stats per version")); window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 110, behavior: "instant" }); return true; })()`);
});

/* The audit log */
await both("06-builder-audit-log", async () => {
  await open("/builder/audit");
  await waitFor(has("Stopped on its own"));
});

/* ---------- The app (the owner's session) ---------- */
await setViewport(1440, 900, false);
await signIn();

/* Gallery cards with live stats */
await both("01-gallery-cards-live-stats", async (phone) => {
  await open("/app/make");
  await waitFor(has("Used as is"));
  if (phone) await evaluate(`(() => { const c = [...document.querySelectorAll("article")].find((a) => a.textContent.includes("Hook Writer")); window.scrollTo({ top: c.getBoundingClientRect().top + window.scrollY - 90, behavior: "instant" }); return true; })()`);
  else await scrollTo('section[class*="section"]', -8);
});

/* An agent page's live stats */
await both("02-agent-page-live-stats", async () => {
  await open("/app/make/hook-writer");
  await waitFor(has("Live stats"));
  await scrollTo("#live-stats", 0);
});

/* The feedback bar under a result: Use, Edit, Try again and the thumbs */
await both("03-result-feedback-bar", async (phone) => {
  await open(`/app/runs/${seeded.run}`);
  await waitFor(has("Did it work for you?"));
  await evaluate(`(() => { const s = document.querySelector('[aria-label="What you did with this result"]'); window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - ${phone ? 420 : 470}, behavior: "instant" }); return true; })()`);
});

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
