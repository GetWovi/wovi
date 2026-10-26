/**
 * Screen-sized screenshots of the app screens (phase 9) with headless Chrome
 * over the DevTools protocol: onboarding step by step, the app home, an
 * agent's form, a run on the move, results for hooks, a script and
 * repurposed posts, a quick edit, the history with the human approve step,
 * the homepage agent cards, light mode, and the phone.
 *
 * It signs in through the real email flow (the dev mailer writes the code
 * into <dataDir>/mail/), walks onboarding as a new person, then seeds the
 * example Brand Brains into that workspace so results run against a real
 * voice. Everything runs on the FAKE provider: no key, no network, no money.
 *
 * The built site must be running on BASE with the same WOVI_DATA_DIR this
 * script uses, after `npm run agents:launch`, and with WOVI_FAKE_LATENCY_MS
 * set (4000 works) so a running state can be seen:
 *
 *   WOVI_DATA_DIR=/tmp/wovi-app-screens npm run agents:launch
 *   WOVI_DATA_DIR=/tmp/wovi-app-screens WOVI_FAKE_LATENCY_MS=4000 npm start
 *   WOVI_DATA_DIR=/tmp/wovi-app-screens node scripts/app-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-app-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "ellis@example.com";
const PORT = 9339;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), `wovi-app-shots-${process.pid}`);
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

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
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
    const el = typeof ${JSON.stringify(selector)} === "string" ? document.querySelector(${JSON.stringify(selector)}) : null;
    if (!el) throw new Error("no element " + ${JSON.stringify(selector)});
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    return true; })()`);
}

/** Types into the control a <label> names. */
async function typeLabel(label, value) {
  await evaluate(`(() => {
    const l = [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)}));
    if (!l) throw new Error("no label " + ${JSON.stringify(label)});
    const el = document.getElementById(l.htmlFor);
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

/** The six-digit code from the newest dev mail to the address. */
function latestCode(to) {
  const dir = join(DATA, "mail");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(`${to}.txt`))
    .sort();
  if (!files.length) throw new Error(`no mail to ${to} in ${dir}`);
  const text = readFileSync(join(dir, files[files.length - 1]), "utf8");
  const code = /code: (\d{6})/.exec(text)?.[1];
  if (!code) throw new Error("no code in " + files[files.length - 1]);
  return code;
}

/** The personal workspace of the signed-in person, from the accounts store. */
function workspaceOf(email) {
  const data = JSON.parse(readFileSync(join(DATA, "accounts.json"), "utf8"));
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`no user ${email}`);
  return user.personalWorkspaceId;
}

const POSTS = [
  "Your brakes squeak because they want attention. 10 minutes, no appointment. Our mechanic fixes it while you drink our terrible coffee.",
  "3 things that kill a chain:\n1. Rain\n2. Skipping oil\n3. Ignoring the noise\nWhich one is you?",
  "We trued 14 wheels today. One was older than our mechanic. It still rolls.",
  "Flat tyre at 8 a.m.? Bring it in. Our mechanic opens at 7:30 for exactly this reason. The coffee is still terrible.",
];

async function fillBrand() {
  await waitFor(has("Who are you, and where do you post?"));
  await typeLabel("Brand or business name", "Spoke and Chain");
  await typeLabel("What you do", "Bike repair shop in Bristol");
  await clickText("X");
  await clickText("Instagram Reels");
  await sleep(200);
}

async function fillPosts() {
  await waitFor(has("Paste 3 to 5 posts"));
  await clickText("Add a post");
  await sleep(200);
  for (const [i, p] of POSTS.entries()) await type(`textarea[aria-label="Post ${i + 1}"]`, p);
  await sleep(300);
}

/** Picks a Brand Brain in the agent form's picker by name. */
async function pickBrain(name) {
  await evaluate(`(() => {
    const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent.startsWith(${JSON.stringify(name)})));
    if (!s) throw new Error("no picker with " + ${JSON.stringify(name)});
    const v = [...s.options].find((o) => o.textContent.startsWith(${JSON.stringify(name)})).value;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, v);
    s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await sleep(200);
}

async function runAndWait(buttonText) {
  await clickText(buttonText);
  await waitFor(has("In the queue") + "||" + has("Writing in your voice"), 20000);
}

/* ---------- Desktop ---------- */
await setViewport(1440, 900, false);

/* Sign in with an email code: a new account, straight into onboarding */
await open("/sign-in?next=%2Fapp");
await waitFor(`document.querySelector('input[name="email"]')`);
await type('input[name="email"]', EMAIL);
await clickText("Email me a sign-in link");
await waitFor(has("We sent a link and a six-digit code"), 20000);
await sleep(500);
await type('input[name="code"]', latestCode(EMAIL));
await clickText("Sign in");
await waitFor(path("/app/welcome"), 30000);

/* 01 to 04 Onboarding */
await waitFor(has("Hi, I am Wovi"));
await shot("01-onboarding-welcome", 1500);
await clickText("Let's go");
await fillBrand();
await shot("02-onboarding-niche-platforms", 1200);
await clickText("Next: your posts");
await fillPosts();
await scrollTo("top");
await shot("03-onboarding-paste-posts", 1200);
await clickText("Read my posts");
await waitFor(has("Does it sound like you?"), 30000);
await scrollTo("top");
await shot("04-onboarding-review-voice", 1500);
await clickText("Save and start");
await waitFor(path("/app"), 30000);
await waitFor(has("Spoke and Chain"));

/* The example Brand Brains into this workspace, so results run against a real voice */
const WS = workspaceOf(EMAIL);
console.log(execFileSync("npx", ["tsx", "scripts/seed-brains.ts", WS], { encoding: "utf8", env: { ...process.env, WOVI_DATA_DIR: DATA } }).trim());

/* 06 to 08 Hook Writer: the form, the run on the move, the result */
await open("/app/make/hook-writer");
await waitFor(has("Fill with an example"));
await pickBrain("Night Owl Coffee");
await clickText("Fill with an example");
await sleep(300);
await shot("06-agent-form-hook-writer", 1200);
await runAndWait("Run Hook Writer");
await shot("07-running", 400);
await waitFor(has("hooks, ready"), 60000);
await scrollTo("top");
await shot("08-result-hooks", 1500);
const hooksRun = await evaluate(`new URLSearchParams(location.search).get("run")`);

/* 11 A quick edit runs it again with a note */
await clickText("Punchier");
await waitFor(has("In the queue") + "||" + has("Writing in your voice"), 20000);
await waitFor(has("hooks, ready"), 60000);
await waitFor(has("Quick edit: Punchier"));
await scrollTo("top");
await shot("11-quick-edit-punchier", 1500);

/* 09 Script Writer */
await open("/app/make/script-writer");
await waitFor(has("Fill with an example"));
await pickBrain("Crumb and Co");
await clickText("Fill with an example");
await runAndWait("Run Script Writer");
await waitFor(has("beats, ready"), 60000);
await scrollTo("top");
await shot("09-result-script", 1500);

/* 10 Platform Repurposer, with the rights confirmation */
await open("/app/make/repurposer");
await waitFor(has("Fill with an example"));
await pickBrain("Crumb and Co");
await clickText("Fill with an example");
await evaluate(`(() => { const c = document.querySelector('input[type="checkbox"]'); if (!c.checked) c.click(); return true; })()`);
await sleep(200);
await runAndWait("Run Platform Repurposer");
await waitFor(has("versions, ready"), 60000);
await scrollTo("top");
await shot("10-result-repurposed-posts", 1500);

/* A caption that breaks the bakery's rules, so a run needs review */
await open("/app/make/caption-writer");
await waitFor(has("Fill with an example"));
await typeLabel("What the post shows", "Close-up of our artisanal sourdough, mouthwatering crust, Gerald the starter in the background.");
await clickText("TikTok");
await clickText("Instagram Reels");
await pickBrain("Crumb and Co");
await runAndWait("Run Caption Writer");
await waitFor(has("captions, ready"), 60000);
await waitFor(has("Uses words your brand avoids"));

/* Approve the hooks run, so the history shows every state */
await open(`/app/runs/${hooksRun}`);
await waitFor(has("Happy with it?"));
await typeLabel("A note (optional)", "Number 3 for the Saturday post.");
await clickText("Approve");
await waitFor(has("Your decision"), 20000);

/* 12 History and review */
await open("/app/history");
await waitFor(has("Every run, and your say on it"));
await shot("12-history-review", 1500);

/* 05 App home with runs in it */
await open("/app");
await waitFor(has("What do you want to"));
await shot("05-app-home", 1500);

/* 13 The homepage agents section with the new cards */
await open("/");
await waitFor(`document.querySelector("#agents")`);
await scrollTo('#agents [class*="grid"]', -54);
await shot("13-homepage-agents", 2600);

/* 14 Light mode of the app home */
await open("/app", "light");
await waitFor(has("What do you want to"));
await shot("14-app-home-light", 1500);

/* The restyled settings, Brand Brains and account pages in the app chrome */
await open("/app/settings");
await waitFor(has("Your setup"));
await shot("24-settings", 1200);
await open("/brand-brain");
await waitFor(has("Night Owl Coffee"));
await shot("25-brand-brains", 1200);
await open("/account");
await waitFor(has("Members"));
await shot("26-account", 1200);
await open("/app/make");
await waitFor(has("Pick the agent for the job"));
await shot("27-make", 1200);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);
await open("/app/welcome?restart=1");
await waitFor(has("Hi, I am Wovi"));
await shot("15-onboarding-welcome-phone", 1500);
await clickText("Let's go");
await fillBrand();
await shot("16-onboarding-niche-platforms-phone", 1200);
await clickText("Next: your posts");
await fillPosts();
await scrollTo("top");
await shot("17-onboarding-paste-posts-phone", 1200);
await clickText("Read my posts");
await waitFor(has("Does it sound like you?"), 30000);
await scrollTo("top");
await shot("18-onboarding-review-voice-phone", 1500);
/* Leave onboarding without a second Brand Brain */
await open("/app/welcome?step=welcome");
await waitFor(has("Hi, I am Wovi"));
await clickText("Skip for now");
await waitFor(path("/app"), 30000);

await open("/app");
await waitFor(has("What do you want to"));
await shot("19-app-home-phone", 1500);
await open("/app/make/hook-writer");
await waitFor(has("Fill with an example"));
await clickText("Fill with an example");
await shot("20-agent-form-phone", 1200);
await open(`/app/runs/${hooksRun}`);
await waitFor(has("hooks, ready"));
await shot("21-result-hooks-phone", 1500);
await open("/app/history");
await waitFor(has("Every run, and your say on it"));
await shot("22-history-phone", 1500);
await open("/", "night");
await waitFor(`document.querySelector("#agents")`);
await scrollTo("#agents", 16);
await shot("23-homepage-agents-phone", 2600);
await open("/app/make/hook-writer?run=" + hooksRun);
await waitFor(has("hooks, ready"));
await scrollTo('[class*="resultFoot"]', -120);
await shot("28-result-foot-review-phone", 1200);

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
