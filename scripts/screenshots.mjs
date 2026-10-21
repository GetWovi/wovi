/**
 * Screen-sized screenshots of the site with headless Chrome over the DevTools
 * protocol. No dependencies: Node's fetch and WebSocket. The site must be
 * running on http://localhost:3900 (npm run build && npm start).
 *
 * Run: node scripts/screenshots.mjs [outDir]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE ?? "http://localhost:3900";
const OUT = process.argv[2] ?? join(process.env.HOME, "WOVI-design-screens");
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const profile = join(tmpdir(), `wovi-shots-${process.pid}`);
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });

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
  return r.result?.value;
}

await send("Page.enable");
await send("Runtime.enable");

async function setViewport(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
}

async function open(path, theme = "night") {
  const loaded = new Promise((resolve) => {
    const fn = (msg) => {
      if (msg.method === "Page.loadEventFired") {
        events.splice(events.indexOf(fn), 1);
        resolve();
      }
    };
    events.push(fn);
  });
  await send("Page.navigate", { url: `${BASE}${path}` });
  await loaded;
  await evaluate(`(async () => { localStorage.setItem("wovi-theme", "${theme}"); document.documentElement.setAttribute("data-theme", "${theme}"); await document.fonts.ready; return true; })()`);
  await sleep(600);
}

async function scrollTo(selector, offset = 0) {
  await evaluate(
    `(() => { const el = ${selector === "top" ? "null" : selector === "bottom" ? "document.body" : `document.querySelector(${JSON.stringify(selector)})`};
      const y = ${selector === "top" ? 0 : selector === "bottom" ? "document.documentElement.scrollHeight" : `el.getBoundingClientRect().top + window.scrollY - 76 + (${offset})`};
      window.scrollTo({ top: y, behavior: "instant" }); window.dispatchEvent(new Event("scroll")); return y; })()`,
  );
}

async function shot(name, settle = 1600) {
  await sleep(settle);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("wrote", `${name}.png`);
}

/* Desktop, scrolled section by section */
await setViewport(1440, 900, false);
await open("/");
await shot("01-hero-desktop", 2200);
await scrollTo("#demo", 300);
await shot("02-job-demo-desktop", 7500);
await scrollTo("#pipeline");
await shot("03-pipeline-desktop");
await scrollTo("#pipeline", 330);
await shot("04-pipeline-stages-desktop");
await scrollTo("#brand-brain");
await shot("05-brand-brain-desktop");
await scrollTo("#agents");
await shot("06-agents-desktop");
await scrollTo("#agents", 620);
await shot("07-agent-states-desktop");
await scrollTo("#anti-slop");
await shot("08-anti-slop-desktop", 2200);
await scrollTo("#plug-in");
await shot("09-mcp-api-desktop", 3200);
await scrollTo("#creators");
await shot("10-creators-desktop");
await scrollTo("#closing-title", -140);
await shot("11-closing-desktop");
await scrollTo("bottom");
await shot("12-footer-desktop");

/* Light mode, hero */
await open("/", "light");
await shot("13-hero-light-desktop", 2200);

/* Design page */
await open("/design");
await shot("14-design-logo-desktop", 1200);
await scrollTo("#mascot");
await shot("15-design-mascot-desktop");
await scrollTo("#colour");
await shot("16-design-colour-desktop");
await scrollTo("#components");
await shot("17-design-components-desktop");
await open("/design", "light");
await scrollTo("#mascot");
await shot("18-design-mascot-light-desktop");

/* Phone */
await setViewport(390, 844, true);
await open("/");
await shot("19-hero-phone", 2200);
await scrollTo("#demo", 420);
await shot("20-job-demo-phone", 7500);
await scrollTo("#agents");
await shot("21-agents-phone");
await scrollTo("#closing-title", -120);
await shot("22-closing-phone");
await open("/design");
await scrollTo("#mascot");
await shot("23-design-mascot-phone");

ws.close();
chrome.kill();
rmSync(profile, { recursive: true, force: true });
console.log("done");
