import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";
import { PlugIn } from "@/components/home/PlugIn";
import { API_KEY_PREFIX } from "@/lib/accounts/api-keys";
import { matchRoute } from "@/lib/api/routes";
import { RunSchema, StartRunBody } from "@/lib/api/schemas";
import { KEY_PLACEHOLDER, mcpSnippets } from "@/lib/api/snippets";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { gateFor } from "@/lib/quality/data";
import { validateRunInputs } from "@/lib/runs/inputs";
import { GITHUB_URL, SITE_URL, X_URL } from "@/lib/site";
import { CODE_TABS } from "./demo-data";

const APP_DIR = join(process.cwd(), "src", "app");

/** Every page and route handler under src/app, as a pattern: [x] is one segment, [[...x]] and [...x] are the rest. */
function appRoutes(): RegExp[] {
  const out: RegExp[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(page|route)\.tsx?$/.test(name)) {
        const segs = relative(APP_DIR, dir).split(sep).filter(Boolean);
        const re = segs
          .map((s) => (/^\[\[\.\.\.\w+\]\]$/.test(s) ? "(?:/.*)?" : /^\[\.\.\.\w+\]$/.test(s) ? "/.+" : /^\[\w+\]$/.test(s) ? "/[^/]+" : `/${s.replace(/[.]/g, "\\.")}`))
          .join("");
        out.push(new RegExp(`^${re || "/"}$`));
      }
    }
  };
  walk(APP_DIR);
  return out;
}

const ROUTES = appRoutes();
const isRoute = (path: string) => ROUTES.some((r) => r.test(path));

function homeHtml(): string {
  // next/dynamic may leave the code panel out of a server render here, so render it on its own as well.
  return renderToStaticMarkup(createElement(Home)) + renderToStaticMarkup(createElement(PlugIn));
}

function anchors(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

describe("the homepage links", () => {
  const html = homeHtml();
  const hrefs = anchors(html);

  it("has links into the product: sign in, the app, the agents, credits and the API", () => {
    for (const want of ["/sign-in", "/app", "/app/make", "/app/credits", "/app/settings/api", "/api/v1/openapi.json"]) expect(hrefs).toContain(want);
  });

  it("every href goes to a real route, an anchor on the page, an https site or the contact address", () => {
    expect(hrefs.length).toBeGreaterThan(15);
    for (const href of hrefs) {
      if (href.startsWith("#")) {
        expect(href.length, href).toBeGreaterThan(1);
        expect(html, `anchor ${href}`).toContain(`id="${href.slice(1)}"`);
      } else if (href.startsWith("/")) {
        const path = href.split(/[?#]/)[0];
        expect(isRoute(path), `route for ${href}`).toBe(true);
        if (path.startsWith("/api/v1/")) {
          const sub = path.slice("/api/v1".length);
          expect(sub === "/openapi.json" || !!matchRoute("GET", sub), href).toBe(true);
        }
      } else if (href.startsWith("mailto:")) {
        expect(href).toBe("mailto:getwovi@gmail.com");
      } else {
        expect(href, href).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/);
      }
    }
  });

  it("never links builder-only pages, a bare #, or the early-access mail", () => {
    for (const href of hrefs) {
      expect(href).not.toBe("#");
      expect(href).not.toMatch(/^\/(design|builder)(\/|$)/);
      expect(href).not.toMatch(/early/i);
    }
  });

  it("shows GitHub only once a repo is set, and X from the one constant", () => {
    expect(hrefs).toContain(X_URL);
    if (GITHUB_URL) expect(hrefs).toContain(GITHUB_URL);
    else expect(html).not.toMatch(/GitHub/);
  });

  it("leaves no bare # link and no hard-coded GitHub link anywhere in the site's code", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx$/.test(name)) files.push(full);
      }
    };
    walk(join(process.cwd(), "src"));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/href=["']#["']/);
      expect(src, f).not.toMatch(/href=["']https:\/\/github\.com/);
    }
  });

  it("names no person and uses no em dash", () => {
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/funkai/i);
    expect(text).not.toContain("\u2014");
  });
});

describe("the homepage code samples", () => {
  const all = CODE_TABS.map((t) => t.code).join("\n");

  it("use the launch address, the real key format and nothing made up", () => {
    expect(KEY_PLACEHOLDER.startsWith(API_KEY_PREFIX)).toBe(true);
    for (const t of CODE_TABS) {
      for (const m of t.code.matchAll(/wovi_[a-z]+_/g)) expect(m[0], t.id).toBe(API_KEY_PREFIX);
      for (const m of t.code.matchAll(/https?:\/\/[^\s"'\\]+/g)) expect(m[0].startsWith(`${SITE_URL}/`), `${t.id}: ${m[0]}`).toBe(true);
    }
    expect(all).not.toMatch(/wovi\.app|wovi_live_|@wovi\/mcp|\/v1\/runs\b(?!\/)/);
  });

  it("only use paths the API and the MCP route really have", async () => {
    const mcp = await import("@/app/mcp/route");
    const urls = [...all.matchAll(new RegExp(`${SITE_URL.replace(/[.]/g, "\\.")}(/[^\\s"'\\\\]*)`, "g"))].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(3);
    for (const path of urls) {
      if (path === "/mcp") {
        expect(typeof mcp.POST).toBe("function");
        continue;
      }
      expect(path.startsWith("/api/v1/"), path).toBe(true);
      const sub = path.slice("/api/v1".length);
      if (sub === "/openapi.json") continue;
      const method = /\/runs$/.test(sub) ? "POST" : "GET";
      const hit = matchRoute(method, sub);
      expect(hit && "route" in hit, `${method} ${sub}`).toBe(true);
    }
  });

  it("start a run with a body the API accepts and inputs Hook Writer's form accepts", () => {
    const api = CODE_TABS.find((t) => t.id === "api")!.code;
    const body = JSON.parse(/-d '([^']+)'/.exec(api)![1]);
    expect(StartRunBody.safeParse(body).success).toBe(true);
    const spec = LAUNCH_AGENTS.find((a) => a.id === "hook-writer")!;
    // The launch spec as written (an input to the registry); its form is the one the engine checks against.
    const form = spec as unknown as Parameters<typeof validateRunInputs>[0];
    expect(validateRunInputs(form, body.inputs).ok).toBe(true);
    expect(api).toContain("/api/v1/agents/hook-writer/runs");
  });

  it("show a result in the run's real shape, with Hook Writer's real bar", () => {
    const api = CODE_TABS.find((t) => t.id === "api")!.code;
    const fields = [...api.matchAll(/^#\s+"(\w+)":/gm)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(4);
    for (const f of fields) expect(Object.keys(RunSchema.shape), f).toContain(f);
    const spec = LAUNCH_AGENTS.find((a) => a.id === "hook-writer")!;
    expect(api).toContain(`"kind": "${spec.output.kind}"`);
    expect(api).toContain(`"bar": ${gateFor(spec).minScore}`);
  });

  it("only name assistants the API and assistants page has a config for", () => {
    const real = mcpSnippets(SITE_URL).map((s) => s.title);
    for (const t of CODE_TABS.filter((t) => t.id !== "api")) expect(real.some((r) => r.startsWith(t.label)), t.label).toBe(true);
  });
});
