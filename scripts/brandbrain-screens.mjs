/**
 * Screen-sized screenshots of the Brand Brain screens (phase 7) with headless
 * Chrome over the DevTools protocol: the list, the editor's tabs, the history,
 * the paste-past-posts flow before and after the proposal, and the builder's
 * test bench with a Brand Brain picked. Joins through the real builder join
 * page with Chrome's virtual authenticator, then works in ws_wovi.
 *
 * The built site must be running on BASE (npm run build && npm start) with the
 * same WOVI_DATA_DIR this script uses, after npm run agents:seed,
 * npm run builder:samples and npm run brains:seed.
 *
 * Run: WOVI_DATA_DIR=... node scripts/brandbrain-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-brandbrain-screens");
const PORT = 9337;
mkdirSync(OUT, { recursive: true });

const codeOut = execFileSync("npx", ["tsx", "scripts/builder-code.ts", "--label", "Brand Brain screens"], { encoding: "utf8", env: process.env });
const CODE = /(wovi_builder_[A-Za-z0-9_-]+)/.exec(codeOut)?.[1];
if (!CODE) throw new Error("No builder code came back:\n" + codeOut);

const profile = join(tmpdir(), `wovi-brandbrain-shots-${process.pid}`);
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
      const y = ${selector === "top" ? 0 : `el.getBoundingClientRect().top + window.scrollY - 76 - 16 + (${offset})`};
      window.scrollTo({ top: y, behavior: "instant" }); return y; })()`,
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

/** Sets a field's value the way typing does, then presses Enter in it. */
async function typeEnter(selector, value) {
  await type(selector, value);
  await evaluate(`(() => { document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true; })()`);
  await sleep(150);
}

const POSTS = [
  "Your brakes squeak because they want attention. 10 minutes, no appointment. Our mechanic fixes it while you drink our terrible coffee.",
  "3 things that kill a chain:\n1. Rain\n2. Skipping oil\n3. Ignoring the noise\nWhich one is you?",
  "We trued 14 wheels today. One was older than our mechanic. It still rolls.",
  "Flat tyre at 8 a.m.? Bring it in. Our mechanic opens at 7:30 for exactly this reason. The coffee is still terrible.",
];

async function fillPosts() {
  await waitFor(has("Your past posts"));
  await type('input[maxlength="60"]', "Spoke and Chain");
  await type('input[maxlength="80"]', "Bike repair shop in Bristol");
  await clickText("X");
  await clickText("Instagram Reels");
  await clickText("Add a post");
  await sleep(200);
  for (const [i, p] of POSTS.entries()) await type(`textarea[aria-label="Post ${i + 1}"]`, p);
  await sleep(300);
}

/* ---------- Desktop ---------- */
await setViewport(1440, 900, false);

/* Join, then work in ws_wovi where the example Brand Brains are */
await open("/builder/join");
await type('input[name="code"]', CODE);
await type('input[name="name"]', "Funkai");
await clickText("Create my passkey and join");
await waitFor(`location.pathname === "/builder" && document.querySelector('a[href^="/builder/agents/"]')`);
await open("/brand-brain");
await waitFor(`document.querySelector("select")`);
await type("select", "ws_wovi");
await waitFor(has("Crumb and Co"), 20000);
const crumb = await evaluate(`document.querySelector('a[href^="/brand-brain/bb_"]').getAttribute("href")`);

/* Two edits by the builder, so the history has real authors */
await open(`${crumb}?tab=rules`);
await waitFor(has("Check a draft"));
await typeEnter('input[aria-label="Add to Don\'t"]', 'Never say "limited time"');
await type('input[placeholder="Shown in the history"]', "No sale talk");
await clickText("Save");
await waitFor(has("Version 2"), 20000);
await open(crumb);
await waitFor(has("How it sounds"));
await typeEnter('input[aria-label="Add to Lines that sound right"]', "Gerald does not do discounts.");
await typeEnter('input[aria-label="Add to Words to use"]', "still warm");
await type('input[placeholder="Shown in the history"]', "One more line from Gerald");
await clickText("Save");
await waitFor(has("Version 3"), 20000);

/* 01 The list */
await open("/brand-brain");
await waitFor(has("Night Owl Coffee"));
await shot("01-brand-brain-list", 1500);

/* 02 to 05 The editor */
await open(crumb);
await waitFor(has("What agents read"));
await shot("02-editor-voice", 1500);
await open(`${crumb}?tab=references`);
await waitFor(has("Add a reference"));
await shot("03-editor-references", 1500);
await open(`${crumb}?tab=mood`);
await waitFor(has("Add to the mood board"));
await shot("04-editor-mood-board", 1800);
const draft = "Our artisanal sourdough, only for a limited time! #bread\n\nGerald is nine. He has never missed a bake.";
await open(`${crumb}?tab=rules&draft=${encodeURIComponent(draft)}`);
await waitFor(has("Breaks"));
await shot("05-editor-dos-donts", 1500);

/* 06 History */
await open(`${crumb}?tab=history`);
await waitFor(has("What changed"));
await shot("06-history", 1500);

/* 07 and 08 Paste past posts, before and after the proposal */
await open("/brand-brain/new");
await fillPosts();
await scrollTo("top");
await shot("07-paste-posts-before", 1200);
await clickText("Read my posts");
await waitFor(has("What we noticed"), 30000);
await scrollTo("top");
await shot("08-paste-posts-proposal", 1500);

/* 09 The test bench with a Brand Brain picked */
await open("/builder/agents/hook-writer/bench");
await waitFor(has("about $"));
const night = await evaluate(`[...document.querySelectorAll("select option")].find((o) => o.textContent === "Night Owl Coffee").value`);
await evaluate(`(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === ${JSON.stringify(night)})); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, ${JSON.stringify(night)}); s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
await sleep(300);
await clickText("Run all");
await waitFor(has("done on v"), 90000);
await sleep(800);
await scrollTo('[class*="benchGrid"]', -8);
await shot("09-bench-with-brand-brain", 1500);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);
await open("/brand-brain");
await waitFor(has("Night Owl Coffee"));
await shot("10-brand-brain-list-phone", 1500);
await open("/brand-brain/new");
await fillPosts();
await clickText("Read my posts");
await waitFor(has("What we noticed"), 30000);
await scrollTo("top");
await shot("11-paste-posts-proposal-phone", 1500);

/* Save the proposal, to see the whole flow land */
await clickText("Save Brand Brain");
await waitFor(`location.pathname.startsWith("/brand-brain/bb_")`, 20000);
await waitFor(has("Spoke and Chain") + "&&" + has("Built from 4 past posts"));
console.log("saved the proposal as", await evaluate("location.pathname"));

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
