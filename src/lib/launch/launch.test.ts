import { describe, expect, it } from "vitest";
import { GUARDRAIL_IDS, TOOL_IDS } from "@/lib/agents/catalog";
import { PLATFORM_WORKSPACE_ID, SEED_AGENTS } from "@/lib/agents/seeds";
import { compareSemver } from "@/lib/agents/semver";
import { validateAgentSpec, type AgentSpec } from "@/lib/agents/spec";
import { exampleImages } from "@/lib/brand/example-images";
import { seedBrains } from "@/lib/brand/seeds";
import { storeBrainSource } from "@/lib/brand/source";
import { memoryBrandStore } from "@/lib/brand/store";
import { testBuilder } from "@/lib/builder/test-helpers";
import { BUILDER_LIMITS } from "@/lib/builder/types";
import type { BrandBrain } from "@/lib/runs/brand-brain";
import { GUARDRAIL_CHECKS, runAfterChecks } from "@/lib/runs/guardrails";
import { validateRunInputs } from "@/lib/runs/inputs";
import { parseOutput } from "@/lib/runs/output";
import { NOT_GIVEN, fillInstructions } from "@/lib/runs/prompt";
import { memoryFileStorage } from "@/lib/builder/storage";
import { LAUNCH_BRAINS, LAUNCH_BRAIN_NAMES } from "./brains";
import { formatOutput } from "./format";
import { LAUNCH_AUTHOR_ID, installLaunchSet } from "./install";
import { LAUNCH_SAMPLES } from "./samples";
import { LAUNCH_AGENTS, LAUNCH_NOTES, NOT_IN_LAUNCH } from "./specs";

const specs = new Map(
  LAUNCH_AGENTS.map((s) => {
    const r = validateAgentSpec(s);
    return [s.id, r.ok ? r.value : (null as unknown as AgentSpec)];
  }),
);
const spec = (id: string) => specs.get(id)!;
const samplesOf = (id: string) => LAUNCH_SAMPLES[id] ?? [];
const allSamples = LAUNCH_AGENTS.flatMap((s) => samplesOf(s.id).map((sample) => ({ agentId: s.id, sample })));

/** The launch Brand Brains as the engine reads them, from a real (memory) store. */
async function engineBrains(): Promise<Map<string, BrandBrain>> {
  const store = memoryBrandStore();
  await seedBrains(store, memoryFileStorage(), "ws_test", { images: exampleImages(), examples: LAUNCH_BRAINS });
  const source = storeBrainSource(store);
  const out = new Map<string, BrandBrain>();
  for (const row of await store.brains.find({ workspaceId: "ws_test" })) out.set(row.name, (await source.get("ws_test", row.id))!);
  return out;
}

describe("the launch lineup", () => {
  it("is the doc's seven text agents, in the doc's order", () => {
    expect(LAUNCH_AGENTS.map((s) => s.name)).toEqual([
      "Trend Scout",
      "Idea Generator",
      "Hook Writer",
      "Script Writer",
      "Caption Writer",
      "Hashtag Optimizer",
      "Platform Repurposer",
    ]);
  });

  it("keeps the seed ids, so pipelines that pin them still work, and leaves the video agents out", () => {
    const seedIds = SEED_AGENTS.map((s) => s.id);
    const launchIds = LAUNCH_AGENTS.map((s) => s.id);
    expect(launchIds.filter((id) => !seedIds.includes(id))).toEqual(["idea-generator"]);
    expect(seedIds.filter((id) => !launchIds.includes(id))).toEqual([...NOT_IN_LAUNCH]);
  });

  it("is all live: Trend Scout too, now that the trend lookup exists", () => {
    for (const s of LAUNCH_AGENTS) expect([s.id, s.status]).toEqual([s.id, "live"]);
  });

  it.each(LAUNCH_AGENTS.map((s) => [s.id, s] as const))("%s validates", (_id, s) => {
    const r = validateAgentSpec(s);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("goes above each seed's version, with a major bump wherever the output changed", () => {
    for (const s of LAUNCH_AGENTS) {
      const seed = SEED_AGENTS.find((x) => x.id === s.id);
      expect(LAUNCH_NOTES[s.id]).toBeTruthy();
      if (!seed) continue;
      expect(compareSemver(s.version, seed.version)).toBeGreaterThan(0);
      const outputChanged = JSON.stringify(seed.output) !== JSON.stringify(s.output);
      // Trend Scout's output changed twice: the launch fields (2.0.0), then the source of every trend (3.0.0).
      expect([s.id, s.version.split(".")[0]]).toEqual([s.id, s.id === "trend-scout" ? "3" : outputChanged ? "2" : "1"]);
    }
  });

  it("lists only guardrails and tools that exist, each guardrail with a check", () => {
    for (const s of specs.values()) {
      for (const g of s.guardrails) {
        expect(GUARDRAIL_IDS).toContain(g);
        expect(GUARDRAIL_CHECKS.some((c) => c.guardrail === g)).toBe(true);
      }
      for (const t of s.tools) expect(TOOL_IDS).toContain(t);
      expect(s.guardrails).toContain("banned_phrases");
      expect(s.guardrails).toContain("no_misleading_claims");
      expect(s.guardrails).toContain("specificity_check");
    }
  });

  it("declares a tool only on Trend Scout, which cites a lookup source on every trend", () => {
    for (const s of specs.values()) expect([s.id, s.tools]).toEqual([s.id, s.id === "trend-scout" ? ["trend_lookup"] : []]);
    expect(spec("trend-scout").output).toMatchObject({ kind: "list", count: 5, fields: ["trend", "what_it_looks_like", "evidence", "source", "how_you_could_use_it"] });
    expect(spec("trend-scout").instructions).not.toContain("Call trend_lookup");
  });

  it("checks brand fit on every agent that writes in the brand's voice", () => {
    for (const id of ["idea-generator", "hook-writer", "script-writer", "caption-writer", "repurposer"]) {
      expect(spec(id).guardrails).toContain("brand_voice_check");
      expect(spec(id).brandBrain).toEqual(expect.arrayContaining(["voice", "dos_donts"]));
    }
  });

  it("has help on every free-text input, and a profile input to pick the Brand Brain", () => {
    for (const s of specs.values()) {
      for (const input of s.inputs) if (input.type === "text" || input.type === "long_text") expect([s.id, input.key, Boolean(input.help)]).toEqual([s.id, input.key, true]);
      expect(s.inputs.at(-1)).toMatchObject({ key: "brand", type: "profile", required: false });
    }
  });

  it("never uses an em dash", () => {
    const all = JSON.stringify([LAUNCH_AGENTS, LAUNCH_NOTES, LAUNCH_SAMPLES, LAUNCH_BRAINS]);
    expect(all.includes("\u2014")).toBe(false);
  });
});

describe("the golden samples", () => {
  it("are at least four per agent, exactly one of them bad, across at least four businesses", () => {
    for (const s of LAUNCH_AGENTS) {
      const list = samplesOf(s.id);
      expect([s.id, list.length >= 4]).toEqual([s.id, true]);
      expect([s.id, list.filter((x) => x.label === "bad").length]).toEqual([s.id, 1]);
      expect([s.id, new Set(list.map((x) => x.brain)).size >= 4]).toEqual([s.id, true]);
      expect(new Set(list.map((x) => x.title)).size).toBe(list.length);
    }
  });

  it("name launch Brand Brains, and the set spans seven kinds of business", () => {
    for (const { sample } of allSamples) expect(LAUNCH_BRAIN_NAMES).toContain(sample.brain);
    expect(new Set(allSamples.map(({ sample }) => sample.brain)).size).toBe(7);
  });

  it.each(allSamples.map(({ agentId, sample }) => [agentId, sample.title, sample] as const))("%s / %s fits the form and the output shape", (agentId, _title, sample) => {
    const s = spec(agentId);
    const fits = validateRunInputs(s, { ...sample.inputs, brand: "bb_test" });
    expect(fits.ok ? [] : fits.errors).toEqual([]);
    const parsed = parseOutput(s.output, JSON.stringify(sample.ideal));
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    const text = formatOutput(sample.ideal);
    expect(text.length).toBeGreaterThan(20);
    expect(text.length).toBeLessThanOrEqual(BUILDER_LIMITS.sampleOutput);
    expect(sample.note.length).toBeLessThanOrEqual(BUILDER_LIMITS.sampleNote);
    expect(sample.title.length).toBeLessThanOrEqual(BUILDER_LIMITS.sampleTitle);
  });

  it("gold samples pass every guardrail of their agent with their Brand Brain, and bad ones fail at least one", async () => {
    const brains = await engineBrains();
    const problems: string[] = [];
    for (const { agentId, sample } of allSamples) {
      const s = spec(agentId);
      const parsed = parseOutput(s.output, JSON.stringify(sample.ideal));
      if (!parsed.ok) throw new Error(parsed.errors.join(" "));
      const inputs = validateRunInputs(s, sample.inputs);
      if (!inputs.ok) throw new Error(inputs.errors.join(" "));
      const checks = runAfterChecks({ spec: s, inputs: inputs.value, output: parsed.value, brain: brains.get(sample.brain)! });
      const failed = checks.filter((c) => c.status === "fail");
      if (sample.label === "gold" && failed.length) problems.push(`${agentId} / ${sample.title}: ${failed.map((c) => `${c.check} ${(c.findings ?? []).join(", ")}`).join("; ")}`);
      if (sample.label === "bad" && !failed.length) problems.push(`${agentId} / ${sample.title}: a bad sample that passes every check`);
    }
    expect(problems).toEqual([]);
  });

  it("each agent's template fills with a Brand Brain: every placeholder, every declared part, every input", async () => {
    const brains = await engineBrains();
    for (const { agentId, sample } of allSamples) {
      const s = spec(agentId);
      const inputs = validateRunInputs(s, sample.inputs);
      if (!inputs.ok) throw new Error(inputs.errors.join(" "));
      const brain = brains.get(sample.brain)!;
      const filled = fillInstructions(s, inputs.value, brain);
      expect(filled).not.toMatch(/\{\{|\}\}/);
      for (const part of s.brandBrain) {
        const block = new RegExp(`<data name="brand\\.${part}">\\n([\\s\\S]*?)\\n</data>`).exec(filled);
        expect([agentId, part, Boolean(block)]).toEqual([agentId, part, true]);
        expect(block![1]).not.toMatch(/^(Not set yet\.|None given\.)$/);
      }
      // Every input but the Brand Brain picker reaches the model; the picker chooses which brain fills the brand parts.
      for (const input of s.inputs.filter((i) => i.type !== "profile")) {
        expect(filled).toContain(`<data name="${input.key}">`);
        const v = inputs.value[input.key];
        if (typeof v === "string" && (input.type === "text" || input.type === "long_text")) expect(filled).toContain(v);
      }
      // Optional inputs left empty say so plainly instead of leaving a gap.
      if (s.inputs.some((i) => !i.required && inputs.value[i.key] === undefined && i.type !== "profile")) expect(filled).toContain(NOT_GIVEN);
    }
  });
});

describe("installing the launch set", () => {
  async function setup() {
    const brands = memoryBrandStore();
    const t = await testBuilder({ engine: { brandBrains: storeBrainSource(brands) } });
    const install = () => installLaunchSet({ accounts: t.accounts, registry: t.registry, builder: t.builder, brands, files: t.files, images: exampleImages() });
    return { ...t, brands, install, me: { kind: "user" as const, userId: LAUNCH_AUTHOR_ID } };
  }

  it("saves each launch spec as a new version through the builder, with its note and status, as the launch author", async () => {
    const t = await setup();
    const report = await t.install();
    expect(report.agents.map((a) => [a.id, a.action, a.version, a.status])).toEqual([
      ["trend-scout", "updated", "3.0.1", "live"],
      ["idea-generator", "created", "1.0.1", "live"],
      ["hook-writer", "updated", "1.1.1", "live"],
      ["script-writer", "updated", "2.0.1", "live"],
      ["caption-writer", "updated", "1.1.1", "live"],
      ["hashtag-picker", "updated", "2.0.1", "live"],
      ["repurposer", "updated", "2.0.1", "live"],
    ]);
    const versions = await t.registry.versions(PLATFORM_WORKSPACE_ID, "repurposer");
    expect(versions.map((v) => [v.version, v.by, v.note])).toEqual([
      ["1.0.0", null, "Launch seed"],
      ["2.0.1", LAUNCH_AUTHOR_ID, LAUNCH_NOTES.repurposer],
    ]);
    expect((await t.registry.get(PLATFORM_WORKSPACE_ID, "hashtag-picker"))!.name).toBe("Hashtag Optimizer");
    expect((await t.registry.get(PLATFORM_WORKSPACE_ID, "storyboarder"))!.status).toBe("hidden");
    expect(report.brains.added).toEqual(LAUNCH_BRAIN_NAMES);
    expect(report.samples).toEqual({ added: allSamples.length, existing: 0, refreshed: 0, unfit: [] });

    // Each sample runs against its own Brand Brain.
    const ids = new Map((await t.brands.brains.find({ workspaceId: PLATFORM_WORKSPACE_ID })).map((b) => [b.id, b.name]));
    for (const s of LAUNCH_AGENTS) {
      const saved = await t.builder.listSamples(t.me, s.id);
      expect(saved.map((x) => ids.get(String(x.inputs.brand)))).toEqual(samplesOf(s.id).map((x) => x.brain));
      expect(saved.every((x) => x.version === s.version)).toBe(true);
    }
  });

  it("is idempotent: a second run saves, adds and changes nothing", async () => {
    const t = await setup();
    await t.install();
    const before = JSON.stringify(await Promise.all(LAUNCH_AGENTS.map((s) => t.registry.versions(PLATFORM_WORKSPACE_ID, s.id))));
    const brainsBefore = (await t.brands.brains.find({ workspaceId: PLATFORM_WORKSPACE_ID })).length;
    const again = await t.install();
    expect(again.agents.every((a) => a.action === "unchanged")).toBe(true);
    expect(again.brains.added).toEqual([]);
    expect(again.samples).toEqual({ added: 0, existing: allSamples.length, refreshed: 0, unfit: [] });
    expect(again.base.created).toEqual([]);
    expect(JSON.stringify(await Promise.all(LAUNCH_AGENTS.map((s) => t.registry.versions(PLATFORM_WORKSPACE_ID, s.id))))).toBe(before);
    expect((await t.brands.brains.find({ workspaceId: PLATFORM_WORKSPACE_ID })).length).toBe(brainsBefore);
  });

  it("never saves over a version a person made in the builder", async () => {
    const t = await setup();
    const { me } = await t.joinBuilder();
    await t.builder.saveAgent(me, "hook-writer", { job: "Opens a post with one line people stop for, tuned by hand." }, { note: "Funkai's edit" });
    const report = await t.install();
    const hook = report.agents.find((a) => a.id === "hook-writer")!;
    expect(hook).toMatchObject({ action: "kept", version: "1.0.1" });
    expect(hook.reason).toMatch(/edited in the builder/);
    expect((await t.registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!.job).toMatch(/tuned by hand/);
    // The samples still go in where they fit the form as it is now.
    const needsNewInput = samplesOf("hook-writer").filter((s) => "who_for" in s.inputs);
    expect(needsNewInput.length).toBeGreaterThan(0);
    expect(report.samples.unfit.map((u) => [u.agentId, u.title])).toEqual(needsNewInput.map((s) => ["hook-writer", s.title]));
  });

  it("runs the whole set through a batch on the fake provider: every sample parses, every guardrail runs, brand fit is read", async () => {
    const t = await setup();
    await t.install();
    const ids = LAUNCH_AGENTS.map((s) => s.id);
    const plan = await t.builder.bench.planBatch(t.me, ids);
    expect(plan.agents.map((a) => [a.agentId, a.runs])).toEqual(ids.map((id) => [id, samplesOf(id).length]));
    let batch = await t.builder.bench.runBatch(t.me, ids, { confirmed: true });
    for (let i = 0; batch.status === "running" && i < 500; i++) {
      await new Promise((r) => setTimeout(r, 10));
      batch = await t.builder.bench.getBatch(t.me, batch.id);
    }
    expect(batch.status).toBe("done");
    expect(batch.runs).toBe(allSamples.length);
    for (const a of batch.agents) {
      expect([a.agentId, a.refused, a.done]).toEqual([a.agentId, 0, a.total]);
      const bench = await t.builder.bench.get(t.me, a.benchId);
      const s = spec(a.agentId);
      for (const r of bench.results) {
        expect([a.agentId, r.title, r.status, r.parsed]).toEqual([a.agentId, r.title, "succeeded", "first"]);
        // Trend Scout also checks that every trend cites a page the lookup found.
        expect(new Set(r.checks.map((c) => c.guardrail))).toEqual(new Set([...s.guardrails, ...(s.tools.length ? ["trend_lookup"] : [])]));
        // A sample never sees itself: it is kept out of its own examples, and the others are given.
        expect(r.examples).toMatchObject({ ownKeptOut: true });
        expect(r.examples!.gold).not.toContain(r.title);
        expect(r.examples!.gold.length).toBeGreaterThan(0);
        if (s.tools.length) expect(r.sources.length).toBeGreaterThanOrEqual(5);
        if (s.guardrails.includes("brand_voice_check")) expect(r.checks.find((c) => c.check === "brand_fit")?.score).toEqual(expect.any(Number));
        const run = (await t.engine.getRun(PLATFORM_WORKSPACE_ID, r.runId!))!;
        expect(run.brandBrain?.name).toBe(samplesOf(a.agentId).find((x) => x.title === r.title)!.brain);
      }
    }
  });
});
