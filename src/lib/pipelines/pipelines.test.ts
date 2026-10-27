import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { validateAgentSpec, type AgentSpec } from "@/lib/agents/spec";
import { as, testApp } from "@/lib/app/test-helpers";
import { LAUNCH_AUTHOR_ID } from "@/lib/launch/install";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import type { CompletionRequest } from "@/lib/runs/providers/types";
import { defaultAnswer } from "@/lib/runs/providers/fake";
import { ProviderError } from "@/lib/runs/providers/types";
import { installPipelineTemplates } from "./install";
import { PIPELINE_TEMPLATES } from "./templates";
import { checkPipeline, fitProblem, validatePipeline, type AgentLookup } from "./validate";
import { outputItems, outputText, parseTemplate, resolveMapping, resolveStepInputs, withNote, NOTE_PREFIX } from "./values";
import type { PipelineSpecInput } from "./spec";
import type { RunOutput } from "@/lib/runs/output";

/* ---------- Helpers ---------- */

const SPECS = new Map(
  LAUNCH_AGENTS.map((a) => {
    const r = validateAgentSpec(a);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    return [a.id, r.value as AgentSpec];
  }),
);
const lookup: AgentLookup = (id) => SPECS.get(id) ?? null;
const template = (id: string) => structuredClone(PIPELINE_TEMPLATES.find((t) => t.id === id)!) as PipelineSpecInput & { steps: NonNullable<PipelineSpecInput["steps"]> };
const errorsOf = (spec: unknown) => {
  const r = validatePipeline(spec, lookup);
  return r.ok ? [] : r.errors;
};

/** Which launch agent a model request is for, from its instructions. */
function agentOf(req: CompletionRequest): string {
  const text = req.messages.map((m) => m.content).join("\n");
  if (text.includes("You are the ideas person")) return "idea-generator";
  if (text.includes("You write opening lines")) return "hook-writer";
  if (text.includes("You write short vertical video scripts")) return "script-writer";
  if (text.includes("You write captions for one small business")) return "caption-writer";
  if (text.includes("You help one post get found")) return "hashtag-picker";
  if (text.includes("You take one post that already worked")) return "repurposer";
  return "unknown";
}

const IDEA = "Gerald the sourdough starter turns nine on Saturday and gets his own cake";

async function bakery(opts: Parameters<typeof testApp>[0] = {}) {
  const t = await testApp(opts);
  await t.seedTeamBrains();
  const crumb = (await t.brandStore.brains.find({ workspaceId: t.team.id, name: "Crumb and Co" }))[0];
  const me = as(t.ada.id);
  const start = (pipelineId: string, inputs: Record<string, unknown>, extra: Record<string, unknown> = {}) => t.api.startPipeline(me, t.team.id, { pipelineId, inputs, ...extra });
  const settle = (id: string) => t.pipelineEngine.waitUntilSettled(t.team.id, id);
  const ideaInputs = (extra: Record<string, unknown> = {}) => ({ start: "my_idea", idea: IDEA, platform: "tiktok", length: "s30", brand: crumb.id, ...extra });
  return { ...t, crumb, me, start, settle, ideaInputs };
}

/* ---------- The validator ---------- */

describe("pipeline validator", () => {
  it("passes the three templates against the launch agents, in plain words without em dashes", () => {
    for (const t of PIPELINE_TEMPLATES) expect(errorsOf(t), t.id).toEqual([]);
    expect(JSON.stringify(PIPELINE_TEMPLATES)).not.toContain("\u2014");
  });

  it("refuses a step output mapped into an input that does not take text", () => {
    const p = template("idea-to-post");
    p.steps[4].inputs.platform = { from: "step", step: "caption", take: "picked" };
    expect(errorsOf(p).join("\n")).toMatch(/steps\[4\]\.inputs\.platform: Types do not fit: step "caption" gives text, and "Platform" takes one option/);
  });

  it("refuses pipeline inputs whose type, options or length do not fit", () => {
    const p = template("idea-to-post");
    p.steps[1].inputs.idea = { from: "input", key: "platform" };
    p.steps[2].inputs.length = { from: "input", key: "idea" };
    expect(errorsOf(p).join("\n")).toContain('Types do not fit: "Platform" is one option, and "Your idea" takes text.');
    expect(errorsOf(p).join("\n")).toContain('Types do not fit: "Your idea" is text, and "Length" takes one option.');

    const wide = template("caption-and-tags");
    // X is an option of the pipeline, and Script Writer has no platform; Hook Writer's platform has X. Use a choice with an option the agent lacks.
    wide.inputs!.push({ key: "lang", label: "Language", type: "choice", required: true, options: [{ value: "s15", label: "A" }, { value: "s90", label: "B" }] });
    wide.steps.push({ id: "script", label: "Script", agent: { id: "script-writer", version: "current" }, inputs: { idea: { from: "input", key: "post" }, length: { from: "input", key: "lang" } } });
    expect(errorsOf(wide).join("\n")).toContain('"Language" has options "Length" does not take: s90.');
    // 2000 characters of clip description into Script Writer's 1000-character idea.
    expect(errorsOf(wide).join("\n")).toContain('"What the clip shows" can be 2000 characters, and "Your idea" takes at most 1000.');

    const many = template("repurpose-post");
    many.inputs![2] = { key: "to", label: "Make versions for", type: "choice", required: true, multiple: true, options: [{ value: "x", label: "X" }, { value: "reels", label: "Reels" }] };
    expect(errorsOf(many).join("\n")).toContain('Types do not fit: "Make versions for" is a list of options, and "Platform" takes one option.');
  });

  it("refuses a required agent input with nothing mapped, unknown inputs and optional sources", () => {
    const p = template("caption-and-tags");
    delete p.steps[1].inputs.caption;
    p.steps[1].inputs.colour = { from: "value", value: "red" };
    p.inputs!.push({ key: "notes", label: "Notes", type: "long_text", required: false, limits: { minLength: 10, maxLength: 500 } });
    p.steps[0].inputs.post = { from: "input", key: "notes" };
    const e = errorsOf(p).join("\n");
    expect(e).toContain('steps[1].inputs.caption: "Caption or post" is required by Hashtag Optimizer, and nothing is mapped to it.');
    expect(e).toContain('steps[1].inputs.colour: Hashtag Optimizer has no input "colour".');
    expect(e).toContain('"Notes" is optional, and "What the post shows" is required.');
  });

  it("refuses cycles: a step reading itself or a later step", () => {
    const p = template("idea-to-post");
    p.steps[2].inputs.idea = { from: "step", step: "caption", take: "all" };
    p.steps[3].inputs.post = { from: "step", step: "caption", take: "all" };
    const e = errorsOf(p).join("\n");
    expect(e).toContain('steps[2].inputs.idea: Reads step "caption", which runs after it. A step only reads the steps before it, so a pipeline never loops.');
    expect(e).toContain("steps[3].inputs.post: Reads its own output.");
  });

  it("refuses picked items from steps that do not pick, unknown fields and bad templates", () => {
    const p = template("idea-to-post");
    p.steps[3].inputs.post = { from: "step", step: "script", take: "picked" };
    p.steps[2].inputs.idea = { from: "template", text: "{{steps.hooks.picked.colour}} {{steps.nowhere.all}}" };
    p.steps[4].inputs.caption = { from: "template", text: "{{something else}}" };
    const e = errorsOf(p).join("\n");
    expect(e).toContain('Takes the item step "script" picked, but that step does not pick one.');
    expect(e).toContain('Step "hooks" gives items without fields, so there is no "colour".');
    expect(e).toContain("{{something else}} is not a reference.");
  });

  it("refuses a skippable step mapped into a required input without a fallback", () => {
    const p = template("idea-to-post");
    p.steps[1].inputs.idea = { from: "step", step: "ideas", take: "picked", field: "idea" };
    expect(errorsOf(p).join("\n")).toContain('Step "ideas" may be skipped, and "Your idea" is required.');
    p.steps[1].inputs.idea = { from: "template", text: "{{steps.ideas.picked.idea}}" };
    expect(errorsOf(p).join("\n")).toContain("Every reference in the template may be empty");
    p.steps[1].inputs.idea = { from: "template", text: "{{steps.ideas.picked.idea|inputs.idea}}" };
    expect(errorsOf(p)).toEqual([]);
  });

  it("checks fixed values, missing agents, conditions and the package", () => {
    const p = template("idea-to-post");
    p.steps[2].inputs.length = { from: "value", value: "s90" };
    p.steps[4].agent = { id: "hashtag-wizard", version: "current" };
    p.steps[0].runIf = { input: "platform", equals: "never" };
    p.package!.push({ step: "nowhere", label: "Nope", take: "all" }, { step: "script", label: "Script line", take: "picked" });
    const e = errorsOf(p).join("\n");
    expect(e).toContain('steps[2].inputs.length: Unknown option "s90"');
    expect(e).toContain('steps[4].agent: No agent "hashtag-wizard" that this pipeline can use.');
    expect(e).toContain('steps[0].runIf.equals: "never" is not an option of "Platform".');
    expect(e).toContain('package[5].step: No step "nowhere".');
    expect(e).toContain('package[6].take: Step "script" does not pick an item.');

    const q = template("caption-and-tags");
    q.steps[1].onFail = { when: "brand", rewrite: true, then: "review" };
    expect(errorsOf(q).join("\n")).toContain("Hashtag Optimizer does not check brand fit");
  });

  it("checks the shape first, with readable paths", () => {
    const p = template("idea-to-post");
    (p.steps[0] as { id: string }).id = "Find Ideas";
    (p as { maxCostUsd: number }).maxCostUsd = 50;
    const r = validatePipeline(p, lookup);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join("\n")).toMatch(/steps\[0\]\.id: Key must be snake_case/);
    expect(!r.ok && r.errors.join("\n")).toMatch(/maxCostUsd/);
    // Without a lookup only the references inside the pipeline are checked.
    const shape = validatePipeline(template("idea-to-post"));
    expect(shape.ok && checkPipeline(shape.value)).toEqual([]);
  });

  it("knows which pipeline inputs fit which agent inputs", () => {
    const text = (max: number, min?: number) => ({ key: "a", label: "A", type: "text" as const, required: true, limits: { maxLength: max, ...(min ? { minLength: min } : {}) } });
    expect(fitProblem(text(100), text(200))).toBeNull();
    expect(fitProblem(text(300), text(200))).toMatch(/can be 300 characters/);
    expect(fitProblem(text(100, 2), text(200, 10))).toMatch(/shorter than the 10 characters/);
    expect(fitProblem({ key: "u", label: "U", type: "url", required: true }, text(3000))).toBeNull();
    expect(fitProblem({ key: "n", label: "N", type: "number", required: true, limits: { min: 0, max: 50 } }, { key: "m", label: "M", type: "number", required: true, limits: { min: 1, max: 10 } })).toMatch(/goes from 0 to 50/);
  });
});

/* ---------- Moving values ---------- */

describe("typed outputs into inputs", () => {
  const hooks: RunOutput = { kind: "list", items: ["Gerald is nine", "We baked a cake for a jar of flour"] };
  const ideas: RunOutput = { kind: "list", items: [{ idea: "Gerald's birthday cake", format: "talking to camera", why_it_fits: "Gerald is the brand" }] };
  const script: RunOutput = { kind: "script", sections: [{ section: "hook", spoken: "Gerald is nine.", on_screen: "The jar", seconds: 3 }, { section: "ending", spoken: "Happy birthday, Gerald.", on_screen: "Candle", seconds: 4 }] };
  const captions: RunOutput = { kind: "caption_set", captions: [{ platform: "tiktok", variants: ["One", "Two"] }, { platform: "x", variants: ["Three", "Four"] }] };

  it("reads every output kind as items and as text", () => {
    expect(outputItems(hooks).map((i) => i.text)).toEqual(["Gerald is nine", "We baked a cake for a jar of flour"]);
    expect(outputItems(ideas)[0].fields).toEqual({ idea: "Gerald's birthday cake", format: "talking to camera", why_it_fits: "Gerald is the brand" });
    expect(outputItems(captions).map((i) => i.label)).toEqual(["TikTok, variant 1", "TikTok, variant 2", "X, variant 1", "X, variant 2"]);
    expect(outputText(hooks)).toBe("1. Gerald is nine\n2. We baked a cake for a jar of flour");
    expect(outputText(script)).toBe("Hook (3 s)\nSay: Gerald is nine.\nOn screen: The jar\n\nEnding (4 s)\nSay: Happy birthday, Gerald.\nOn screen: Candle");
  });

  it("maps the picked hook, a picked field, a whole script and a template with a fallback", () => {
    const ctx = {
      inputs: { idea: "Gerald turns nine", platform: "reels" },
      inputDefs: [template("idea-to-post").inputs!.find((i) => i.key === "platform") as never],
      steps: { hooks: { skipped: false, output: hooks, picked: 1 }, ideas: { skipped: true, output: null, picked: null }, script: { skipped: false, output: script, picked: null }, gen: { skipped: false, output: ideas, picked: 0 } },
    };
    expect(resolveMapping({ from: "step", step: "hooks", take: "picked" }, ctx)).toBe("We baked a cake for a jar of flour");
    expect(resolveMapping({ from: "step", step: "gen", take: "picked", field: "idea" }, ctx)).toBe("Gerald's birthday cake");
    expect(resolveMapping({ from: "step", step: "script", take: "all" }, ctx)).toContain("Say: Happy birthday, Gerald.");
    expect(resolveMapping({ from: "template", text: "Hook: {{steps.hooks.picked}}\nIdea: {{steps.ideas.picked.idea|inputs.idea}} on {{inputs.platform}}" }, ctx)).toBe("Hook: We baked a cake for a jar of flour\nIdea: Gerald turns nine on Instagram Reels");
    expect(resolveStepInputs({ a: { from: "step", step: "ideas", take: "all" }, b: { from: "input", key: "idea" } }, ctx)).toEqual({ b: "Gerald turns nine" });
    expect(parseTemplate("{{steps.a.all|inputs.b}} and {{bad}}").parts.map((p) => p.alternatives.length)).toEqual([2, 1]);
  });

  it("adds a rewrite note inside the input's limit, replacing an earlier one", () => {
    const once = withNote("x".repeat(590), "Fix the brand words.", 600);
    expect(once.length).toBeLessThanOrEqual(600);
    expect(once.endsWith(`${NOTE_PREFIX}Fix the brand words.`)).toBe(true);
    const twice = withNote(once, "Shorter.", 600);
    expect(twice.split(NOTE_PREFIX)).toHaveLength(2);
  });
});

/* ---------- Running ---------- */

describe("pipeline runs", () => {
  it("runs idea to ready post: waits for the hook pick, passes typed outputs along, and ends ready for approval", async () => {
    const t = await bakery();
    const started = await t.start("idea-to-post", t.ideaInputs());
    let run = await t.settle(started.id);
    expect(run.status).toBe("waiting");
    expect(run.steps.map((s) => s.status)).toEqual(["skipped", "waiting", "todo", "todo", "todo"]);
    const hooks = run.steps[1];
    expect(hooks.candidates).toHaveLength(10);
    expect(hooks.candidates.every((c) => typeof c.brandFit === "number")).toBe(true);
    expect(hooks.suggested).not.toBeNull();
    expect(hooks.inputs).toMatchObject({ idea: IDEA, platform: "tiktok" });
    // The pinned version of "current".
    expect(hooks.agent).toMatchObject({ workspaceId: PLATFORM_WORKSPACE_ID, id: "hook-writer", version: "1.1.2" });

    await t.api.pickInPipeline(t.me, t.team.id, run.id, "hooks", 3);
    run = await t.settle(run.id);
    expect(run.status).toBe("ready");
    const [, , script, caption, tags] = run.steps;
    const hook = hooks.candidates[3].text;
    expect(script.inputs!.idea).toBe(`Open with this hook: ${hook}\n\nThe idea: ${IDEA}`);
    expect(caption.inputs!.post).toBe(outputText(script.output!));
    expect(caption.inputs!.platforms).toBe("tiktok");
    expect(caption.picked?.by).toBe("brand_fit");
    expect(tags.inputs!.caption).toBe(caption.candidates[caption.picked!.index].text);
    // Every step ran on the person's Brand Brain.
    const stepRuns = await t.engine.listRuns(t.team.id);
    expect(stepRuns).toHaveLength(4);
    expect(stepRuns.every((r) => r.brandBrain?.id === t.crumb.id && r.parent?.pipelineRunId === run.id)).toBe(true);

    expect(run.package!.map((p) => p.label)).toEqual(["Hook", "Script", "Caption", "Tags and search words"]);
    expect(run.package![0].item?.text).toBe(hook);
    expect(run.package!.every((p) => p.brandFit === null || (p.brandFit >= 0 && p.brandFit <= 100))).toBe(true);
    // Costs are the sum of the step runs.
    expect(run.costMicroUsd).toBe(stepRuns.reduce((n, r) => n + r.costMicroUsd, 0));
    expect(run.costMicroUsd).toBeLessThanOrEqual(run.capMicroUsd);
    expect(run.costMicroUsd).toBeGreaterThan(0);
  });

  it("asks for ideas first when the person wants them, and carries the picked idea into the hooks", async () => {
    const t = await bakery();
    const started = await t.start("idea-to-post", t.ideaInputs({ start: "ideas", idea: "Our sourdough and the people who bake it" }));
    let run = await t.settle(started.id);
    expect(run.steps[0].status).toBe("waiting");
    expect(run.steps[0].candidates).toHaveLength(7);
    await t.api.pickInPipeline(t.me, t.team.id, run.id, "ideas", 2);
    run = await t.settle(run.id);
    expect(run.steps[1].status).toBe("waiting");
    expect(run.steps[1].inputs!.idea).toBe(run.steps[0].candidates[2].fields!.idea);
  });

  it("takes the caption with the best brand fit", async () => {
    const t = await bakery({
      fake: {
        respond: (req) => {
          if (agentOf(req) !== "caption-writer") return undefined;
          return JSON.stringify({ captions: [{ platform: "tiktok", variants: ["Our artisanal, mouthwatering loaves for your weekend", "The starter is called Gerald. Gerald is nine on Saturday."] }] });
        },
      },
    });
    const run = await t.settle((await t.start("caption-and-tags", { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok", brand: t.crumb.id })).id);
    // caption-and-tags asks the person; pick nothing yet and check the suggestion and the scores.
    const cap = run.steps[0];
    expect(cap.candidates[0].brandFit!).toBeLessThan(cap.candidates[1].brandFit!);
    expect(cap.candidates[0].flags.join(" ")).toContain("artisanal");
    expect(cap.suggested).toBe(1);

    // idea-to-post takes the best fit on its own.
    const full = await t.start("idea-to-post", t.ideaInputs());
    await t.settle(full.id);
    await t.api.pickInPipeline(t.me, t.team.id, full.id, "hooks", 0);
    const done = await t.settle(full.id);
    expect(done.steps[3].picked).toMatchObject({ index: 1, by: "brand_fit" });
    expect(done.package!.find((p) => p.label === "Caption")!.item!.text).toContain("Gerald is nine");
  });

  it("rewrites a step once with the failure as a note when a brand check fails", async () => {
    const t = await bakery({
      fake: {
        respond: (req) => {
          if (agentOf(req) !== "script-writer") return undefined;
          const base = defaultAnswer(req);
          // Phase 12: the first run's quality-gate rewrites stay dirty too, so the step's own rewrite is what fixes it.
          const stepRewrite = req.messages.some((m) => m.role === "user" && m.content.includes("Rewrite it. The last draft failed"));
          // The fake builds its answer from words in the prompt; the rewrite note names the word, so keep it out of the clean draft.
          return stepRewrite ? base.replace(/artisanal/gi, "") : base.replace(/"spoken": "/, '"spoken": "Our artisanal ');
        },
      },
    });
    const started = await t.start("idea-to-post", t.ideaInputs());
    await t.settle(started.id);
    await t.api.pickInPipeline(t.me, t.team.id, started.id, "hooks", 0);
    const run = await t.settle(started.id);
    const script = run.steps[2];
    expect(script.runIds).toHaveLength(2);
    expect(script.rewrite?.note).toMatch(/^Rewrite it\. The last draft failed these checks: Uses words your brand avoids: artisanal/);
    const [first, second] = await Promise.all(script.runIds.map((id) => t.engine.getRun(t.team.id, id)));
    expect(first!.needsReview).toBe(true);
    expect(String(second!.inputs.idea)).toContain(`${NOTE_PREFIX}Rewrite it.`);
    expect(script.runId).toBe(second!.id);
    expect(script.status).toBe("done");
    expect(run.status).toBe("ready");
  });

  it("marks a step for review when the rewrite fails too, or stops when the step says so", async () => {
    const dirty = { respond: (req: CompletionRequest) => (agentOf(req) === "script-writer" ? defaultAnswer(req).replace(/"spoken": "/, '"spoken": "Our artisanal ') : undefined) };
    const t = await bakery({ fake: dirty });
    const a = await t.start("idea-to-post", t.ideaInputs());
    await t.settle(a.id);
    await t.api.pickInPipeline(t.me, t.team.id, a.id, "hooks", 0);
    const run = await t.settle(a.id);
    expect(run.steps[2].status).toBe("flagged");
    expect(run.steps[2].runIds).toHaveLength(2);
    expect(run.status).toBe("ready");
    expect(run.needsReview).toBe(true);
    expect(run.package!.find((p) => p.label === "Script")!.flags.join(" ")).toContain("artisanal");
    expect((await t.api.pipelineRun(t.me, t.team.id, a.id))!.state).toBe("needs_review");

    // A builder's pipeline that stops instead.
    const stop = template("idea-to-post");
    stop.id = "idea-to-post-strict";
    stop.steps[2].onFail = { when: "brand", rewrite: true, then: "stop" };
    await t.pipelines.create(t.launchAuthor, PLATFORM_WORKSPACE_ID, stop);
    const b = await t.start("idea-to-post-strict", t.ideaInputs());
    await t.settle(b.id);
    await t.api.pickInPipeline(t.me, t.team.id, b.id, "hooks", 0);
    const failed = await t.settle(b.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({ code: "checks_failed", step: "script" });
    expect(failed.steps.map((s) => s.status)).toEqual(["skipped", "done", "failed", "todo", "todo"]);
  });

  it("refuses a pick that is out of range or when nothing waits", async () => {
    const t = await bakery();
    const run = await t.settle((await t.start("idea-to-post", t.ideaInputs())).id);
    await rejectsCode(t.api.pickInPipeline(t.me, t.team.id, run.id, "hooks", 10), "invalid_request");
    await rejectsCode(t.api.pickInPipeline(t.me, t.team.id, run.id, "script", 0), "not_ready");
    await t.api.pickInPipeline(t.me, t.team.id, run.id, "hooks", 0);
    await rejectsCode(t.api.pickInPipeline(t.me, t.team.id, run.id, "hooks", 1), "not_ready");
    expect((await t.settle(run.id)).steps[1].picked).toMatchObject({ index: 0, by: "person", userId: t.ada.id });
  });

  it("cancels mid-run: the step run stops and nothing after it runs", async () => {
    const t = await bakery({ fake: { latencyMs: 200 } });
    const run = await t.start("caption-and-tags", { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" });
    await new Promise((r) => setTimeout(r, 40));
    const mid = (await t.api.pipelineRun(t.me, t.team.id, run.id))!.run;
    expect(mid.steps[0].status).toBe("running");
    const cancelled = await t.api.cancelPipeline(t.me, t.team.id, run.id);
    expect(cancelled.status).toBe("cancelled");
    await t.pipelineEngine.idle();
    await t.engine.idle();
    const after = (await t.api.pipelineRun(t.me, t.team.id, run.id))!.run;
    expect(after.steps.map((s) => s.status)).toEqual(["cancelled", "todo"]);
    const runs = await t.engine.listRuns(t.team.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("cancelled");
    // A cancelled run stays cancelled.
    expect((await t.api.cancelPipeline(t.me, t.team.id, run.id)).status).toBe("cancelled");
  });

  it("keeps the total under the pipeline's cap and stops when the budget runs out", async () => {
    const t = await bakery();
    // One cent: enough for the hooks on the cheaper route, not for a script on any route.
    const capped = await t.pipelines.submit(t.me, { workspaceId: t.team.id, pipelineId: "idea-to-post", pipelineWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: t.ideaInputs(), maxCostUsd: 0.01 });
    expect(capped.status).toBe("running");
    await t.settle(capped.id);
    await t.api.pickInPipeline(t.me, t.team.id, capped.id, "hooks", 0);
    const out = await t.settle(capped.id);
    expect(out.status).toBe("failed");
    expect(out.error).toMatchObject({ code: "spend_cap", step: "script" });
    expect(out.error!.message).toMatch(/^The pipeline's budget ran out before "Write the script"\./);
    expect(out.steps.map((s) => s.status)).toEqual(["skipped", "done", "failed", "todo", "todo"]);
    expect(out.capMicroUsd).toBe(10_000);
    expect(out.costMicroUsd).toBeGreaterThan(0);
    expect(out.costMicroUsd).toBeLessThanOrEqual(out.capMicroUsd);
    // Each step was capped at what was left: the hooks ran under one cent.
    const hooks = (await t.engine.getRun(t.team.id, out.steps[1].runIds[0]))!;
    expect(hooks.capMicroUsd).toBe(10_000);
    // The costs, for people who may see them.
    const costs = await t.pipelines.costs(t.me, t.team.id, capped.id);
    expect(costs).toMatchObject({ capUsd: 0.01, costMicroUsd: out.costMicroUsd });

    // A cap too small for any step stops before anything runs.
    const none = await t.pipelines.submit(t.me, { workspaceId: t.team.id, pipelineId: "caption-and-tags", pipelineWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: { post: "Gerald the starter turns nine, with a candle on the jar", platform: "x" }, maxCostUsd: 0.000001 });
    const nothing = await t.settle(none.id);
    expect(nothing.error?.code).toBe("spend_cap");
    expect(nothing.steps[0].runIds).toEqual([]);
  });

  it("is idempotent: one key, one run, and a different request with the key is refused", async () => {
    const t = await bakery();
    const inputs = { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" };
    const [a, b] = await Promise.all([t.start("caption-and-tags", inputs, { idempotencyKey: "click-1" }), t.start("caption-and-tags", inputs, { idempotencyKey: "click-1" })]);
    expect(a.id).toBe(b.id);
    expect((await t.start("caption-and-tags", inputs, { idempotencyKey: "click-1" })).id).toBe(a.id);
    await rejectsCode(t.start("caption-and-tags", { ...inputs, platform: "x" }, { idempotencyKey: "click-1" }), "invalid_request");
    await t.settle(a.id);
    expect(await t.api.pipelineRuns(t.me, t.team.id)).toHaveLength(1);
  });

  it("tries a failed step once more, then stops with the steps so far kept, and picks up again on retry", async () => {
    let broken = true;
    const t = await bakery({
      fake: { respond: (req) => (broken && agentOf(req) === "hashtag-picker" ? new ProviderError("unavailable", "Down for a moment.") : undefined) },
      engine: { maxAttempts: 1 },
    });
    const run = await t.settle((await t.start("caption-and-tags", { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" })).id);
    await t.api.pickInPipeline(t.me, t.team.id, run.id, "caption", 1);
    const failed = await t.settle(run.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({ code: "step_failed", step: "tags" });
    expect(failed.steps[1].runIds).toHaveLength(2);
    expect(failed.steps[0].status).toBe("done");

    broken = false;
    await t.api.retryPipeline(t.me, t.team.id, run.id);
    const ready = await t.settle(run.id);
    expect(ready.status).toBe("ready");
    expect(ready.steps[1].runIds).toHaveLength(3);
    expect(ready.steps[0].picked?.index).toBe(1);
  });

  it("refuses at submit when an agent update breaks the chain, and pins versions per run", async () => {
    const t = await bakery();
    const inputs = { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" };
    const before = await t.start("caption-and-tags", inputs);
    expect(before.steps.map((s) => s.agent.version)).toEqual(["1.1.2", "2.0.1"]);
    const spec = (await t.registry.get(PLATFORM_WORKSPACE_ID, "hashtag-picker"))!;
    await t.registry.update(PLATFORM_WORKSPACE_ID, "hashtag-picker", {
      inputs: spec.inputs.map((i) => (i.key === "caption" ? { ...i, key: "post_text" } : i)),
      instructions: spec.instructions.replace("{{caption}}", "{{post_text}}"),
    }, { bump: "major" });
    const err = await rejectsCode(t.start("caption-and-tags", inputs), "invalid_request");
    expect(err.message).toBe("This pipeline no longer fits its agents. A builder needs to fix it.");
    expect((err as unknown as { issues: string[] }).issues.join(" ")).toContain('Hashtag Optimizer has no input "caption"');
  });

  it("asks for the rights confirmation the repurposer needs", async () => {
    const t = await bakery();
    const inputs = { post: "We burned 40 croissants so you would not have to. Here is what we learned.", posted_on: "x", to: "reels" };
    const err = await rejectsCode(t.start("repurpose-post", inputs), "invalid_request");
    expect((err as unknown as { issues: string[] }).issues[0]).toMatch(/rights/);
    const run = await t.settle((await t.start("repurpose-post", inputs, { confirmations: { rights: true } })).id);
    expect(run.status).toBe("ready");
    expect(run.steps[0].picked).toMatchObject({ index: 0, by: "rule" });
    expect(run.package!.map((p) => p.label)).toEqual(["New version", "Tags and search words"]);
  });

  it("checks the person's inputs and Brand Brain before anything runs", async () => {
    const t = await bakery();
    const err = await rejectsCode(t.start("idea-to-post", t.ideaInputs({ idea: "short", platform: "x" })), "invalid_request");
    expect((err as unknown as { issues: string[] }).issues).toEqual(expect.arrayContaining([expect.stringMatching(/^idea: Must be at least 10/), expect.stringMatching(/^platform: Unknown option "x"/)]));
    await rejectsCode(t.start("idea-to-post", t.ideaInputs({ brand: "bb_nope" })), "invalid_request");
    await rejectsCode(t.start("no-such-pipeline", {}), "not_found");
    expect(await t.engine.listRuns(t.team.id)).toEqual([]);
  });

  it("takes the human approve step at the end: approve, reject with a note, take it back", async () => {
    const t = await bakery();
    const run = await t.settle((await t.start("repurpose-post", { post: "We burned 40 croissants so you would not have to. Here is what we learned.", posted_on: "x", to: "tiktok" }, { confirmations: { rights: true } })).id);
    expect(await t.api.openCount(t.me, t.team.id)).toBe(1);
    const approved = await t.api.decidePipeline(t.me, t.team.id, run.id, "approved", "Posting Friday.");
    expect(approved).toMatchObject({ status: "approved", decision: { decision: "approved", note: "Posting Friday.", by: t.ada.id } });
    expect(await t.api.openCount(t.me, t.team.id)).toBe(0);
    expect((await t.api.decidePipeline(t.me, t.team.id, run.id, "rejected", "Too long")).status).toBe("rejected");
    expect((await t.api.clearPipelineDecision(t.me, t.team.id, run.id)).status).toBe("ready");

    const waiting = await t.settle((await t.start("caption-and-tags", { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" })).id);
    await rejectsCode(t.api.decidePipeline(t.me, t.team.id, waiting.id, "approved"), "not_ready");
  });
});

/* ---------- History, access, install ---------- */

describe("pipelines in the app", () => {
  it("shows the whole chain in history: pipeline runs listed, their step runs inside them, not loose", async () => {
    const t = await bakery();
    await t.api.startRun(t.me, t.team.id, { agentId: "hook-writer", inputs: { idea: IDEA, platform: "x" } });
    const run = await t.settle((await t.start("idea-to-post", t.ideaInputs())).id);
    await t.api.pickInPipeline(t.me, t.team.id, run.id, "hooks", 2);
    await t.settle(run.id);
    await t.engine.idle();

    const loose = await t.api.runs(t.me, t.team.id);
    expect(loose).toHaveLength(1);
    expect(loose[0].run.parent).toBeNull();
    const pipes = await t.api.pipelineRuns(t.me, t.team.id);
    expect(pipes.map((p) => [p.run.pipeline.name, p.state, p.title])).toEqual([["Idea to ready post", "ready", IDEA]]);
    const chain = await t.api.pipelineStepRuns(t.me, t.team.id, run.id);
    expect(chain.map((r) => [r.agent.id, r.parent?.step])).toEqual([
      ["hook-writer", 1],
      ["script-writer", 2],
      ["caption-writer", 3],
      ["hashtag-picker", 4],
    ]);
    expect(chain.every((r) => r.parent?.pipelineRunId === run.id)).toBe(true);
    // Public views carry no cost.
    expect(JSON.stringify(pipes[0].run)).not.toContain("costMicroUsd");
    expect((await t.api.pipelineRuns(t.me, t.team.id, { q: "gerald" })).length).toBe(1);
    expect((await t.api.pipelineRuns(t.me, t.team.id, { q: "croissant" })).length).toBe(0);
    expect((await t.api.pipelineRuns(t.me, t.team.id, { state: "open" })).length).toBe(1);
  });

  it("lists the templates for every workspace, with their agents by name", async () => {
    const t = await bakery();
    const list = await t.api.pipelines(t.me, t.team.id);
    expect(list.map((p) => p.spec.name)).toEqual(["Caption and tags for a clip", "Idea to ready post", "Repurpose a post that worked"]);
    const idea = list.find((p) => p.spec.id === "idea-to-post")!;
    expect(idea.steps.map((s) => s.agentName)).toEqual(["Idea Generator", "Hook Writer", "Script Writer", "Caption Writer", "Hashtag Optimizer"]);
    expect(list.find((p) => p.spec.id === "repurpose-post")!.confirmations.rights).toBe(true);
  });

  it("lets viewers read but not run, pick or decide; outsiders see nothing; edits are for editors of the workspace", async () => {
    const t = await bakery();
    const vic = await t.join("vic@example.com", "viewer");
    const run = await t.settle((await t.start("caption-and-tags", { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" })).id);
    expect((await t.api.pipelineRun(as(vic.id), t.team.id, run.id))!.run.id).toBe(run.id);
    await rejectsCode(t.api.startPipeline(as(vic.id), t.team.id, { pipelineId: "caption-and-tags", inputs: { post: "Gerald the starter turns nine", platform: "tiktok" } }), "forbidden");
    await rejectsCode(t.api.pickInPipeline(as(vic.id), t.team.id, run.id, "caption", 0), "forbidden");
    await rejectsCode(t.api.cancelPipeline(as(vic.id), t.team.id, run.id), "forbidden");
    await rejectsCode(t.api.pipelineRun(as(t.eve.id), t.team.id, run.id), "not_found");
    await rejectsCode(t.api.pipelineRuns(as(t.eve.id), t.team.id), "not_found");
    // Another workspace cannot reach this run.
    const other = await t.accounts.workspaces.create(as(t.eve.id), "Eve's");
    expect(await t.api.pipelineRun(as(t.eve.id), other.id, run.id)).toBeNull();
    // Nobody but builders edits the platform's templates.
    await rejectsCode(t.pipelines.update(t.me, PLATFORM_WORKSPACE_ID, "idea-to-post", { name: "Mine now" }), "not_found");
    // A workspace's own pipeline cannot claim to be the platform's.
    await rejectsCode(t.pipelines.create(t.me, t.team.id, template("caption-and-tags")), "forbidden");
    await rejectsCode(t.pipelines.create(as(vic.id), t.team.id, { ...template("caption-and-tags"), owner: { kind: "creator", creatorId: "creator_team" } }), "forbidden");
    // An editor's own pipeline over the platform's live agents is fine, and visible only to its workspace.
    const own = await t.pipelines.create(t.me, t.team.id, { ...template("caption-and-tags"), id: "our-captions", name: "Our captions", owner: { kind: "creator", creatorId: "creator_team" }, status: "live", visibility: "workspace" });
    expect(own.id).toBe("our-captions");
    expect((await t.api.pipelines(t.me, t.team.id)).map((p) => p.spec.id)).toContain("our-captions");
    expect(await t.pipelines.get(as(t.eve.id), t.team.id, "our-captions")).toBeNull();
  });

  it("installs the templates idempotently and never saves over a builder's version", async () => {
    const t = await bakery();
    const again = await installPipelineTemplates(t.pipelines, t.launchAuthor, LAUNCH_AUTHOR_ID);
    expect(again.map((r) => r.action)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect((await t.pipelines.versions(t.launchAuthor, PLATFORM_WORKSPACE_ID, "idea-to-post")).map((v) => [v.version, v.by, v.note])).toEqual([["1.0.0", LAUNCH_AUTHOR_ID, "Pipeline template"]]);

    // A builder (not the launch author) saves a version; a newer template does not overwrite it.
    const fun = await t.signUp("funkai@example.com");
    void fun;
    await t.pipelineRegistry.update(PLATFORM_WORKSPACE_ID, "caption-and-tags", { name: "Caption and tags" }, { by: "usr_funkai" });
    const bumped = PIPELINE_TEMPLATES.map((p) => ({ ...p, version: "1.1.0", job: `${p.job} Now better.` }));
    const original = [...PIPELINE_TEMPLATES];
    PIPELINE_TEMPLATES.splice(0, PIPELINE_TEMPLATES.length, ...bumped);
    try {
      const r = await installPipelineTemplates(t.pipelines, t.launchAuthor, LAUNCH_AUTHOR_ID);
      expect(Object.fromEntries(r.map((x) => [x.id, x.action]))).toEqual({ "idea-to-post": "updated", "repurpose-post": "updated", "caption-and-tags": "kept" });
      expect((await t.pipelineRegistry.get(PLATFORM_WORKSPACE_ID, "caption-and-tags"))!.name).toBe("Caption and tags");
    } finally {
      PIPELINE_TEMPLATES.splice(0, PIPELINE_TEMPLATES.length, ...original);
    }
  });

  it("versions pipelines like agents: new versions, no empty saves, rollback", async () => {
    const t = await bakery();
    const reg = t.pipelineRegistry;
    const saved = await reg.update(PLATFORM_WORKSPACE_ID, "caption-and-tags", { maxCostUsd: 0.25 }, { note: "Lower cap" });
    expect(saved.version).toBe("1.0.1");
    await rejectsCode(reg.update(PLATFORM_WORKSPACE_ID, "caption-and-tags", { maxCostUsd: 0.25 }), "no_change");
    await rejectsCode(reg.update(PLATFORM_WORKSPACE_ID, "caption-and-tags", { version: "1.0.0", maxCostUsd: 0.2 }), "version_conflict");
    const bad = await rejectsCode(reg.update(PLATFORM_WORKSPACE_ID, "caption-and-tags", { steps: [] }), "invalid_pipeline");
    expect(bad.message).toContain("A pipeline needs at least one step.");
    expect((await reg.rollback(PLATFORM_WORKSPACE_ID, "caption-and-tags", "1.0.0")).maxCostUsd).toBe(0.3);
    expect((await reg.versions(PLATFORM_WORKSPACE_ID, "caption-and-tags")).map((v) => [v.version, v.current])).toEqual([
      ["1.0.0", true],
      ["1.0.1", false],
    ]);
    // A run keeps the body it ran with.
    const run = await t.start("caption-and-tags", { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" });
    expect(run.pipeline.version).toBe("1.0.0");
    expect(run.spec.maxCostUsd).toBe(0.3);
  });
});
