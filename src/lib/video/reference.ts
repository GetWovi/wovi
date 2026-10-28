/**
 * SERVER ONLY. "Make it like this": the person drops a reference video and
 * WOVI reads its style, so their video follows it. Six frames spread over the
 * clip go to the catalog's `text-standard` route (it reads images) with a
 * strict question; the answer is the closest style, the mood, three colours,
 * the pace and one or two sentences on the look. The reference is never
 * copied: only its style is described, and the frames are not kept.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findModelRoute } from "@/lib/agents/catalog";
import { ffmpegMedia } from "@/lib/clips/media";
import { OPENROUTER_BASE_URL } from "@/lib/runs/providers/openrouter";
import { VideoError } from "./studio";
import type { Reference } from "./planner";
import { STYLES } from "./styles";

export const REFERENCE_ESTIMATE_MICRO_USD = 40_000;
const FRAMES = 6;

const RULES = [
  "You describe the visual style of a short social video from a few of its frames, so a new video can follow the same style. Never describe or copy its words, people, logos or brand.",
  `Answer with one JSON object and nothing else: {"look":"${STYLES.map((s) => s.value).join("|")}","vibe":"fun|calm|bold|premium","bg":"#rrggbb","fg":"#rrggbb","accent":"#rrggbb","pace":4,"style":"..."}`,
  "look: motion for line drawings and simple shapes on a plain background with small text; 2d for flat illustration; 3d for 3D animation; realistic for everyday photos or phone footage; hyperrealistic for cinematic, dramatic footage; comic for ink lines and panels; pixel for pixel art.",
  "bg, fg and accent: the main background colour, the main line and text colour, and the highlight colour, as hex.",
  "pace: about how many seconds each scene lasts, a whole number from 2 to 8.",
  "style: one or two plain sentences on the look a picture maker can follow: medium, colours, light, framing, texture, how text sits on screen. No names.",
].join("\n");

const HEX = /^#[0-9a-f]{6}$/i;

/** The model's answer, read strictly; anything missing falls back to a safe default. */
export function parseReference(text: string): Reference | null {
  const body = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!body) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(body);
  } catch {
    return null;
  }
  const vibes = ["fun", "calm", "bold", "premium"];
  const style = typeof v.style === "string" ? v.style.trim().slice(0, 400) : "";
  if (!style) return null;
  return {
    look: STYLES.some((s) => s.value === v.look) ? (v.look as Reference["look"]) : "realistic",
    vibe: (vibes.includes(v.vibe as string) ? v.vibe : "calm") as Reference["vibe"],
    bg: HEX.test(String(v.bg)) ? String(v.bg) : undefined,
    fg: HEX.test(String(v.fg)) ? String(v.fg) : undefined,
    accent: HEX.test(String(v.accent)) ? String(v.accent) : undefined,
    pace: Math.max(2, Math.min(8, Math.round(Number(v.pace) || 4))),
    style,
  };
}

/** Reads a reference clip's style. Throws VideoError with a plain message when the clip or the answer cannot be read. */
export async function readReference(clip: Uint8Array, apiKey: string, signal: AbortSignal): Promise<{ reference: Reference; costMicroUsd: number }> {
  const dir = mkdtempSync(join(tmpdir(), "wovi-ref-"));
  try {
    writeFileSync(join(dir, "in"), clip);
    const media = ffmpegMedia();
    const probe = await media.probe(join(dir, "in")).catch(() => null);
    if (!probe || !probe.width) throw new VideoError("invalid_request", "That video could not be read. Send an MP4 or MOV.");
    if (probe.durationSec > 180) throw new VideoError("invalid_request", "A reference can be at most three minutes.");
    const images: string[] = [];
    for (let i = 0; i < FRAMES; i++) {
      const at = (probe.durationSec * (i + 0.5)) / FRAMES;
      await media.frame(join(dir, "in"), at, join(dir, `f${i}.jpg`), 640);
      images.push(`data:image/jpeg;base64,${readFileSync(join(dir, `f${i}.jpg`)).toString("base64")}`);
    }
    const route = findModelRoute("text-standard");
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "WOVI" },
      body: JSON.stringify({
        model: route?.model ?? "anthropic/claude-sonnet-5.5",
        temperature: 0,
        max_tokens: 600,
        usage: { include: true },
        messages: [
          { role: "system", content: RULES },
          { role: "user", content: [{ type: "text", text: `Frames of the reference video (${Math.round(probe.durationSec)} seconds), in order.` }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] },
        ],
      }),
    });
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number }; error?: { message?: string } } | null;
    const cost = typeof body?.usage?.cost === "number" ? Math.round(body.usage.cost * 1_000_000) : REFERENCE_ESTIMATE_MICRO_USD;
    if (!res.ok || body?.error) throw new VideoError("media", `The reference could not be read: ${body?.error?.message ?? res.statusText}`);
    const reference = parseReference(body?.choices?.[0]?.message?.content ?? "");
    if (!reference) throw new VideoError("media", "The reference could not be read. Try another clip, or go on without one.");
    return { reference, costMicroUsd: cost };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
