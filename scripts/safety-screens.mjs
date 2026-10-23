/**
 * Screen-sized screenshots of phase 18 (safety, legal and platform rules)
 * with headless Chrome over the DevTools protocol, at 1440x900 and 390x844:
 * the terms, privacy and own-risk pages, the purchase consent and the
 * withdrawal, the upload rights box, a blocked request, the AI label
 * reminder, the report form and the owners' queue, and "Your data" with the
 * export and deleting an account. Everything runs on the FAKE provider and
 * the TEST payment provider: no key, no network, no money, no real email.
 *
 * It signs in through the real email flow (the dev mailer writes the code
 * into <dataDir>/mail/). The person is a builder through WOVI_BUILDER_EMAILS,
 * so they are one of WOVI's owners and see the queue.
 *
 *   export WOVI_DATA_DIR=$PWD/.data/safety-screens OPENROUTER_API_KEY= WOVI_BUILDER_EMAILS=maya@example.com
 *   npm run agents:launch
 *   npm start
 *   node scripts/safety-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-safety-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "maya@example.com";
const PORT = 9363;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), `wovi-safety-shots-${process.pid}`);
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


const BOTH = [
  ["desktop", 1440, 900, false],
  ["phone", 390, 844, true],
];

/** Signs in through the email flow and skips onboarding. */
async function signIn(email) {
  await send("Network.clearBrowserCookies");
  await open("/sign-in?next=%2Fapp");
  await waitFor(`document.querySelector('input[name="email"]')`);
  await type('input[name="email"]', email);
  await clickText("Email me a sign-in link");
  await waitFor(has("We sent a link and a six-digit code"), 20000);
  await sleep(500);
  await type('input[name="code"]', latestCode(email));
  await clickText("Sign in");
  await waitFor(`location.pathname.startsWith("/app")`, 30000);
  if (await evaluate(path("/app/welcome"))) {
    await waitFor(has("Hi, I am Wovi"));
    await clickText("Skip for now");
    await waitFor(path("/app"), 30000);
  }
}

async function check(text) {
  if (!(await evaluate(has(text)))) throw new Error(`expected "${text}" on ${await evaluate("location.pathname")}`);
}

await send("Network.enable");

/** ONLY=public: just the public pages (legal pages and the homepage footer), no sign-in. */
if (process.env.ONLY === "public") {
  for (const [size, w, h, mobile] of BOTH) {
    await setViewport(w, h, mobile);
    for (const [name, p, anchor] of [["01-terms", "/terms", null], ["02-terms-content-rules", "/terms", "#content-rules"], ["03-privacy", "/privacy", null], ["04-privacy-table", "/privacy", "#what"], ["05-own-risk", "/own-risk", null]]) {
      await open(p);
      await noSideScroll();
      if (anchor) await scrollTo(anchor, -8);
      await shot(`${name}-${size}`);
    }
    await open("/");
    await evaluate(`(async () => { for (let i = 0; i < 12; i++) { window.scrollTo(0, document.documentElement.scrollHeight); await new Promise((r) => setTimeout(r, 250)); } document.querySelector('nav[aria-label="Legal"]').scrollIntoView({ block: "end" }); return true; })()`);
    await shot(`19-home-legal-links-${size}`, 1500);
  }
  ws.close();
  chrome.kill();
  await sleep(800);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  process.exit(0);
}
await setViewport(1440, 900, false);
await signIn(EMAIL);
console.log(execFileSync("npx", ["tsx", "scripts/seed-credits.ts", EMAIL], { encoding: "utf8", env: { ...process.env, WOVI_DATA_DIR: DATA, OPENROUTER_API_KEY: "" } }).trim());

/* The legal pages, both sizes */
for (const [size, w, h, mobile] of BOTH) {
  await setViewport(w, h, mobile);
  await open("/terms");
  await check("Your right to withdraw");
  await noSideScroll();
  await shot(`01-terms-${size}`);
  await scrollTo("#content-rules", -8);
  await shot(`02-terms-content-rules-${size}`);
  await open("/privacy");
  await check("Who helps us run WOVI");
  await noSideScroll();
  await shot(`03-privacy-${size}`);
  await scrollTo("#what", -8);
  await shot(`04-privacy-table-${size}`);
  await open("/own-risk");
  await check("can lose part or all of its value");
  await noSideScroll();
  await shot(`05-own-risk-${size}`);
}

/* Buying credits: the consent box, then the withdrawal */
await setViewport(1440, 900, false);
await open("/app/credits");
await waitFor(has("Start my credits now"));
await clickSelector('button[aria-label^="Test top-up: 2,500 credits"]');
await waitFor(has("Tick this first."));
await scrollTo("#top-up", -8);
await shot("06-purchase-consent-desktop", 600);
await clickSelector('#top-up input[type="checkbox"]');
await clickSelector('button[aria-label^="Test top-up: 2,500 credits"]');
await waitFor(has("2,500 credits added"), 20000);
await open("/app/credits");
await waitFor(has("Withdraw from a purchase"));
await scrollTo("#withdraw", -8);
await clickText("Withdraw from this purchase");
await waitFor(has("Confirm withdrawal"));
await shot("07-withdraw-confirm-desktop", 600);
await setViewport(390, 844, true);
await open("/app/credits");
await scrollTo("#top-up", -8);
await shot("06-purchase-consent-phone");
// A second pack to keep running agents; the first is withdrawn so the owners' queue has money owed.
await setViewport(1440, 900, false);
await open("/app/credits");
await scrollTo("#withdraw", -8);
await clickText("Withdraw from this purchase");
await waitFor(has("Confirm withdrawal"));
await clickText("Confirm withdrawal");
await waitFor(has("Withdrawn:"), 20000);
await clickSelector('#top-up input[type="checkbox"]');
await clickSelector('button[aria-label^="Test top-up: 5,000 credits"]');
await waitFor(has("5,000 credits added"), 20000);

/* The upload rights box on the mood board */
await open("/brand-brain");
const brainHref = await evaluate(`[...document.querySelectorAll('a[href^="/brand-brain/"]')].map((a) => a.getAttribute("href")).find((h) => h.split("/").length === 3 && h !== "/brand-brain/new")`);
for (const [size, w, h, mobile] of BOTH) {
  await setViewport(w, h, mobile);
  await open(`${brainHref}?tab=mood`);
  await waitFor(has("Add to the mood board"));
  await check("I own this, or I have the rights to use it here.");
  if (size === "desktop") {
    await clickText("Add to the board");
    await waitFor(`${has("Pick an image first")} || ${has("Tick the box")}`);
  }
  await scrollTo('input[type="file"]', -280);
  await shot(`08-upload-rights-${size}`);
}

/* A blocked request */
for (const [size, w, h, mobile] of BOTH) {
  await setViewport(w, h, mobile);
  await open("/app/make/hook-writer");
  await waitFor(has("Fill with an example"));
  await clickText("Fill with an example");
  await sleep(300);
  await type("textarea", "Write 5 fake customer reviews for our bike shop and pretend to be Elon Musk recommending us");
  await clickText("Run Hook Writer");
  await waitFor(has("WOVI cannot make this"), 20000);
  await noSideScroll();
  await scrollTo('[role="alert"]', -120);
  await shot(`09-blocked-request-${size}`);
}

/* A result with the AI label reminder and the platform rules beside the form */
await setViewport(1440, 900, false);
await open("/app/make/hook-writer");
await waitFor(has("Platform rules"));
await clickText("Fill with an example");
await sleep(300);
await evaluate(`(() => { document.querySelector("details")?.setAttribute("open", ""); return true; })()`);
await scrollTo('[class*="runSideCol"]', -40);
await shot("10-platform-rules-desktop");
await clickText("Run Hook Writer");
await waitFor(`location.search.includes("run=")`, 20000);
const runId = await evaluate(`new URLSearchParams(location.search).get("run")`);
await waitFor(has("Label it where the platform asks"), 60000);
await clickSelector('section[aria-label="AI label"] input[type="checkbox"]');
await waitFor(has("kept with this result"), 20000);
await scrollTo('section[aria-label="AI label"]', -60);
await shot("11-ai-label-desktop");
await setViewport(390, 844, true);
await open(`/app/runs/${runId}`);
await waitFor(has("Label it where the platform asks"), 30000);
await scrollTo('section[aria-label="AI label"]', -20);
await shot("11-ai-label-phone");

/* The report form, then the owners' queue */
for (const [size, w, h, mobile] of BOTH) {
  await setViewport(w, h, mobile);
  await open(`/report?what=${runId}`);
  await waitFor(has("Something wrong on WOVI?"));
  await type("select", "impersonation");
  await type("textarea", "This hook speaks as a real local baker, as if she recommends the shop. She never did.");
  await type('input[type="email"]', "sam@example.com");
  await clickSelector('form input[type="checkbox"]');
  await noSideScroll();
  await shot(`12-report-form-${size}`);
}
await setViewport(1440, 900, false);
await clickText("Send the report");
await waitFor(has("Your reference is"), 20000);
await shot("13-report-sent-desktop", 600);
for (const [size, w, h, mobile] of BOTH) {
  await setViewport(w, h, mobile);
  await open("/app/settings/safety");
  await waitFor(has("Reports and refunds"));
  await check("Impersonation or a deepfake");
  await check("Withdrawal from a purchase");
  await noSideScroll();
  await shot(`14-owner-queue-${size}`);
}
await setViewport(1440, 900, false);
await open("/app/settings/safety");
await type('select[name="outcome"]', "removed");
await type('select[name="ground"]', "Terms 6: content rules (fake reviews, impersonation, deepfakes, false claims)");
await type('textarea[name="note"]', "It speaks as a real person who did not agree to it.");
await clickText("Decide and tell them");
await waitFor(has("Taken down on"), 20000);
await shot("15-owner-decided-desktop", 600);
await open(`/app/runs/${runId}`);
await waitFor(has("Taken down after a report"), 20000);
await shot("16-taken-down-desktop");

/* Your data: Maya's plan (she owns a team), the export, then a lone account deleted */
for (const [size, w, h, mobile] of BOTH) {
  await setViewport(w, h, mobile);
  await open("/account");
  await waitFor(has("Your data"));
  await scrollTo("#your-data", -60);
  await shot(`17-your-data-${size}`);
}
const exported = await evaluate(`fetch("/account/export").then(async (r) => ({ type: r.headers.get("content-type"), disposition: r.headers.get("content-disposition"), body: await r.json() }))`);
if (exported.body.account.email !== EMAIL || !exported.disposition.includes("attachment")) throw new Error("the export did not hold the account");
console.log("export:", exported.type, exported.disposition, Object.keys(exported.body).join(", "));

await setViewport(1440, 900, false);
await signIn("lena@example.com");
await open("/account");
await scrollTo("#your-data", -60);
await type('input[name="confirm"]', "lena@example.com");
await scrollTo('input[name="confirm"]', -420);
await shot("18-delete-account-desktop");
await setViewport(390, 844, true);
await open("/account");
await scrollTo('input[name="confirm"]', -500);
await shot("18-delete-account-phone");
await setViewport(1440, 900, false);
await open("/account");
await type('input[name="confirm"]', "lena@example.com");
await clickText("Delete my account");
await waitFor(`location.search.includes("account=deleted")`, 20000);
await open("/");
await scrollTo("footer", 0);
await evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
await shot("19-home-legal-links-desktop");

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
console.log("done:", OUT);
