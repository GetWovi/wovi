/**
 * Screen-sized screenshots of the Agent Builder with headless Chrome over the
 * DevTools protocol. Joins through the real hidden join page with Chrome's
 * virtual authenticator, so the passkey flow runs end to end.
 *
 * The built site must be running on BASE (npm run build && npm start) with the
 * same WOVI_DATA_DIR this script uses, and the launch agents seeded.
 *
 * Run: WOVI_DATA_DIR=... node scripts/builder-screens.mjs [outDir]
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-builder-screens");
const PORT = 9334;
mkdirSync(OUT, { recursive: true });

/* A fresh builder code from the same data dir the server reads. */
const codeOut = execFileSync("npx", ["tsx", "scripts/builder-code.ts", "--label", "Screens"], { encoding: "utf8", env: process.env });
const CODE = /(wovi_builder_[A-Za-z0-9_-]+)/.exec(codeOut)?.[1];
if (!CODE) throw new Error("No builder code came back:\n" + codeOut);

const profile = join(tmpdir(), `wovi-builder-shots-${process.pid}`);
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
await send("DOM.enable");

/* A virtual passkey, so the join page's prompt is answered without a person. */
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

/** Types into a React-controlled field: native setter plus an input event. */
async function type(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("no element " + ${JSON.stringify(selector)});
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    return true; })()`);
}

/** Clicks the first button whose text matches. */
async function clickText(text, tag = "button") {
  await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(tag)})].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) throw new Error("no ${tag} with text " + ${JSON.stringify(text)}); el.click(); return true; })()`);
}

async function waitFor(expression, ms = 15000) {
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

/** Closes any toasts, so a shot shows the screen and not a notification. */
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

/* ---------- Desktop ---------- */
await setViewport(1440, 900, false);

/* 01 Join, with the code typed in */
await open("/builder/join");
await type('input[name="code"]', CODE);
await type('input[name="name"]', "Funkai");
await shot("01-join-with-code");
await clickText("Create my passkey and join");
/* The action redirects with a client-side navigation: no load event, so poll the path. */
await waitFor(`location.pathname === "/builder" && document.querySelector('a[href^="/builder/agents/"]')`);
await applyTheme("night");

/* 02 Home with the seeds */
await shot("02-builder-home", 1600);

/* 03, 04 Create by prompt, before and after */
await open("/builder/new");
await shot("03-create-by-prompt-before");
await type('textarea[name="description"]', "writes 10 scroll-stopping hooks for TikTok from a product idea, punchy, no clickbait");
await clickText("Draft the agent");
await waitFor(`document.body.textContent.includes("Open in the editor")`);
await shot("04-create-by-prompt-after", 1500);

/* 05 to 08 The editor */
await clickText("Open in the editor");
await waitFor(`location.pathname.startsWith("/builder/agents/") && document.querySelector("#basics")`);
await applyTheme("night");
const editorPath = await evaluate(`location.pathname`);
await shot("05-editor-top", 1600);
await scrollTo("#inputs");
await shot("06-editor-inputs");
await scrollTo("#output");
await shot("07-editor-output");
/* A validation error: an instruction placeholder with no input, and an empty name. */
await scrollTo("top");
await type('#basics input[maxlength="40"]', "");
await evaluate(`(() => { const ta = document.querySelector('textarea[aria-label="Instructions"]'); const proto = HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(ta, ta.value + "\\nAlso use {{audience}} here."); ta.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await sleep(300);
await shot("08-editor-validation-error");

/* 09 Samples: one gold sample saved, the form filled for the next */
await evaluate(`(() => { const ta = document.querySelector('textarea[aria-label="Instructions"]'); const proto = HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(ta, ta.value.replace("\\nAlso use {{audience}} here.", "")); ta.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await type('#basics input[maxlength="40"]', "Hook Writer");
await sleep(200);
await clickText("Samples");
await sleep(400);
await type('form textarea[rows="3"]', "Gerald, our sourdough starter, turns nine this week. He has never missed a bake.");
await type('form input[maxlength="80"]', "Gerald turns nine");
await evaluate(`(() => { const ta = [...document.querySelectorAll("form textarea")].find((t) => t.rows === 7); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, "Gerald is nine. He has never missed a bake.\\nNine years of feeding one jar at 5 a.m.\\nThe starter is older than our oven.\\nWe named him Gerald. He named nothing back.\\nEvery loaf you ate this year started with him.\\nHe survived two moves and one power cut.\\nGerald does not do discounts.\\nThe only thing we never sold: Gerald.\\nNine years, one jar, zero days off.\\nMeet the oldest employee at the bakery."); ta.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
await type('form input[maxlength="500"]', "Names the thing, every line could only be about Gerald.");
await clickText("Save sample");
await waitFor(`document.body.textContent.includes("Gerald turns nine") && document.querySelectorAll("[class*=sampleTitle]").length > 0`);
await sleep(600);
await type('form textarea[rows="3"]', "We finally fixed the croissant lamination after burning forty of them.");
await type('form input[maxlength="80"]', "Forty burned croissants");
await scrollTo("top");
await shot("09-samples", 1500);

/* 10 Mood board: a swatch, a text, a link and an image */
await clickText("Mood board");
await sleep(400);
await clickText("Swatch");
await type('input[aria-label="Hex"]', "#FF5A1F");
await type('input[maxlength="300"]', "Blaze for the one line that matters");
await clickText("Add to the board");
await waitFor(`document.querySelectorAll("[class*=boardItem]").length >= 1`);
await clickText("Text");
await type('form textarea[rows="3"]', "Short. Dry. Names the thing. Never sells in the first line.");
await type('input[maxlength="300"]', "The voice in one breath");
await clickText("Add to the board");
await waitFor(`document.querySelectorAll("[class*=boardItem]").length >= 2`);
await clickText("Link");
await type('input[type="url"]', "https://example.com/bakery/gerald-turns-nine");
await type('input[maxlength="300"]', "The pacing of the Gerald post");
await clickText("Add to the board");
await waitFor(`document.querySelectorAll("[class*=boardItem]").length >= 3`);
await clickText("Image");
const png = join(tmpdir(), `wovi-board-${process.pid}.png`);
writeFileSync(png, makePng());
const { root } = await send("DOM.getDocument");
const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
await send("DOM.setFileInputFiles", { nodeId, files: [png] });
await evaluate(`(() => { const el = document.querySelector('input[type="file"]'); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
await type('input[maxlength="300"]', "Flour dust in morning light");
await clickText("Add to the board");
await waitFor(`document.querySelectorAll("[class*=boardItem]").length >= 4`);
await sleep(400);
await scrollTo('[role="tablist"]', -8);
await shot("10-mood-board", 1500);

/* 11 Light mode of the home */
await open("/builder", "light");
await shot("11-builder-home-light", 1600);

/* ---------- Phone ---------- */
await setViewport(390, 844, true);
await open("/builder");
await shot("12-builder-home-phone", 1600);
await open("/builder/new");
await shot("13-create-by-prompt-phone");
await open(editorPath);
await shot("14-editor-phone", 1600);

ws.close();
chrome.kill();
rmSync(profile, { recursive: true, force: true });
rmSync(png, { force: true });
console.log("done");

/* A small PNG drawn by hand: a warm cream and rust gradient, so the board has a real image. */
function makePng() {
  const w = 320;
  const h = 240;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [0];
    for (let x = 0; x < w; x++) {
      const t = x / w;
      const s = y / h;
      row.push(Math.round(255 - 60 * t), Math.round(244 - 150 * t * s), Math.round(220 - 190 * t));
    }
    rows.push(Buffer.from(row));
  }
  const raw = Buffer.concat(rows);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
