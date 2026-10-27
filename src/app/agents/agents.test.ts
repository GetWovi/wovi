import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AgentPublicPage, { dynamicParams, generateMetadata, generateStaticParams } from "@/app/agents/[id]/page";
import AgentsIndexPage from "@/app/agents/page";
import Home from "@/app/page";
import { AGENTS } from "@/components/home/demo-data";
import { MODEL_ROUTES } from "@/lib/agents/catalog";
import { SHOWCASE } from "@/lib/agents/showcase";
import { chainsFor, showcaseAgent, showcaseAgents } from "@/lib/agents/showcase-view";
import { formatOutput } from "@/lib/launch/format";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { NOT_IN_LAUNCH } from "@/lib/launch/specs";
import { parseOutput } from "@/lib/runs/output";
import { validateRunInputs } from "@/lib/runs/inputs";

const LIVE = ["trend-scout", "idea-generator", "hook-writer", "script-writer", "caption-writer", "hashtag-picker", "repurposer"];

/** What a person reads: the markup with tags dropped and entities turned back into characters. */
const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

async function render(id: string): Promise<string> {
  const el = await AgentPublicPage({ params: Promise.resolve({ id }) });
  return renderToStaticMarkup(el);
}

const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)].map((m) => decode(m[1]));

describe("the public agent pages", () => {
  it("are static, one per live launch agent, and nothing else", () => {
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams().map((p) => p.id).sort()).toEqual([...LIVE].sort());
    expect(showcaseAgents().map((a) => a.id).sort()).toEqual([...LIVE].sort());
  });

  it.each(LIVE)("%s renders its name, job, platforms and both buttons", async (id) => {
    const html = await render(id);
    const text = decode(html);
    const agent = showcaseAgent(id)!;
    expect(text).toContain(agent.name);
    expect(text).toContain(agent.job);
    expect(text).toContain(`Use ${agent.name}`);
    expect(text).toContain("See an example");
    expect(text).toContain("Live");
    for (const p of agent.platforms) expect(text).toContain({ x: "X", tiktok: "TikTok", shorts: "YouTube Shorts", reels: "Instagram Reels" }[p]);
  });

  it.each(LIVE)("%s sends Use to the agent's form in the app, twice, and See an example to the example", async (id) => {
    const html = await render(id);
    const links = hrefs(html);
    expect(links.filter((h) => h === `/app/make/${id}`).length).toBe(2);
    expect(links).toContain("#example");
    expect(html).toContain('id="example"');
    expect(links).toContain("/agents");
    for (const c of chainsFor(id)) expect(links).toContain(`/app/pipelines/${c.id}`);
    // Nothing on the page runs or charges anything: no form posts, no buttons that act.
    expect(html).not.toMatch(/<form\b/);
    const buttons = [...html.matchAll(/<button\b[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
    expect(buttons.length).toBe((html.match(/<button\b/g) ?? []).length);
    for (const b of buttons) expect(b === "Switch theme" || b.startsWith("Copy:"), b).toBe(true);
  });

  it.each(LIVE)("%s shows the real result labelled honestly, with its score and bar", async (id) => {
    const text = decode(await render(id));
    const ex = SHOWCASE[id];
    expect(text).toContain(`A real result from WOVI's test runs, for a sample business (${ex.business}). Your results use your own Brand Brain.`);
    expect(text).toContain(`Quality ${ex.quality}`);
    expect(text).toMatch(/Passed the bar of \d+/);
  });

  it.each(LIVE)("%s never shows instructions, model routes, model ids or costs", async (id) => {
    const html = await render(id);
    const text = decode(html);
    const spec = LAUNCH_AGENTS.find((a) => a.id === id)!;
    for (const line of spec.instructions.split("\n").filter((l) => l.trim().length >= 30)) expect(text, line).not.toContain(line.trim());
    expect(text).not.toContain("{{");
    for (const r of MODEL_ROUTES) {
      expect(text).not.toContain(r.id);
      if (r.model) expect(text).not.toContain(r.model);
    }
    expect(text).not.toMatch(/openrouter|maxCostUsd|temperature|maxOutputTokens|fallback/i);
    expect(text).not.toMatch(/\bROLE\b|HOW TO WORK|WHAT TO RETURN|QUALITY RULES/);
  });

  it.each(LIVE)("%s has no em dashes", async (id) => {
    expect(await render(id)).not.toContain("\u2014");
  });

  it("answers 404 for an unknown or non-live id", async () => {
    for (const id of ["nope", "storyboarder", ...NOT_IN_LAUNCH, "hook-writer-x"]) {
      expect(showcaseAgent(id)).toBeNull();
      await expect(AgentPublicPage({ params: Promise.resolve({ id }) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    }
  });

  it("titles each page by its agent and keeps it indexable", async () => {
    for (const id of LIVE) {
      const m = await generateMetadata({ params: Promise.resolve({ id }) });
      const agent = showcaseAgent(id)!;
      expect(String(m.title)).toContain(agent.name);
      expect(String(m.description)).toContain(agent.job);
      expect(m.robots).toBeUndefined();
      expect(m.alternates?.canonical).toBe(`/agents/${id}`);
    }
  });
});

describe("the example results", () => {
  it("have one per live agent and nothing else", () => {
    expect(Object.keys(SHOWCASE).sort()).toEqual([...LIVE].sort());
  });

  it.each(LIVE)("%s parses with the engine's own parser against the agent's output shape", (id) => {
    const agent = showcaseAgent(id)!;
    const ex = SHOWCASE[id];
    const r = parseOutput(agent.output, JSON.stringify(ex.output));
    expect(r.ok ? [] : r.errors).toEqual([]);
    if (r.ok) expect(r.value).toEqual(ex.output);
    expect(formatOutput(ex.output)).toBe(ex.text);
  });

  it.each(LIVE)("%s ran on inputs the agent's form accepts", (id) => {
    const agent = showcaseAgent(id)!;
    const r = validateRunInputs(agent, SHOWCASE[id].inputs);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("scores at or above each agent's bar, and Trend Scout's carries its sources", () => {
    for (const id of LIVE) expect(SHOWCASE[id].quality).toBeGreaterThanOrEqual(60);
    expect(SHOWCASE["trend-scout"].sources?.length).toBeGreaterThan(0);
    const cited = (SHOWCASE["trend-scout"].output as { items: Record<string, string>[] }).items.map((i) => i.source);
    for (const url of cited) expect(SHOWCASE["trend-scout"].sources!.map((s) => s.url)).toContain(url);
  });

  it("contain no em dashes", () => {
    expect(JSON.stringify(SHOWCASE)).not.toContain("\u2014");
  });
});

describe("links into the agent pages", () => {
  it("the homepage's live cards open the agent pages, not the app", () => {
    const links = hrefs(renderToStaticMarkup(createElement(Home)));
    for (const a of AGENTS.filter((x) => x.status === "live")) {
      expect(links).toContain(`/agents/${a.id}`);
      expect(links).not.toContain(`/app/make/${a.id}`);
    }
  });

  it("the index lists the seven live agents, each linking to its page", () => {
    const html = renderToStaticMarkup(createElement(AgentsIndexPage));
    const links = hrefs(html);
    for (const id of LIVE) expect(links).toContain(`/agents/${id}`);
    expect(links.filter((h) => /^\/agents\/[^/]+$/.test(h)).length).toBe(LIVE.length);
    expect(html).not.toContain("\u2014");
  });
});
