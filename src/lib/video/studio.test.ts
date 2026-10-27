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
