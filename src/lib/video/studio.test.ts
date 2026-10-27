import { describe, expect, it } from "vitest";
import { testAccounts } from "@/lib/accounts/test-helpers";
import { memoryFileStorage } from "@/lib/builder/storage";
import type { RunCredits } from "@/lib/credits/types";
import { BillingRefusal } from "@/lib/runs/billing";
import { fakeVideoMedia } from "./media";
import { VideoStudio, imagePrompt, memoryVideoStore, scenesFromText, videoAccess, type VideoBilling } from "./studio";

async function setup(opts: { failImage?: boolean; billing?: VideoBilling | null } = {}) {
  const t = testAccounts();
  const ada = (await t.signUp("ada@example.com")).user;
  const eve = (await t.signUp("eve@example.com")).user;
  const me = { kind: "user" as const, userId: ada.id };
  const ws = await t.accounts.workspaces.create(me, "Team");
  const media = fakeVideoMedia({ failImage: opts.failImage });
  const files = memoryFileStorage();
  const studio = new VideoStudio({ accounts: t.accounts, store: memoryVideoStore(), files, media, billing: opts.billing ?? null });
  return { studio, media, files, me, eve: { kind: "user" as const, userId: eve.id }, ws: ws.id };
}

const SCENES = [
  { spoken: "Every croissant on this counter started three days ago.", onScreen: "A tray of croissants", seconds: 3 },
  { spoken: "Day one is just the dough.", onScreen: "Hands mixing dough", seconds: 4 },
];

describe("Make a video", () => {
  it("turns a pasted script into scenes, one per paragraph, at most 8", () => {
    expect(scenesFromText("First line.\n\nSecond line here.").map((s) => s.spoken)).toEqual(["First line.", "Second line here."]);
    expect(scenesFromText("One\nTwo\nThree")).toHaveLength(3);
    expect(scenesFromText(Array.from({ length: 20 }, (_, i) => `Line ${i}`).join("\n\n")).length).toBeLessThanOrEqual(8);
    expect(scenesFromText("   ")).toEqual([]);
  });

  it("runs the four stages in order: script, storyboard, approve, video", async () => {
    const { studio, media, me, ws } = await setup();
    let v = await studio.create(me, ws, { scenes: SCENES });
    expect(v.stage).toBe("script");
    await expect(studio.render(me, ws, v.id, "warm")).rejects.toThrow("Every scene needs its picture first.");
    v = await studio.storyboard(me, ws, v.id, "warm bakery");
    expect(v.stage).toBe("storyboard");
    expect(v.scenes.every((s) => s.imageFileId)).toBe(true);
    v = await studio.editScene(me, ws, v.id, 1, { spoken: "Day one is only the dough." });
    v = await studio.redraw(me, ws, v.id, 1);
    v = await studio.render(me, ws, v.id, "calm");
    expect(v.stage).toBe("done");
    expect(v.video).toMatchObject({ voice: "calm" });
    expect(media.calls.filter((c) => c.startsWith("image"))).toHaveLength(3);
    expect(media.calls.filter((c) => c.startsWith("speech:calm"))).toHaveLength(2);
    expect(media.calls.at(-1)).toBe("cut:2:2 voiced");
    expect(v.charges.map((c) => c.stage)).toEqual(["storyboard", "redraw", "video"]);
  });

  it("keeps every video and file inside its workspace", async () => {
    const { studio, me, eve, ws } = await setup();
    const v = await studio.storyboard(me, ws, (await studio.create(me, ws, { script: "Hello there." })).id);
    await expect(studio.get(eve, ws, v.id)).rejects.toThrow();
    await expect(studio.file(me, ws, v.id, "fil_00000000000000000000")).rejects.toThrow("No such file.");
    expect(await studio.file(me, ws, v.id, v.scenes[0].imageFileId!)).not.toBeNull();
  });

  it("says which pictures failed and charges nothing when none were made", async () => {
    const { studio, me, ws } = await setup({ failImage: true });
    const v = await studio.create(me, ws, { scenes: SCENES });
    await expect(studio.storyboard(me, ws, v.id)).rejects.toThrow("Nothing was charged.");
    expect((await studio.get(me, ws, v.id)).stage).toBe("script");
  });

  it("holds credits before a stage, settles to the real cost, and refuses without enough", async () => {
    const settled: { done: boolean; costMicroUsd: number }[] = [];
    const billing: VideoBilling = {
      estimateJob: (typical) => Math.ceil(typical / 10_000),
      reserveJob: async ({ estimate }) => ({ mode: "own", holdId: "h1", estimate }) as unknown as RunCredits,
      settleJob: async (_ws, c, r) => (settled.push(r), { ...c, charged: r.done ? 9 : 0 }) as RunCredits,
    };
    const { studio, me, ws } = await setup({ billing });
    const v = await studio.create(me, ws, { scenes: SCENES });
    expect(studio.price(v, "storyboard")).toEqual({ credits: 9, free: false });
    const drawn = await studio.storyboard(me, ws, v.id);
    expect(settled[0]).toEqual({ done: true, costMicroUsd: 80_000 });
    expect(drawn.charges[0]).toMatchObject({ stage: "storyboard", estimate: 9, charged: 9 });
    const broke = await setup({ billing: { ...billing, reserveJob: async () => Promise.reject(new BillingRefusal("not_enough_credits", "Top up first.")) } });
    const w = await broke.studio.create(broke.me, broke.ws, { scenes: SCENES });
    await expect(broke.studio.storyboard(broke.me, broke.ws, w.id)).rejects.toThrow("This step needs up to");
  });

  it("asks for pictures with no text and no real people, in the brand's look", () => {
    const p = imagePrompt({ spoken: "Hi", onScreen: "A tray of croissants" }, "warm wood");
    expect(p).toContain("9:16");
    expect(p).toContain("A tray of croissants");
    expect(p).toContain("warm wood");
    expect(p).toContain("No text");
    expect(p).toContain("No real or famous person");
  });

  it("is for builders unless WOVI_VIDEO says otherwise", () => {
    expect(videoAccess({})).toBe("builders");
    expect(videoAccess({ WOVI_VIDEO: "on" })).toBe("on");
    expect(videoAccess({ WOVI_VIDEO: "OFF" })).toBe("off");
  });
});

describe("subtitles", () => {
  it("splits the words into short lines that fit the width", async () => {
    const { subtitleChunks } = await import("./media");
    expect(subtitleChunks("Every croissant on this counter started three days ago.")).toEqual(["Every croissant on", "this counter started", "three days ago."]);
    expect(subtitleChunks("")).toEqual([]);
    expect(subtitleChunks("Supercalifragilisticexpialidocious word")).toEqual(["Supercalifragilisticexpialidocious", "word"]);
  });
});

describe("the guided start", () => {
  it("reads a plan strictly and spreads the length over the scenes", async () => {
    const { parsePlan } = await import("./planner");
    const plan = parsePlan('Here: {"scenes":[{"spoken":"Hi there.","shows":"A shop door","text":"Open now","seconds":5},{"spoken":"Come in.","shows":"A counter","text":"","seconds":5}]}', 30);
    expect(plan).toEqual([
      { spoken: "Hi there.", onScreen: "A shop door", text: "Open now", seconds: 15 },
      { spoken: "Come in.", onScreen: "A counter", text: "", seconds: 15 },
    ]);
    expect(parsePlan("no json", 30)).toBeNull();
    expect(parsePlan('{"scenes":[]}', 30)).toBeNull();
  });

  it("gives every kind its own look, voice and cut", async () => {
    const { styleFor } = await import("./planner");
    expect(styleFor({ kind: "infographic", customKind: "", vibe: "fun" })).toMatchObject({ motion: "lively", headline: true, subtitles: true, voice: "bright" });
    expect(styleFor({ kind: "realistic", customKind: "", vibe: "calm" })).toMatchObject({ motion: "slow", headline: false, voice: "calm" });
    expect(styleFor({ kind: "teaser", customKind: "", vibe: "bold" })).toMatchObject({ motion: "punchy", subtitles: false });
    expect(styleFor({ kind: "custom", customKind: "claymation", vibe: "premium" }).picture).toContain("claymation");
  });

  it("plans from an idea, then draws scene by scene without losing a picture, then cuts in the format asked", async () => {
    const { fakePlanner } = await import("./planner");
    const t = testAccounts();
    const ada = (await t.signUp("ada@example.com")).user;
    const me = { kind: "user" as const, userId: ada.id };
    const ws = (await t.accounts.workspaces.create(me, "Team")).id;
    const media = fakeVideoMedia();
    const studio = new VideoStudio({ accounts: t.accounts, store: memoryVideoStore(), files: memoryFileStorage(), media, planner: fakePlanner() });
    const brief = { idea: "Our new chilli oil", kind: "infographic" as const, customKind: "", vibe: "bold" as const, seconds: 15 as const, aspect: "1:1" as const };
    let v = await studio.plan(me, ws, brief);
    expect(v.scenes).toHaveLength(4);
    expect(v.brief).toMatchObject({ aspect: "1:1" });
    expect(v.voice).toBe("warm");
    expect(v.charges[0].stage).toBe("plan");
    // All four at once, as the screen asks for them: none may undo another.
    await Promise.all(v.scenes.map((_, i) => studio.drawScene(me, ws, v.id, i)));
    v = await studio.get(me, ws, v.id);
    expect(v.scenes.every((s) => s.imageFileId)).toBe(true);
    expect(v.stage).toBe("storyboard");
    v = await studio.addScene(me, ws, v.id, 0);
    expect(v.scenes).toHaveLength(5);
    expect(v.stage).toBe("script");
    v = await studio.removeScene(me, ws, v.id, 1);
    expect(v.stage).toBe("storyboard");
    v = await studio.render(me, ws, v.id, "warm");
    expect(media.calls.at(-1)).toBe("cut:4:4 voiced:1:1");
    await expect(studio.plan(me, ws, { ...brief, idea: "x" })).rejects.toThrow("Write your idea");
  });
});

describe("the voice check", () => {
  it("refuses a clip that is far longer than its words take to say", async () => {
    const { maxSpeechSeconds } = await import("./studio");
    // "Why do our croissants take three whole days? Let's unfold it." is 11 words: about 4 seconds, at most 8.9.
    expect(maxSpeechSeconds("Why do our croissants take three whole days? Let's unfold it.")).toBeCloseTo(8.875);
    const t = testAccounts();
    const ada = (await t.signUp("ada@example.com")).user;
    const me = { kind: "user" as const, userId: ada.id };
    const ws = (await t.accounts.workspaces.create(me, "Team")).id;
    const media = { ...fakeVideoMedia(), duration: async () => 30 };
    const studio = new VideoStudio({ accounts: t.accounts, store: memoryVideoStore(), files: memoryFileStorage(), media });
    let v = await studio.create(me, ws, { scenes: SCENES });
    v = await studio.storyboard(me, ws, v.id);
    await expect(studio.render(me, ws, v.id, "warm")).rejects.toThrow("did not read the words as written");
  });
});

describe("minimal motion", () => {
  it("plans top and bottom lines with a shape, needs no pictures, and animates instead of cutting", async () => {
    const { fakePlanner, parsePlan } = await import("./planner");
    const plan = parsePlan('{"scenes":[{"top":"if you do not plan","bottom":"you will be planned","shape":"orbit","spoken":"If you do not plan, you will be planned.","seconds":4},{"top":"x","bottom":"y","shape":"hexagon","seconds":3}]}', 15);
    expect(plan?.[0]).toMatchObject({ text: "if you do not plan", bottom: "you will be planned", shape: "orbit" });
    expect(plan?.[1].shape).toBe("circle");
    const t = testAccounts();
    const ada = (await t.signUp("ada@example.com")).user;
    const me = { kind: "user" as const, userId: ada.id };
    const ws = (await t.accounts.workspaces.create(me, "Team")).id;
    const media = fakeVideoMedia();
    const animated: { scenes: number; voiced: number; width: number }[] = [];
    const studio = new VideoStudio({
      accounts: t.accounts,
      store: memoryVideoStore(),
      files: memoryFileStorage(),
      media,
      planner: fakePlanner(),
      animate: async (scenes, look) => (animated.push({ scenes: scenes.length, voiced: scenes.filter((s) => s.audio).length, width: look.width }), new Uint8Array([0, 0, 0, 0x18])),
    });
    let v = await studio.plan(me, ws, { idea: "Plan your week", kind: "minimal", customKind: "", vibe: "calm", seconds: 15, aspect: "16:9" });
    expect(v.stage).toBe("storyboard");
    expect(v.scenes.every((s) => s.shape && s.text && !s.imageFileId)).toBe(true);
    v = await studio.editScene(me, ws, v.id, 0, { shape: "wave", bottom: "one step at a time" });
    expect(v.scenes[0]).toMatchObject({ shape: "wave", bottom: "one step at a time" });
    v = await studio.render(me, ws, v.id, "none");
    expect(v.stage).toBe("done");
    expect(animated).toEqual([{ scenes: 4, voiced: 0, width: 1920 }]);
    expect(media.calls.filter((c) => c.startsWith("image"))).toEqual([]);
  });

  it("draws every shape as an SVG frame with the words escaped", async () => {
    const { SHAPES, motionLook, sceneSvg } = await import("./motion");
    const look = motionLook("calm", "9:16");
    for (const shape of SHAPES) {
      const svg = sceneSvg({ top: "a <b> & c", bottom: "d", shape, seconds: 4 }, 0.7, look);
      expect(svg).toContain("a &lt;b&gt; &amp; c");
      expect(svg).not.toContain("NaN");
    }
  });
});

describe("own photos and clips", () => {
  it("uses the person's own clip instead of a drawn picture, and a redraw puts the AI picture back", async () => {
    const t = testAccounts();
    const ada = (await t.signUp("ada@example.com")).user;
    const me = { kind: "user" as const, userId: ada.id };
    const ws = (await t.accounts.workspaces.create(me, "Team")).id;
    const media = fakeVideoMedia();
    const seen: unknown[] = [];
    const studio = new VideoStudio({ accounts: t.accounts, store: memoryVideoStore(), files: memoryFileStorage(), media: { ...media, cut: async (scenes) => (seen.push(scenes.map((s) => Boolean(s.clip))), new Uint8Array([1])) } });
    let v = await studio.create(me, ws, { scenes: SCENES });
    v = await studio.useOwnMedia(me, ws, v.id, 0, { image: { name: "p.jpg", mimeType: "image/jpeg", bytes: new Uint8Array([1]) }, clip: { name: "c.mp4", mimeType: "video/mp4", bytes: new Uint8Array([2]) } });
    expect(v.scenes[0]).toMatchObject({ own: true });
    expect(v.scenes[0].clipFileId).toBeTruthy();
    expect(await studio.file(me, ws, v.id, v.scenes[0].clipFileId!)).not.toBeNull();
    v = await studio.useOwnMedia(me, ws, v.id, 1, { image: { name: "q.png", mimeType: "image/png", bytes: new Uint8Array([3]) } });
    expect(v.stage).toBe("storyboard");
    await studio.render(me, ws, v.id, "warm");
    expect(seen).toEqual([[true, false]]);
    v = await studio.drawScene(me, ws, v.id, 0);
    expect(v.scenes[0]).toMatchObject({ own: false, clipFileId: null });
  });
});

describe("make it like this", () => {
  it("reads a reference's style strictly, with safe fallbacks", async () => {
    const { parseReference } = await import("./reference");
    expect(parseReference('{"kind":"minimal","vibe":"calm","bg":"#000000","fg":"#FFFFFF","accent":"#ffaa00","pace":4,"style":"White line drawings on black."}')).toEqual({ kind: "minimal", vibe: "calm", bg: "#000000", fg: "#FFFFFF", accent: "#ffaa00", pace: 4, style: "White line drawings on black." });
    expect(parseReference('{"kind":"anime","vibe":"loud","bg":"black","pace":99,"style":"x"}')).toMatchObject({ kind: "custom", vibe: "calm", bg: undefined, pace: 8 });
    expect(parseReference('{"kind":"minimal"}')).toBeNull();
    const { styleFor } = await import("./planner");
    expect(styleFor({ kind: "realistic", customKind: "", vibe: "calm", reference: { kind: "realistic", vibe: "calm", pace: 3, style: "Grainy film look." } }).picture).toContain("Grainy film look.");
  });
});
