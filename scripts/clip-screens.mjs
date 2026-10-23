/**
 * Screen-sized screenshots of clip samples in the builder: the upload with
 * progress per file and the refusals, the status of each clip while it is
 * read, and a finished clip sample, at 1440x900 and 390x844, with headless
 * Chrome over the DevTools protocol. Joins through the real join page with
 * Chrome's virtual authenticator, and uploads real files through the page's
 * own file input, with the upload slowed so the progress shows.
 *
 * The built site must be running on BASE with the same WOVI_DATA_DIR, the
 * launch set installed (npm run agents:launch), and clips read by a model
 * (OPENROUTER_API_KEY) or the fake one (WOVI_CLIP_PROVIDER=fake). CLIPS_DIR
 * holds croissant-three-days.mp4, plumber-fat-in-the-sink.mp4,
 * first-squat-chair.mp4, too-long-clip.mp4 (over three minutes) and notes.txt.
 *
 * Run: WOVI_DATA_DIR=... CLIPS_DIR=... node scripts/clip-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-clip-screens");
const CLIPS = process.env.CLIPS_DIR;
if (!CLIPS) throw new Error("Set CLIPS_DIR to the folder with the test clips.");
const PORT = 9337;
mkdirSync(OUT, { recursive: true });

const codeOut = execFileSync("npx", ["tsx", "scripts/builder-code.ts", "--label", "Clip screens"], { encoding: "utf8", env: process.env });
const CODE = /(wovi_builder_[A-Za-z0-9_-]+)/.exec(codeOut)?.[1];
if (!CODE) throw new Error("No builder code came back:\n" + codeOut);

const profile = join(tmpdir(), `wovi-clip-shots-${process.pid}`);
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


async function setFiles(names) {
  const { root } = await send("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
  await send("DOM.setFileInputFiles", { nodeId, files: names.map((n) => join(CLIPS, n)) });
}

async function slowUploads(on) {
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", on ? { offline: false, latency: 40, downloadThroughput: -1, uploadThroughput: 24 * 1024 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

async function tickRights() {
  await evaluate(`(() => { const box = document.querySelector('label input[type="checkbox"]'); if (!box.checked) box.click(); return true; })()`);
}


async function detailShots(href, assign) {
  await open(href);
  await waitFor(has("The text sample"));
  await shot("04-clip-sample", 1500);
  if (assign) {
    for (const name of ["Hook Writer", "Script Writer", "Caption Writer", "Platform Repurposer"]) {
      await evaluate(`(() => { const row = [...document.querySelectorAll('label')].find((l) => l.textContent.startsWith(${JSON.stringify(name)})); row.querySelector('input[type="checkbox"]').click(); return true; })()`);
      await sleep(150);
    }
    await clickText("Add to 4 agents");
  }
  await waitFor(`document.querySelectorAll('[class*="agentRow"] a').length >= 4`, 30000);
  await sleep(600);
  await scrollTo('[class*="agents"]', -150);
  await shot("05-clip-given-to-agents", 1200);
  await scrollTo('[class*="calls"]', -120);
  await shot("06-clip-cost", 800);
  await open("/builder/agents/hook-writer?tab=samples");
  await waitFor(has("From a clip"));
  await evaluate(`(() => { const chip = [...document.querySelectorAll("a")].find((a) => a.textContent.includes("From a clip")); chip.scrollIntoView({ block: "center" }); return true; })()`);
  await shot("07-agent-sample-from-clip", 1200);
}

async function phoneDetail(href) {
  await open(href);
  await waitFor(has("The text sample"));
  await shot("10-phone-clip-sample", 1500);
  await scrollTo("form", -8);
  await shot("11-phone-clip-text", 1000);
}

/* ---------- Desktop ---------- */
await setViewport(1440, 900, false);

await open("/builder/join");
await type('input[name="code"]', CODE);
await type('input[name="name"]', "Funkai");
await clickText("Create my passkey and join");
await waitFor(`location.pathname === "/builder" && document.querySelector('a[href^="/builder/agents/"]')`);

if (process.env.ONLY === "detail") {
  // Re-shoots the clip pages on a data dir the full run already filled, without uploading or reading anything again.
  await open("/builder/clips");
  const href = await evaluate(`[...document.querySelectorAll('[class*="grid"] a')].find((a) => a.textContent.includes("croissant")).getAttribute("href")`);
  await detailShots(href, false);
  await setViewport(390, 844, true);
  await phoneDetail(href);
  ws.close();
  chrome.kill();
  await sleep(800);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log("done");
  process.exit(0);
}

/* 01 The upload: two clips with progress, one too long and one not a video refused before a byte is sent */
await open("/builder/clips");
await waitFor(has("Drop clips here"));
await tickRights();
await slowUploads(true);
await setFiles(["croissant-three-days.mp4", "plumber-fat-in-the-sink.mp4", "too-long-clip.mp4", "notes.txt"]);
await waitFor(`/\\d+% of/.test(document.body.textContent) && document.body.textContent.includes("clips can be at most 3:00") && document.body.textContent.includes("Not a clip")`, 30000);
await sleep(1500);
await scrollTo("top");
await shot("01-upload-progress", 300);

/* 02 Status per clip while they are read */
await waitFor(has("2 of 4 uploaded"), 60000);
await slowUploads(false);
await scrollTo('[class*="grid"] a', -60);
await waitFor(`[...document.querySelectorAll('[class*="pill"]')].some((p) => /Reading|In line/.test(p.textContent))`, 20000);
await shot("02-clip-status-reading", 200);

/* 03 Every clip read */
await waitFor(`[...document.querySelectorAll('[class*="grid"] a')].length >= 2 && [...document.querySelectorAll('[class*="grid"] [class*="pill"]')].every((p) => /Ready|Failed/.test(p.textContent))`, 120000);
await sleep(800);
await scrollTo('[class*="grid"] a', -60);
await shot("03-clips-ready", 1200);

/* 04 to 07: a finished clip sample, given to four launch agents, its cost, and the sample on the agent */
const croissant = await evaluate(`[...document.querySelectorAll('[class*="grid"] a')].find((a) => a.textContent.includes("croissant")).getAttribute("href")`);
await detailShots(croissant, true);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);

/* 08 The upload on a phone: the third clip, and the long one refused */
await open("/builder/clips");
await waitFor(has("Drop clips here"));
await tickRights();
await slowUploads(true);
await setFiles(["first-squat-chair.mp4", "too-long-clip.mp4"]);
await waitFor(`/\\d+% of/.test(document.body.textContent) && document.body.textContent.includes("clips can be at most 3:00")`, 30000);
await sleep(1200);
await scrollTo('[class*="queue"]', -40);
await shot("08-phone-upload-progress", 300);

/* 09 Status per clip on a phone */
await waitFor(has("1 of 2 uploaded"), 60000);
await slowUploads(false);
await scrollTo('[class*="grid"] a', -60);
await waitFor(`[...document.querySelectorAll('[class*="pill"]')].some((p) => /Reading|In line/.test(p.textContent))`, 20000);
await shot("09-phone-clip-status", 200);
await waitFor(`[...document.querySelectorAll('[class*="grid"] [class*="pill"]')].every((p) => /Ready|Failed/.test(p.textContent))`, 120000);

/* 10 and 11 The finished clip sample on a phone */
await phoneDetail(croissant);

ws.close();
chrome.kill();
await sleep(800);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
console.log("done");
