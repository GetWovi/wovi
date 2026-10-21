/**
 * Screen-sized screenshots of the Agent Builder, part 2 (test bench, tuning,
 * versions, batch run) with headless Chrome over the DevTools protocol. Joins
 * through the real join page with Chrome's virtual authenticator.
 *
 * The built site must be running on BASE (npm run build && npm start) with the
 * same WOVI_DATA_DIR this script uses, the launch agents seeded
 * (npm run agents:seed) and the example samples added (npm run builder:samples).
 * Start the server with WOVI_FAKE_LATENCY_MS=2500 so a running state can be
 * caught on screen.
 *
 * Run: WOVI_DATA_DIR=... node scripts/builder2-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-builder2-screens");
const PORT = 9335;
mkdirSync(OUT, { recursive: true });

const codeOut = execFileSync("npx", ["tsx", "scripts/builder-code.ts", "--label", "Screens 2"], { encoding: "utf8", env: process.env });
const CODE = /(wovi_builder_[A-Za-z0-9_-]+)/.exec(codeOut)?.[1];
if (!CODE) throw new Error("No builder code came back:\n" + codeOut);

const profile = join(tmpdir(), `wovi-builder2-shots-${process.pid}`);
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

/* ---------- Desktop ---------- */
await setViewport(1440, 900, false);

/* Join */
await open("/builder/join");
await type('input[name="code"]', CODE);
await type('input[name="name"]', "Funkai");
await clickText("Create my passkey and join");
await waitFor(`location.pathname === "/builder" && document.querySelector('a[href^="/builder/agents/"]')`);

/* 01 Bench before a run */
await open("/builder/agents/hook-writer/bench");
await waitFor(has("about $"));
await shot("01-bench-before-run", 1500);

/* 02 During a run */
await clickText("Run all");
await waitFor(has("Running 0 of 4") + "||" + has("Running 1 of 4") + "||" + has("Running 2 of 4"));
await sleep(1800);
await shot("02-bench-running", 200);

/* 03 Results side by side, with ratings */
await waitFor(has("4 of 4 done"), 90000);
await sleep(800);
await evaluate(`(() => { const groups = document.querySelectorAll('[class*="rateGroup"]'); groups[0].querySelectorAll("button")[0].click(); return true; })()`);
await sleep(600);
await evaluate(`(() => { const groups = document.querySelectorAll('[class*="rateGroup"]'); groups[3].querySelectorAll("button")[2].click(); return true; })()`);
await sleep(600);
await evaluate(`(() => { const notes = document.querySelectorAll('input[aria-label="Rating note"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(notes[0], "Every line is about Gerald."); notes[0].dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await sleep(300);
await scrollTo('[class*="benchStatus"]', -8);
await shot("03-bench-results-rated", 1500);

/* 04 The tuning panel, with a change ready to save: scrolled a little, so the panel is stuck and whole */
await evaluate(`(() => { const ta = document.querySelector('[class*="tuning"] textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(ta, ta.value + "\\nName the thing in every line. Never open with a question."); ta.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await type('[class*="tuning"] input[maxlength="200"]', "Name the thing, no question openers");
await sleep(400);
await scrollTo('[class*="scoreRow"]', -8);
await shot("04-tuning-panel", 1200);

/* Save and re-run, so the history has two scored versions */
await clickText("Save and re-run");
await waitFor(has("on v1.0.1"), 30000);
await waitFor(has("4 of 4 done on v1.0.1"), 90000);
await sleep(800);

/* 05 Version history */
await open("/builder/agents/hook-writer/versions");
await waitFor(has("Saved by"));
await shot("05-version-history", 1500);

/* 06 Compare */
await open("/builder/agents/hook-writer/versions?tab=compare");
await waitFor(has("What changed"));
await shot("06-version-compare", 1500);

/* 07 Rollback confirm */
await open("/builder/agents/hook-writer/versions");
await waitFor(has("Saved by"));
await clickText("Roll back");
await waitFor(has("becomes current again"));
await shot("07-rollback-confirm", 800);
await evaluate(`(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return true; })()`);

/* 08 Batch run summary */
await open("/builder/batch");
await waitFor(has("Run batch"));
await clickText("Run batch");
await waitFor(has("Running"), 30000);
await waitFor(has("of ") + "&&" + `!document.body.textContent.includes("Running ")`, 180000);
await sleep(800);
await scrollTo('[class*="agentPick"]', -70);
await shot("08-batch-summary", 1500);

/* 09 Light mode of the bench with results */
await open("/builder/agents/hook-writer/bench", "light");
await waitFor(has("done on v"));
await scrollTo('[class*="benchStatus"]', -8);
await shot("09-bench-results-light", 1500);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);
await open("/builder/agents/hook-writer/bench");
await waitFor(has("done on v"));
await scrollTo('[class*="benchStatus"]', -8);
await shot("10-bench-results-phone", 1500);
await open("/builder/agents/hook-writer/versions");
await waitFor(has("Saved by"));
await shot("11-version-history-phone", 1500);

ws.close();
chrome.kill();
rmSync(profile, { recursive: true, force: true });
console.log("done");
