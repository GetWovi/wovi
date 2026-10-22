/**
 * Screen-sized screenshots of pipelines (phase 10) with headless Chrome over
 * the DevTools protocol: starting a template, a run mid-way, the pick-a-hook
 * moment, the final package, history with a pipeline run, the builder's
 * pipeline editor, and two phone views. Everything runs on the FAKE provider:
 * no key, no network, no money.
 *
 * It signs in through the real email flow (the dev mailer writes the code
 * into <dataDir>/mail/), skips onboarding, seeds the example Brand Brains
 * into the new workspace, then joins the builder with a fresh builder code
 * and Chrome's virtual authenticator for the editor.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-pipeline-screens npm run agents:launch
 *   WOVI_DATA_DIR=/tmp/wovi-pipeline-screens WOVI_FAKE_LATENCY_MS=4000 npm start
 *   WOVI_DATA_DIR=/tmp/wovi-pipeline-screens node scripts/pipeline-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const DATA = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-pipeline-screens");
const EMAIL = process.env.WOVI_SHOT_EMAIL ?? "maya@example.com";
const PORT = 9341;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), `wovi-pipeline-shots-${process.pid}`);
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

function workspaceOf(email) {
  const data = JSON.parse(readFileSync(join(DATA, "accounts.json"), "utf8"));
  return data.users.find((u) => u.email === email).personalWorkspaceId;
}

async function pickBrain(name) {
  await evaluate(`(() => {
    const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.textContent.startsWith(${JSON.stringify(name)})));
    if (!s) throw new Error("no picker with " + ${JSON.stringify(name)});
    const v = [...s.options].find((o) => o.textContent.startsWith(${JSON.stringify(name)})).value;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, v);
    s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await sleep(200);
}

/** Clicks an option of the pick by its number. */
async function chooseOption(n) {
  await evaluate(`(() => { const o = document.querySelectorAll('[role="radio"]')[${n - 1}]; if (!o) throw new Error("no option ${n}"); o.click(); return true; })()`);
  await sleep(200);
}

const runId = () => evaluate(`location.pathname.split("/").pop()`);

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
console.log(execFileSync("npx", ["tsx", "scripts/seed-brains.ts", workspaceOf(EMAIL)], { encoding: "utf8", env: { ...process.env, WOVI_DATA_DIR: DATA } }).trim());

/* 09 The pipelines page */
await open("/app/pipelines");
await waitFor(has("Start from a template"));
await shot("09-pipelines-page", 1500);

/* 01 Start a template: Idea to ready post, filled for Crumb and Co */
await open("/app/pipelines/idea-to-post");
await waitFor(has("Start the pipeline"));
await pickBrain("Crumb and Co");
await clickText("Fill with an example");
await sleep(300);
await shot("01-start-template", 1200);

/* 03 The pick-a-hook moment */
await clickText("Start the pipeline");
await waitFor(`location.pathname.startsWith("/app/pipelines/runs/")`, 20000);
const first = await runId();
await waitFor(has("Your turn: pick the hook"), 60000);
await scrollTo('[aria-live="polite"]', 0);
await shot("03-pick-a-hook", 1500);

/* 02 Running mid-way: the hook is picked, the script is being written */
await chooseOption(3);
await clickText("Use number 3");
await waitFor(has("Script Writer is writing in your voice"), 20000);
await scrollTo('[aria-live="polite"]', 0);
await shot("02-running-midway", 600);

/* 04 The final package */
await waitFor(has("Your post is ready") + "||" + has("Ready, with something to check"), 90000);
await sleep(800);
await scrollTo('[class*="package"]', 0);
await shot("04-final-package", 1500);

/* Approve it, with a note */
await scrollTo('[class*="approve"]', -300);
await type('input[placeholder="For Friday, with the second caption"]', "Saturday morning, before the shop opens.");
await clickText("Approve");
await waitFor(has("Approved and ready to post"), 20000);
await scrollTo("top");
await shot("12-approved", 1200);

/* A second pipeline that waits for a pick, and one agent run, so history shows a mix */
await open("/app/pipelines/caption-and-tags");
await waitFor(has("Start the pipeline"));
await pickBrain("Night Owl Coffee");
await clickText("Fill with an example");
await clickText("Start the pipeline");
await waitFor(`location.pathname.startsWith("/app/pipelines/runs/")`, 20000);
await waitFor(has("Your turn: pick the caption"), 60000);
await open("/app/make/hook-writer");
await waitFor(has("Fill with an example"));
await pickBrain("Night Owl Coffee");
await clickText("Fill with an example");
await clickText("Run Hook Writer");
await waitFor(has("hooks, ready"), 60000);

/* 05 History with pipeline runs */
await open("/app/history");
await waitFor(has("Every run, and your say on it"));
await shot("05-history", 1500);

/* 11 A step run's own page, inside its chain */
await open(`/app/pipelines/runs/${first}`);
await waitFor(has("See the run"));
const stepRun = await evaluate(`[...document.querySelectorAll('a')].find((a) => a.textContent === "See the run" && a.closest('[data-state]')?.textContent.includes("Write the script")).getAttribute("href")`);
await open(stepRun);
await waitFor(has("See the whole chain"));
await shot("11-step-run-in-chain", 1500);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);

/* 07 The pick on a phone */
await open("/app/pipelines/idea-to-post");
await waitFor(has("Start the pipeline"));
await pickBrain("Crumb and Co");
await clickText("Fill with an example");
await clickText("Start the pipeline");
await waitFor(`location.pathname.startsWith("/app/pipelines/runs/")`, 20000);
await waitFor(has("Your turn: pick the hook"), 60000);
await scrollTo('[class*="pick"]', 0);
await shot("07-phone-pick-a-hook", 1500);

/* 08 The package on a phone */
await open(`/app/pipelines/runs/${first}`);
await waitFor(has("Approved and ready to post"));
await scrollTo('[class*="package"]', 0);
await shot("08-phone-final-package", 1500);

/* ---------- The builder ---------- */
await setViewport(1440, 900, false);
const codeOut = execFileSync("npx", ["tsx", "scripts/builder-code.ts", "--label", "Pipeline screens"], { encoding: "utf8", env: { ...process.env, WOVI_DATA_DIR: DATA } });
const CODE = /(wovi_builder_[A-Za-z0-9_-]+)/.exec(codeOut)?.[1];
if (!CODE) throw new Error("No builder code came back:\n" + codeOut);
await open("/builder/join");
await type('input[name="code"]', CODE);
await type('input[name="name"]', "Funkai");
await clickText("Create my passkey and join");
await waitFor(`location.pathname === "/builder" && document.querySelector('a[href^="/builder/agents/"]')`, 30000);

/* 06 The pipeline editor */
await open("/builder/pipelines/idea-to-post");
await waitFor(has("Where each input comes from"));
await evaluate(`(() => { const el = [...document.querySelectorAll("input")].find((i) => i.value === "Write the hooks"); const card = el.closest('[class*="stepHead"]').parentElement; window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 92, behavior: "instant" }); return true; })()`);
await shot("06-builder-pipeline-editor", 1500);

/* 10 A broken mapping and its message */
await type('select[aria-label="Caption or post comes from"]', "input:platform");
await sleep(400);
await evaluate(`(() => { const el = document.querySelector('select[aria-label="Caption or post comes from"]'); const card = el.closest('[class*="step"]'); window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 92, behavior: "instant" }); return true; })()`);
await shot("10-builder-editor-validation", 1200);

/* The builder's list of pipelines */
await open("/builder/pipelines");
await waitFor(has("Idea to ready post"));
await shot("13-builder-pipelines", 1200);

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
