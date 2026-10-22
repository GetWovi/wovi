/**
 * Screen-sized screenshots of credits (phase 13) with headless Chrome over
 * the DevTools protocol: the balance in the header, the credits page, a test
 * top-up, the cost shown before a run, a result with its charge, the
 * not-enough-credits state, the owner's limits, and two phone views.
 * Everything runs on the FAKE provider and the TEST payment provider: no key,
 * no network, no real payments, no real email.
 *
 * It signs in through the real email flow (the dev mailer writes the code
 * into <dataDir>/mail/), skips onboarding, runs scripts/seed-credits.ts for a
 * small team and the example Brand Brains, then does everything else through
 * the screens: tops up with the test provider, runs agents, stops one,
 * starts a pipeline, and sets limits.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-credits-screens OPENROUTER_API_KEY= npm run agents:launch
 *   WOVI_DATA_DIR=/tmp/wovi-credits-screens OPENROUTER_API_KEY= WOVI_FAKE_LATENCY_MS=2500 npm start
 *   WOVI_DATA_DIR=/tmp/wovi-credits-screens OPENROUTER_API_KEY= node scripts/credits-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-credits-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "maya@example.com";
const PORT = 9353;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), `wovi-credits-shots-${process.pid}`);
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



/** A shot that keeps the toasts, for the moment right after an action. */
async function shotWithToast(name, settle = 900) {
  await sleep(settle);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("wrote", `${name}.png`);
}

async function clickSelector(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("no element " + ${JSON.stringify(selector)}); el.click(); return true; })()`);
}

const balanceNow = () => evaluate(`(() => { const a = document.querySelector('header a[href="/app/credits"]'); return a ? a.textContent.replace(/[^0-9]/g, "") : null; })()`);

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

/* 06 Not enough credits: a new workspace has none, and nobody gets free ones */
await open("/app/make/hook-writer");
await waitFor(has("Not enough credits for this"));
await clickText("Fill with an example");
await sleep(300);
await noSideScroll();
await scrollTo('[role="alert"]', -260);
await shot("06-not-enough-credits", 1200);

/* 03 A test top-up */
await open("/app/credits");
await waitFor(has("Test mode."));
await waitFor(has("From $5.00 (500 credits)"));
await scrollTo("#top-up", -8);
await clickSelector('button[aria-label^="Test top-up: 2,500 credits"]');
await waitFor(has("2,500 credits added"), 20000);
await waitFor(`document.querySelector('header a[href="/app/credits"]')?.textContent.includes("2,500")`, 20000);
await scrollTo("#top-up", -8);
await shotWithToast("03-top-up-test", 900);

/* 04 The cost before running */
await open("/app/make/hook-writer");
await waitFor(has("The workspace has"));
await clickText("Fill with an example");
await sleep(300);
await noSideScroll();
await scrollTo('[class*="runBar"]', -520);
await shot("04-cost-before-running", 1200);

/* A run that is charged */
await clickText("Run Hook Writer");
await waitFor(`location.search.includes("run=")`, 20000);
const runId = await evaluate(`new URLSearchParams(location.search).get("run")`);
await waitFor(has("Charged"), 60000);

/* A run that is stopped: everything held comes back */
await open("/app/make/caption-writer");
await waitFor(has("The workspace has"));
await clickText("Fill with an example");
await sleep(300);
await clickText("Run Caption Writer");
await waitFor(has("Stop"), 20000);
await sleep(600);
await clickText("Stop");
await waitFor(has("Nothing charged"), 30000);

/* A pipeline: held as one, each step charged inside it */
await open("/app/pipelines/caption-and-tags");
await waitFor(has("The workspace has"));
await clickText("Fill with an example");
await sleep(300);
await clickText("Start the pipeline");
await waitFor(`location.pathname.startsWith("/app/pipelines/runs/")`, 20000);
await waitFor(has("Use number"), 60000);
await clickText("Use number");
await waitFor(`${has("Your post is ready")} || ${has("Ready, with something to check")}`, 60000);

/* One more run, left going, so something is held right now */
await open("/app/make/script-writer");
await waitFor(has("The workspace has"));
await clickText("Fill with an example");
await sleep(300);
await clickText("Run Script Writer");
await waitFor(has("Stop"), 20000);

/* 01 The balance in the header */
await open("/app");
await waitFor(`document.querySelector('header a[href="/app/credits"]')`);
console.log("balance in the header:", await balanceNow());
await noSideScroll();
await shot("01-header-balance", 1200);

/* 02 The credits page */
await open("/app/credits");
await waitFor(has("History"));
await noSideScroll();
await shot("02-credits-page", 1200);
await scrollTo('[aria-label="History"]', -8);
await shot("02b-credits-history", 1200);

/* 05 A result with its charge */
await open(`/app/runs/${runId}`);
await waitFor(has("Charged"));
await noSideScroll();
await shot("05-result-with-charge", 1500);

/* 07 The owner's limits */
await open("/app/credits");
await waitFor(has("Monthly limits"));
await type('input[aria-label="Monthly limit for the workspace, in credits"]', "2000");
await type('input[aria-label="Monthly limit for Sam Reyes, in credits"]', "300");
await type('input[aria-label="Monthly limit for Jo Berg, in credits"]', "300");
await clickText("Save limits");
await waitFor(has("Limits saved"), 20000);
await waitFor(has("of 2,000 credits used this month"), 20000);
await scrollTo("#limits", -8);
await shotWithToast("07-owner-limits", 900);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);

/* 08 The credits page on a phone */
await open("/app/credits");
await waitFor(has("History"));
await noSideScroll();
await shot("08-phone-credits", 1500);

/* 09 The cost before running, on a phone */
await open("/app/make/hook-writer");
await waitFor(has("The workspace has"));
await clickText("Fill with an example");
await sleep(300);
await noSideScroll();
await scrollTo('[class*="runBar"]', -420);
await shot("09-phone-cost-before-running", 1500);

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
