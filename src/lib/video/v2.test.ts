import { describe, expect, it } from "vitest";
import { testAccounts } from "@/lib/accounts/test-helpers";
import type { AgentBody } from "@/lib/agents/spec";
import { memoryFileStorage } from "@/lib/builder/storage";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { validateRunInputs } from "@/lib/runs/inputs";
import { captionCues, captionLayout, captionSvg, videoCues, wordTimings } from "./captions";
import { overlayList } from "./finish";
import { fakeVideoMedia, type FinishOptions } from "./media";
import { PACK_AGENTS, packInputs, packPlatform, startPostPack } from "./pack";
import { fakePlanner, normalizeBrief, picturePrompt, styleFor, type Brief } from "./planner";
import { defaultProposal, describe as describeSettings, fakeProposer, parseProposal } from "./proposal";
import { PICTURE_RULES, PICTURE_STYLES, STYLES, TYPES, brandPalette } from "./styles";
import { VideoStudio, memoryVideoStore, restyleTargets, splitText, voiceKey, type VideoProject } from "./studio";

function brief(over: Partial<Brief> = {}): Brief {
  return normalizeBrief({ idea: "Why our croissants take three days", type: "explainer", style: "2d", vibe: "fun", seconds: 15, aspect: "9:16", voiceover: true, voice: "warm", captions: { on: true, look: "bold", position: "bottom" }, brand: true, ...over })!;
}

async function setup(opts: { media?: ReturnType<typeof fakeVideoMedia> } = {}) {
  const t = testAccounts();
  const ada = (await t.signUp("ada@example.com")).user;
  const me = { kind: "user" as const, userId: ada.id };
  const ws = (await t.accounts.workspaces.create(me, "Team")).id;
  const media = opts.media ?? fakeVideoMedia();
  const store = memoryVideoStore();
  const files = memoryFileStorage();
  const finished: FinishOptions[] = [];
  const studio = new VideoStudio({
    accounts: t.accounts,
    store,
    files,
    media: { ...media, finish: async (video, o) => (finished.push(o), media.finish(video, o, AbortSignal.timeout(1000))) },
    planner: fakePlanner(),
    proposer: fakeProposer(),
    animate: async () => new Uint8Array([0, 0, 0, 0x18]),
    card: async () => new Uint8Array([0x89, 0x50]),
  });
  return { studio, media, store, files, me, ws, finished };
}

const SCENES = [
  { spoken: "Every croissant on this counter started three days ago. Day one is just the dough.", onScreen: "A tray of croissants", seconds: 6 },
  { spoken: "Day two, the butter goes in.", onScreen: "Butter folded into dough", seconds: 3 },
  { spoken: "Day three, they bake.", onScreen: "An oven", seconds: 3 },
];

describe("the proposal", () => {
  it("reads the model's answer strictly, with the default for anything out of range", () => {
    const p = parseProposal(
      'Sure: {"type":"product","style":"3d","voiceover":true,"voice":"calm","captions":{"on":true,"look":"bold","position":"middle"},"seconds":30,"aspect":"9:16","mood":"calm","summary":"A 30 second 3D product video.","why":"It shows the thing \u2014 up close.","questions":[]}',
    );
    expect(p).toMatchObject({ type: "product", style: "3d", voice: "calm", captions: { on: true, look: "bold", position: "middle" }, seconds: 30, vibe: "calm", questions: [] });
    expect(p?.why).toBe("It shows the thing, up close.");
    const bad = parseProposal('{"type":"vlog","style":"anime","voiceover":"yes","voice":"robot","captions":{"look":"neon"},"seconds":45,"aspect":"4:3","mood":"loud"}');
    const d = defaultProposal();
    expect(bad).toMatchObject({ type: d.type, style: d.style, voiceover: d.voiceover, voice: d.voice, captions: d.captions, seconds: d.seconds, aspect: d.aspect, vibe: d.vibe });
    expect(bad?.summary).toBe(describeSettings(bad!));
    expect(parseProposal("no json here")).toBeNull();
    expect(parseProposal("[1,2]")).toBeNull();
  });

  it("asks at most two questions, each with two to four tap answers", () => {
    const p = parseProposal(
      JSON.stringify({ questions: [{ question: "Who is it for?", answers: ["A", "B", "C", "D", "E"] }, { question: "One answer only", answers: ["A"] }, { question: "Third?", answers: ["A", "B"] }, { question: "Fourth?", answers: ["A", "B"] }] }),
    );
    expect(p?.questions).toEqual([
      { question: "Who is it for?", answers: ["A", "B", "C", "D"] },
      { question: "Third?", answers: ["A", "B"] },
    ]);
  });

  it("falls back to a safe default, led by a reference's look", async () => {
    expect(defaultProposal({ look: "pixel", vibe: "bold" })).toMatchObject({ style: "pixel", vibe: "bold", questions: [] });
    expect(describeSettings(defaultProposal())).toBe("A 30 second 2D explainer video, fun, with a warm voiceover and clean captions, vertical for TikTok and Reels.");
    const { studio, me, ws } = await setup();
    const r = await studio.propose(me, ws, { idea: "Croissants", reference: null, brand: "" });
    expect(r.proposal.questions).toHaveLength(2);
    await expect(studio.propose(me, ws, { idea: "x", reference: null, brand: "" })).rejects.toThrow("Write your idea");
  });

  it("feeds the answers into the plan", async () => {
    const { plannerPrompt } = await import("./planner");
    const msgs = plannerPrompt(brief({ answers: [{ question: "Who is it for?", answer: "New customers" }] }), "");
    expect(msgs[1].content).toContain("Who is it for? New customers");
    expect(msgs[1].content).toContain("The look is 2D");
    expect(msgs[1].content).toContain("at most 30 spoken words");
  });
});

describe("the style table", () => {
  it("has seven types and seven styles, each picture style with its own rules and motion", () => {
    expect(TYPES.map((t) => t.value)).toEqual(["explainer", "product", "teaser", "story", "ad", "tutorial", "announcement"]);
    expect(STYLES.map((s) => s.value)).toEqual(["3d", "2d", "realistic", "hyperrealistic", "comic", "motion", "pixel"]);
    expect(PICTURE_STYLES).not.toContain("motion");
    const pictures = PICTURE_STYLES.map((s) => styleFor(brief({ style: s })).picture);
    expect(new Set(pictures).size).toBe(6);
    expect(styleFor(brief({ style: "motion" })).picture).toBe("");
    expect(styleFor(brief({ style: "pixel" })).motion).toBe("still");
    expect(styleFor(brief({ style: "comic" })).motion).toBe("punchy");
    expect(styleFor(brief({ style: "comic" })).picture).toContain("No speech bubbles");
    const prompt = picturePrompt({ spoken: "", onScreen: "A croissant" }, styleFor(brief({ style: "3d" })).picture, "");
    expect(prompt).toContain(PICTURE_RULES);
    expect(PICTURE_RULES).toMatch(/No real or famous person/);
    expect(PICTURE_RULES).toMatch(/No trademarks/);
    expect(PICTURE_RULES).toMatch(/No text/);
  });

  it("picks brand colours by role: a readable accent, a dark and a light", () => {
    expect(brandPalette(["#1B1F3B", "#E0A458"])).toEqual({ accent: "#E0A458", highlight: "#E0A458", dark: "#1B1F3B", light: "#FFFFFF" });
    expect(brandPalette([])).toEqual({ accent: null, highlight: null, dark: "#0B0B10", light: "#FFFFFF" });
    // A cream reads on a picture but would not stand out as the lit caption word.
    expect(brandPalette(["#F3E3C3", "#2B2420"])).toMatchObject({ accent: "#F3E3C3", highlight: null });
    expect(brandPalette(["#3E7CB1", "#E8F1F8"]).light).toBe("#E8F1F8");
  });
});

describe("captions", () => {
  it("spreads the words over the measured speech time by their length, pausing after a full stop", () => {
    const w = wordTimings("I am extraordinary. Yes", 1, 4);
    expect(w[0].start).toBe(1);
    expect(w.at(-1)!.end).toBeCloseTo(5, 2);
    const len = (i: number) => w[i].end - w[i].start;
    expect(len(2)).toBeGreaterThan(len(0) * 3);
    // The pause after "extraordinary." makes a gap before "Yes".
    expect(w[3].start - w[2].end).toBeGreaterThan(0.2);
    expect(wordTimings("", 0, 3)).toEqual([]);
  });

  it("shows a line until the next one for Clean, and lights one word at a time for Bold", () => {
    const words = wordTimings("one two three four five six seven", 0, 3.5);
    const layout = captionLayout("bold", "bottom", 1080, 1920);
    const bold = captionCues(words, "bold", layout, 3.5);
    expect(bold).toHaveLength(7);
    expect(bold[0]).toMatchObject({ words: ["one", "two", "three"], active: 0 });
    expect(bold[2].end).toBeCloseTo(bold[3].start, 3);
    const clean = captionCues(words, "clean", captionLayout("clean", "bottom", 1080, 1920), 3.5);
    expect(clean.map((c) => c.words.length)).toEqual([4, 3]);
    expect(clean.every((c) => c.active === -1)).toBe(true);
    expect(clean.at(-1)!.end).toBeLessThanOrEqual(3.5);
  });

  it("places each scene's captions at its own start and never past its end", () => {
    const cues = videoCues(
      [
        { words: "Hello there friend", start: 0, seconds: 3, speechStart: 0, speechSeconds: 2 },
        { words: "Come in", start: 3, seconds: 2, speechStart: 0.3, speechSeconds: 5 },
      ],
      "clean",
      "middle",
      1920,
      1080,
    );
    expect(cues[0].start).toBe(0);
    expect(cues[1].start).toBeCloseTo(3.3, 3);
    expect(cues[1].end).toBeLessThanOrEqual(5);
  });

  it("draws a cue as SVG with the lit word in the highlight colour, words escaped", () => {
    const svg = captionSvg({ start: 0, end: 1, words: ["fish", "&", "chips"], active: 2 }, "bold", "middle", 1080, 1920, "#FFD84D");
    expect(svg).toContain("CHIPS");
    expect(svg).toContain("&amp;");
    expect(svg).toContain('fill="#FFD84D">CHIPS');
    expect(captionLayout("bold", "middle", 1080, 1920).y).toBeGreaterThan(900);
    expect(captionLayout("clean", "bottom", 1080, 1920).y).toBeGreaterThan(1400);
  });

  it("builds the overlay track with empty frames in the gaps", () => {
    const list = overlayList([{ start: 0.5, end: 1 }, { start: 1, end: 2 }], 3, (i) => `c${i}.png`, "blank.png");
    expect(list).toBe("file 'blank.png'\nduration 0.500\nfile 'c0.png'\nduration 0.500\nfile 'c1.png'\nduration 1.000\nfile 'blank.png'\nduration 1.000\nfile 'blank.png'\n");
  });
});

describe("arranging the storyboard", () => {
  it("splits at a sentence break, or a comma when it is one sentence", () => {
    expect(splitText("One two three. Four five six. Seven.")).toEqual(["One two three.", "Four five six. Seven."]);
    expect(splitText("Fresh bread, every morning")).toEqual(["Fresh bread,", "every morning"]);
    expect(splitText("Fresh bread")).toBeNull();
  });

  it("moves, duplicates, splits, merges, locks and deletes, and undoes each in turn", async () => {
    const { studio, me, ws } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES });
    const ids = v.scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
    v = await studio.moveScene(me, ws, v.id, 2, 0);
    expect(v.scenes.map((s) => s.id)).toEqual([ids[2], ids[0], ids[1]]);
    v = await studio.duplicateScene(me, ws, v.id, 0);
    expect(v.scenes).toHaveLength(4);
    expect(v.scenes[1]).toMatchObject({ spoken: v.scenes[0].spoken });
    expect(v.scenes[1].id).not.toBe(v.scenes[0].id);
    v = await studio.splitScene(me, ws, v.id, 2);
    expect(v.scenes.slice(2, 4).map((s) => s.spoken)).toEqual(["Every croissant on this counter started three days ago.", "Day one is just the dough."]);
    expect(v.scenes[2].seconds + v.scenes[3].seconds).toBe(6);
    v = await studio.mergeScenes(me, ws, v.id, 2);
    expect(v.scenes[2].spoken).toBe(SCENES[0].spoken);
    expect(v.scenes).toHaveLength(4);
    v = await studio.lockScene(me, ws, v.id, 0, true);
    expect(v.scenes[0].locked).toBe(true);
    v = await studio.removeScene(me, ws, v.id, 1);
    expect(v.scenes).toHaveLength(3);
    expect(v.history?.map((h) => h.label)).toEqual(["Moved a scene", "Duplicated a scene", "Split a scene", "Merged two scenes", "Locked a scene", "Deleted a scene"]);
    // Undo walks back one change at a time.
    v = await studio.undo(me, ws, v.id);
    expect(v.scenes).toHaveLength(4);
    v = await studio.undo(me, ws, v.id);
    expect(v.scenes[0].locked).toBeFalsy();
    for (let i = 0; i < 4; i++) v = await studio.undo(me, ws, v.id);
    expect(v.scenes.map((s) => s.id)).toEqual(ids);
    await expect(studio.undo(me, ws, v.id)).rejects.toThrow("nothing to undo");
  });

  it("keeps only the last 10 changes, and a change that changes nothing is not one", async () => {
    const { studio, me, ws } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES });
    for (let i = 0; i < 12; i++) v = await studio.editScene(me, ws, v.id, 0, { seconds: 3 + (i % 5) });
    expect(v.history).toHaveLength(10);
    const before = v.history!.length;
    v = await studio.editScene(me, ws, v.id, 0, { seconds: v.scenes[0].seconds });
    expect(v.history).toHaveLength(before);
    v = await studio.editScene(me, ws, v.id, 2, { spoken: "Bake it." });
    await expect(studio.splitScene(me, ws, v.id, 2)).rejects.toThrow("nowhere to split");
  });
});

describe("restyle and two options", () => {
  it("redraws only the unlocked scenes that are not the person's own, and undo brings the old pictures back", async () => {
    const base = fakeVideoMedia();
    const prompts: string[] = [];
    const { studio, me, ws } = await setup({ media: Object.assign(base, { image: async (p: string, s: AbortSignal) => (prompts.push(p), fakeVideoMedia().image(p, s)) }) });
    let v = await studio.create(me, ws, { scenes: SCENES, brief: brief({ style: "2d" }) });
    v = await studio.storyboard(me, ws, v.id);
    const first = v.scenes.map((s) => s.imageFileId);
    v = await studio.lockScene(me, ws, v.id, 0, true);
    v = await studio.useOwnMedia(me, ws, v.id, 1, { image: { name: "p.jpg", mimeType: "image/jpeg", bytes: new Uint8Array([1]) } });
    expect(restyleTargets(v)).toEqual([2]);
    expect(studio.price(v, "restyle")).toEqual({ credits: 0, free: true });
    const before = prompts.length;
    v = await studio.restyle(me, ws, v.id, "pixel");
    expect(v.brief?.style).toBe("pixel");
    const drawn = prompts.slice(before);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toContain("Retro pixel art");
    expect(drawn[0]).toContain("An oven");
    expect(v.scenes[0].imageFileId).toBe(first[0]);
    expect(v.scenes[2].imageFileId).not.toBe(first[2]);
    v = await studio.undo(me, ws, v.id);
    expect(v.brief?.style).toBe("2d");
    expect(v.scenes[2].imageFileId).toBe(first[2]);
    await expect(studio.restyle(me, ws, v.id, "comic", "", 0)).rejects.toThrow("locked");
    await expect(studio.restyle(me, ws, v.id, "motion")).rejects.toThrow("own plan");
    // One scene's own look.
    v = await studio.restyle(me, ws, v.id, "comic", "", 2);
    expect(v.scenes[2].style).toBe("comic");
    expect(v.brief?.style).toBe("2d");
  });

  it("draws two options as one job, and the pick replaces the picture", async () => {
    const { studio, me, ws } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES, brief: brief() });
    v = await studio.storyboard(me, ws, v.id);
    const old = v.scenes[1].imageFileId;
    v = await studio.drawOptions(me, ws, v.id, 1);
    expect(v.scenes[1].options).toHaveLength(2);
    expect(v.charges.at(-1)?.stage).toBe("options");
    expect(v.charges.filter((c) => c.stage === "options")).toHaveLength(1);
    expect(v.scenes[1].imageFileId).toBe(old);
    const pick = v.scenes[1].options![1];
    expect(await studio.file(me, ws, v.id, pick)).not.toBeNull();
    v = await studio.pickOption(me, ws, v.id, 1, 1);
    expect(v.scenes[1]).toMatchObject({ imageFileId: pick, options: null });
    // The old picture is still the video's: undo can bring it back.
    expect(await studio.file(me, ws, v.id, old!)).not.toBeNull();
    v = await studio.undo(me, ws, v.id);
    expect(v.scenes[1].imageFileId).toBe(old);
    await studio.lockScene(me, ws, v.id, 1, true);
    await expect(studio.drawOptions(me, ws, v.id, 1)).rejects.toThrow("locked");
    await expect(studio.pickOption(me, ws, v.id, 0, 0)).rejects.toThrow("no pictures to pick");
  });
});

describe("making the video", () => {
  it("records each scene's voice once and uses it again when only other scenes changed", async () => {
    const { studio, media, me, ws } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES, brief: brief() });
    v = await studio.storyboard(me, ws, v.id);
    expect(studio.price(v, "video")).toEqual({ credits: 0, free: true });
    v = await studio.render(me, ws, v.id, "warm");
    const speech = () => media.calls.filter((c) => c.startsWith("speech")).length;
    expect(speech()).toBe(3);
    expect(v.scenes.every((s) => s.voiceClip?.key === voiceKey("warm", s.spoken))).toBe(true);
    v = await studio.render(me, ws, v.id, "warm");
    expect(speech()).toBe(3);
    v = await studio.editScene(me, ws, v.id, 2, { spoken: "Day three, into the oven." });
    v = await studio.render(me, ws, v.id, "warm");
    expect(speech()).toBe(4);
    // Another voice records every scene again.
    await studio.render(me, ws, v.id, "calm");
    expect(speech()).toBe(7);
  });

  it("writes the real steps as it goes, refuses a second making at the same time, and ends with captions and the end card", async () => {
    const { studio, me, ws, store, finished } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES, brief: brief() });
    v = await studio.storyboard(me, ws, v.id);
    const steps: string[] = [];
    const update = store.videos.update.bind(store.videos);
    store.videos.update = async (row: VideoProject) => {
      if (row.progress && steps.at(-1) !== row.progress.step) steps.push(row.progress.step);
      return update(row);
    };
    const started = await studio.beginRender(me, ws, v.id, { voice: "bright", brand: { name: "Crumb and Co", colors: ["#1B1F3B", "#E0A458"], logo: null } });
    expect(started.video.progress?.step).toBe("voice");
    await expect(studio.beginRender(me, ws, v.id)).rejects.toThrow("being made right now");
    v = await started.done;
    expect(steps).toEqual(["voice", "scenes", "captions", "done"]);
    expect(v.stage).toBe("done");
    expect(finished.at(-1)?.captions).toEqual({ look: "bold", position: "bottom", highlight: "#E0A458" });
    expect(finished.at(-1)?.card?.seconds).toBe(2.5);
    expect(v.video?.seconds).toBe(Math.round(3 + 3 + 6 + 2.5));
  });

  it("leaves the captions and the card out when they are off", async () => {
    const { studio, media, me, ws, finished } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES, brief: brief({ captions: { on: false, look: "clean", position: "bottom" }, brand: false }) });
    v = await studio.storyboard(me, ws, v.id);
    v = await studio.render(me, ws, v.id, "none", { name: "X", colors: [], logo: null });
    expect(finished).toEqual([]);
    expect(media.calls.filter((c) => c.startsWith("speech"))).toEqual([]);
    expect(v.voice).toBe("none");
  });

  it("marks a failed making and refunds it, so it can be made again", async () => {
    const media = fakeVideoMedia();
    const { studio, me, ws } = await setup({ media: { ...media, cut: async () => Promise.reject(new Error("disk full")) } });
    let v = await studio.create(me, ws, { scenes: SCENES, brief: brief() });
    v = await studio.storyboard(me, ws, v.id);
    await expect(studio.render(me, ws, v.id, "warm")).rejects.toThrow("disk full");
    v = await studio.get(me, ws, v.id);
    expect(v.progress).toMatchObject({ step: "failed" });
    expect(v.charges.at(-1)).toMatchObject({ stage: "video", charged: 0 });
    // The voice made before the failure is kept.
    expect(v.scenes.every((s) => s.voiceClip)).toBe(true);
  });
});

describe("old videos", () => {
  it("opens a version 1 video and makes it in its old look", async () => {
    const { studio, store, media, files, me, ws, finished } = await setup();
    const img = await files.put(ws, { name: "a.png", mimeType: "image/png", bytes: new Uint8Array([1]) });
    const at = new Date().toISOString();
    const old = {
      id: "vid_old",
      workspaceId: ws,
      createdBy: me.userId,
      createdAt: at,
      updatedAt: at,
      title: "Old one",
      fromRunId: null,
      brief: { idea: "Old one", kind: "teaser", customKind: "", vibe: "bold", seconds: 15, aspect: "1:1" },
      scenes: [{ spoken: "Something is coming.", onScreen: "A dark door", text: "Soon", seconds: 4, imageFileId: img.id }],
      stage: "done",
      voice: "warm",
      video: null,
      charges: [],
    } as unknown as VideoProject;
    await store.videos.insert(old);
    const v = await studio.get(me, ws, "vid_old");
    expect(v.brief).toMatchObject({ type: "teaser", style: "hyperrealistic", aspect: "1:1", captions: { on: false } });
    expect(v.scenes[0].id).toBeTruthy();
    // The ids are written back once, so they stay put.
    expect((await studio.get(me, ws, "vid_old")).scenes[0].id).toBe(v.scenes[0].id);
    const made = await studio.render(me, ws, "vid_old");
    expect(made.stage).toBe("done");
    expect(media.calls.filter((c) => c.startsWith("cut")).at(-1)).toBe("cut:1:1 voiced:1:1");
    // No captions (a teaser had none) but the brand card is on by default only with a brand.
    expect(finished).toEqual([]);
    expect((await studio.list(me, ws)).map((x) => x.id)).toContain("vid_old");
  });

  it("reads a version 1 minimal motion brief as Motion graphics with no captions", () => {
    const b = normalizeBrief({ idea: "x", kind: "minimal", customKind: "", vibe: "calm", seconds: 15, aspect: "16:9" })!;
    expect(b).toMatchObject({ style: "motion", type: "explainer", voice: "calm", captions: { on: false } });
    expect(normalizeBrief(null)).toBeNull();
    expect(normalizeBrief({ idea: "y", reference: { kind: "infographic", vibe: "fun", pace: 3, style: "Flat" } })!.reference?.look).toBe("2d");
  });
});

describe("the post pack", () => {
  const spec = (id: string) => LAUNCH_AGENTS.find((a) => a.id === id) as unknown as Pick<AgentBody, "inputs">;

  it("sends inputs the Caption Writer and the Hashtag Optimizer accept", async () => {
    const { studio, me, ws } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES, brief: brief({ aspect: "16:9" }) });
    v = await studio.storyboard(me, ws, v.id);
    v = await studio.render(me, ws, v.id, "warm");
    const input = packInputs(v, { brandBrainId: "brn_1", quoted: { captions: 3, hashtags: 1 } });
    expect(input.captions).toMatchObject({ agentId: PACK_AGENTS.captions, brandBrainId: "brn_1", quotedCredits: 3 });
    expect(input.hashtags).toMatchObject({ agentId: PACK_AGENTS.hashtags, quotedCredits: 1, inputs: { platform: "shorts" } });
    expect(validateRunInputs(spec("caption-writer"), input.captions.inputs)).toMatchObject({ ok: true });
    expect(validateRunInputs(spec("hashtag-picker"), input.hashtags.inputs)).toMatchObject({ ok: true });
    expect(String(input.captions.inputs.post)).toContain("Day two, the butter goes in.");
    expect(packPlatform("9:16")).toBe("tiktok");
  });

  it("starts both runs through the app API and keeps their ids on the video", async () => {
    const { studio, me, ws } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES, brief: brief() });
    v = await studio.storyboard(me, ws, v.id);
    const started: string[] = [];
    const api = { startRun: async (_c: unknown, _w: string, i: { agentId: string }) => (started.push(i.agentId), { id: `run_${i.agentId}` }) };
    await expect(startPostPack(api, me, ws, v, { brandBrainId: null })).rejects.toThrow("Make the video first");
    v = await studio.render(me, ws, v.id, "warm");
    const r = await startPostPack(api, me, ws, v, { brandBrainId: null });
    expect(started).toEqual(["caption-writer", "hashtag-picker"]);
    v = await studio.setPack(me, ws, v.id, r);
    expect(v.pack).toMatchObject({ captionRunId: "run_caption-writer", hashtagRunId: "run_hashtag-picker", platform: "tiktok" });
    const half = await startPostPack({ startRun: async (_c, _w, i) => (i.agentId === "hashtag-picker" ? Promise.reject(new Error("Not enough credits.")) : { id: "run_c" }) }, me, ws, v, { brandBrainId: null });
    expect(half).toMatchObject({ captionRunId: "run_c", hashtagRunId: null, error: "Not enough credits." });
  });
});

describe("the plan's length", () => {
  it("asks once more when the script is far over its word budget, and keeps the shorter one", async () => {
    const { modelPlanner } = await import("./planner");
    const long = JSON.stringify({ scenes: Array.from({ length: 4 }, () => ({ spoken: "one two three four five six seven eight nine ten eleven twelve", shows: "x", text: "", seconds: 4 })) });
    const short = JSON.stringify({ scenes: Array.from({ length: 4 }, () => ({ spoken: "one two three four five six", shows: "x", text: "", seconds: 4 })) });
    const seen: string[] = [];
    const answers = [long, short];
    const planner = modelPlanner({ id: "fake", complete: async (req) => (seen.push(req.messages.at(-1)!.content), { text: answers.shift()!, tokensIn: 10, tokensOut: 10, costMicroUsd: 100 }) });
    const r = await planner(brief({ seconds: 15 }), "", AbortSignal.timeout(1000));
    expect(r.scenes[0].spoken).toBe("one two three four five six");
    expect(seen[1]).toContain("48 spoken words");
    expect(r.costMicroUsd).toBe(200);
  });
});
