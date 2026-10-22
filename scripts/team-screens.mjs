/**
 * Screen-sized screenshots of review and teams (phase 11) with headless
 * Chrome over the DevTools protocol: the review queue, an item with comments
 * and the decision, asking for changes and the re-run it starts,
 * notifications, the clients page with a new share link, the client's own
 * view, the approval rules, and two phone views. Everything runs on the FAKE
 * provider: no key, no network, no money, no real email.
 *
 * It signs in through the real email flow (the dev mailer writes the code
 * into <dataDir>/mail/), skips onboarding, then runs scripts/seed-team.ts to
 * make the workspace a small agency with clients and work in every state.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-team-screens OPENROUTER_API_KEY= npm run agents:launch
 *   WOVI_DATA_DIR=/tmp/wovi-team-screens OPENROUTER_API_KEY= WOVI_FAKE_LATENCY_MS=2500 npm start
 *   WOVI_DATA_DIR=/tmp/wovi-team-screens OPENROUTER_API_KEY= node scripts/team-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-team-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "maya@example.com";
const PORT = 9351;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), `wovi-team-shots-${process.pid}`);
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

async function clickLink(text) {
  await evaluate(`(() => { const a = [...document.querySelectorAll("a")].find((x) => x.textContent.trim().includes(${JSON.stringify(text)})); if (!a) throw new Error("no link " + ${JSON.stringify(text)}); a.click(); return true; })()`);
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
const seeded = JSON.parse(execFileSync("npx", ["tsx", "scripts/seed-team.ts", EMAIL], { encoding: "utf8", env: { ...process.env, WOVI_DATA_DIR: DATA, WOVI_FAKE_LATENCY_MS: "0", OPENROUTER_API_KEY: "" } }).trim().split("\n").pop());
console.log("seeded", seeded);

/* 01 The review queue */
await open("/app/review");
await waitFor(has("What needs a"));
await noSideScroll();
await shot("01-review-queue", 1500);

/* 02 An item with comments and the decision */
await open(`/app/review/${seeded.hooks}`);
await waitFor(has("Your call"));
await noSideScroll();
await shot("02-item-comments-and-decision", 1500);

/* Maya answers in the thread, mentioning Ed */
await scrollTo('[aria-label="Comments"]', -20);
await clickText("Reply", "button");
await type('textarea[maxlength="2000"]', "@ed yes, keep it, and name Gerald in the first line.");
await clickText("Answer");
await waitFor(has("name Gerald in the first line."), 20000);
await sleep(600);
await shot("03-comment-thread", 1200);

/* 04 Ask for changes: the note starts a new draft, linked both ways */
await scrollTo("top");
await type('textarea[maxlength="500"]', "Name Gerald in the first line, and no exclamation marks.");
await clickText("Ask for changes");
await waitFor(has("A new draft with these changes."), 20000);
await sleep(800);
await scrollTo("top");
await shot("04-changes-asked", 1500);

/* 05 The new draft, once it lands */
await clickLink("A new draft with these changes.");
await waitFor(has("See the first draft"), 20000);
await waitFor(has("Your call"), 60000);
await open(await evaluate("location.pathname"));
await waitFor(has("Your call"));
await shot("05-rerun-new-draft", 1500);

/* 06 Notifications */
await open("/app/notifications");
await waitFor(has("Notifications"));
await noSideScroll();
await shot("06-notifications", 1500);

/* 07 Clients, with a new link for the client (shown once) */
await open("/app/clients");
await waitFor(has("many clients"));
await evaluate(`(() => { const card = [...document.querySelectorAll("article")].find((a) => a.textContent.includes("Northside Bakery")); const input = card.querySelector('input[placeholder^="Sam at"]'); input.setAttribute("data-shot", "label"); return true; })()`);
await type('input[data-shot="label"]', "Priya at Northside");
await evaluate(`(() => { const card = [...document.querySelectorAll("article")].find((a) => a.textContent.includes("Northside Bakery")); [...card.querySelectorAll("button")].find((b) => b.textContent.includes("Make link")).click(); return true; })()`);
await waitFor(has("it is shown once."), 20000);
const clientUrl = await evaluate(`[...document.querySelectorAll("code")].map((c) => c.textContent).find((t) => t.includes("/client/"))`);
await sleep(600);
await shot("08-new-client-link", 1200);
await evaluate(`(() => { document.querySelector('[role="dialog"] button[aria-label="Close"]').click(); return true; })()`);
await sleep(400);
await scrollTo("top");
await noSideScroll();
await shot("07-clients", 1500);

/* 09 The client's own view, no account needed */
await open(new URL(clientUrl).pathname);
await waitFor(has("Waiting for you"));
await noSideScroll();
await shot("09-client-view", 1500);

/* 10 The client opens a draft and has a say */
await clickLink("Have a look");
await waitFor(has("Your say"), 20000);
await noSideScroll();
await shot("10-client-item", 1500);

/* 11 The approval rules */
await open("/app/settings/team");
await waitFor(has("Approval rules"));
await noSideScroll();
await shot("11-settings-approval-rules", 1500);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);

/* 12 The queue on a phone */
await open("/app/review");
await waitFor(has("What needs a"));
await noSideScroll();
await shot("12-phone-review-queue", 1500);

/* 13 Deciding on a phone: the client's draft, the decision under the result */
await open(`/app/review/${seeded.caption}`);
await waitFor(has("Your call"));
await scrollTo('[class*="areaSide"]', 0);
await noSideScroll();
await shot("13-phone-decide", 1500);

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
