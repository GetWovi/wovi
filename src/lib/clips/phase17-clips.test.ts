/**
 * Clip samples on a data dir written before them (the phase 17 fixture,
 * src/test-fixtures/phase17-data, with Funkai's builder account and the launch
 * set). Reading changes no file, the library starts empty, clips.json only
 * appears on the first upload, every existing sample reads as it did, and a
 * clip given to all seven launch agents leaves their earlier samples alone.
 * The test works on a copy; ffmpeg and the model are faked.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localAccounts } from "@/lib/accounts/local";
import { localBuilder } from "@/lib/builder/local";
import { jsonFileBuilderStore } from "@/lib/builder/store";
import { localEngine } from "@/lib/runs/engine";
import { localClipLibrary, localClipQueue } from "./local";
import { clipConfigFromEnv } from "./config";
import { fakeClipProvider } from "./provider";
import { chunks, fakeMedia, fakeMp4 } from "./test-helpers";

const FIXTURE = join(__dirname, "..", "..", "test-fixtures", "phase17-data");
const FUNKAI = "usr_funkai0000000000";
const ENV = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
const LAUNCH = ["trend-scout", "idea-generator", "hook-writer", "script-writer", "caption-writer", "hashtag-picker", "repurposer"];

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), "wovi-clips17-"));
  cpSync(FIXTURE, dir, { recursive: true });
  dirs.push(dir);
  return dir;
}
function hashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[p.slice(dir.length)] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

function open(dir: string) {
  const accounts = localAccounts(dir, ENV);
  const engine = localEngine({ dataDir: dir, fake: true });
  const builder = localBuilder(accounts, dir, engine);
  const media = fakeMedia();
  const provider = fakeClipProvider({
    costMicroUsd: 90,
    transcript: () => ({ text: "Gerald the starter turned nine today. He still rises before we do. Here is how we feed him every night.", segments: [{ start: 0, end: 3, text: "Gerald the starter turned nine today." }], language: "en" }),
    frames: () => ({ onScreenText: ["Gerald turns 9"], description: "A jar of sourdough starter bubbles next to the oven while a baker feeds it flour and water.", platformHint: "reels" }),
  });
  const queue = localClipQueue(dir, { media, provider, config: clipConfigFromEnv(ENV) });
  const library = localClipLibrary(builder, dir, queue, media);
  return { accounts, builder, queue, library, me: { kind: "user" as const, userId: FUNKAI } };
}

describe("clip samples on a phase 17 data dir", () => {
  it("reads it unchanged: an empty library, every sample as it was, no file written", async () => {
    const dir = copy();
    const before = hashes(dir);
    const { builder, library, queue, me } = open(dir);
    expect(await library.list(me)).toEqual([]);
    expect(await library.totals(me)).toMatchObject({ spentTodayMicroUsd: 0, totalMicroUsd: 0, counts: { ready: 0, uploaded: 0 } });
    await queue.recover();
    expect(await queue.tick()).toEqual([]);
    // Every existing sample reads, none has a clip, and the agent screens' calls work.
    let n = 0;
    for (const id of LAUNCH) {
      for (const s of await builder.listSamples(me, id)) {
        expect(s.clip).toBeUndefined();
        expect(s.updatedAt).toBeUndefined();
        n++;
      }
      expect(await builder.getAgent(me, id)).not.toBeNull();
    }
    expect(n).toBeGreaterThanOrEqual(35);
    // A mood board image from before still serves.
    const board = await builder.listBoard(me, "script-writer");
    for (const item of board.filter((b) => b.file)) expect(await builder.getFile(me, item.file!.id)).not.toBeNull();
    expect(hashes(dir)).toEqual(before);
    expect(existsSync(join(dir, "clips.json"))).toBe(false);
  });

  it("takes a clip and gives it to all seven launch agents, leaving every earlier record alone", async () => {
    const dir = copy();
    const { builder, library, queue, me } = open(dir);
    const samplesBefore = (await jsonFileBuilderStore(join(dir, "builder.json")).samples.find()).map((s) => JSON.stringify(s)).sort();
    const otherFiles = Object.entries(hashes(dir)).filter(([p]) => !p.startsWith("/builder.json") && !p.startsWith("/files/ws_wovi"));

    const clip = await library.upload(me, { name: "gerald-turns-nine.mp4", mimeType: "video/mp4", sizeBytes: 2000, stream: chunks(fakeMp4({ len: 21 })), rights: true });
    for (let i = 0; i < 5; i++) {
      await queue.tick();
      await queue.idle();
    }
    expect((await library.get(me, clip.id))!.clip.status).toBe("ready");
    const r = await library.assign(me, clip.id, LAUNCH);
    expect(r.problems).toEqual([]);
    expect(r.added).toEqual(LAUNCH);
    for (const id of LAUNCH) expect((await builder.listSamples(me, id)).filter((s) => s.clip?.id === clip.id)).toHaveLength(1);

    // The samples from before are byte for byte the same; only the seven new ones were added.
    const after = (await jsonFileBuilderStore(join(dir, "builder.json")).samples.find()).filter((s) => !s.clip).map((s) => JSON.stringify(s)).sort();
    expect(after).toEqual(samplesBefore);
    // No other data file changed; clips.json and safety.json are new.
    const now = hashes(dir);
    for (const [p, h] of otherFiles) expect(now[p], p).toBe(h);
    expect(existsSync(join(dir, "clips.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "safety.json"), "utf8")).rights).toEqual([expect.objectContaining({ subject: "clip_sample", userId: FUNKAI, fileId: clip.file.id })]);

    // A restart reads the same state back.
    const again = open(dir);
    expect((await again.library.list(again.me)).map((c) => [c.id, c.status, c.assignments.length])).toEqual([[clip.id, "ready", 7]]);
  });
});
