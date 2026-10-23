/**
 * The bundled ffmpeg (@ffmpeg-installer/ffmpeg) on this machine: makes a
 * two-second vertical clip with a tone, then reads its length, takes out the
 * sound and a frame, the way the queue does. No model is called.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ffmpegMedia, ffmpegPath, MediaError } from "./media";

const dir = mkdtempSync(join(tmpdir(), "wovi-ffmpeg-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("ffmpeg from npm", () => {
  it("is found without a system ffmpeg", () => {
    expect(ffmpegPath({} as NodeJS.ProcessEnv)).toMatch(/@ffmpeg-installer/);
    expect(ffmpegPath({ WOVI_FFMPEG_PATH: "/opt/ffmpeg" } as unknown as NodeJS.ProcessEnv)).toBe("/opt/ffmpeg");
  });

  it("reads a real clip: length, portrait size, sound, an MP3 and a frame", async () => {
    const clip = join(dir, "tone.mp4");
    const made = spawnSync(ffmpegPath(), ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=25:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
    expect(made.status, made.stderr?.toString()).toBe(0);
    const media = ffmpegMedia();
    const probe = await media.probe(clip);
    expect(probe.width).toBe(360);
    expect(probe.height).toBe(640);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSec).toBeGreaterThan(1.8);
    expect(probe.durationSec).toBeLessThan(2.3);

    await media.audio(clip, join(dir, "a.mp3"));
    expect(statSync(join(dir, "a.mp3")).size).toBeGreaterThan(1000);
    await media.frame(clip, 1.9, join(dir, "f.jpg"), 320);
    expect(existsSync(join(dir, "f.jpg"))).toBe(true);
    // Past the end falls back to an earlier frame instead of failing.
    await media.frame(clip, 5, join(dir, "late.jpg"), 320);
    expect(existsSync(join(dir, "late.jpg"))).toBe(true);

    await expect(media.probe(join(dir, "a.mp3"))).rejects.toBeInstanceOf(MediaError);
  });
});
