/**
 * Golden samples are written as typed outputs, so tests can parse them with
 * the engine's own parser and run the guardrails on them. The builder stores
 * a sample's ideal output as text, so this turns a typed output into the
 * readable text the bench shows beside each run.
 */
import type { RunOutput } from "@/lib/runs/output";

const PLATFORM_NAMES: Record<string, string> = { x: "X", tiktok: "TikTok", shorts: "YouTube Shorts", reels: "Instagram Reels" };

const label = (key: string) => {
  const words = key.replace(/_/g, " ");
  return words[0].toUpperCase() + words.slice(1);
};

/** One item per line for plain lists; labelled blocks for items with fields, sections and platforms. */
export function formatOutput(output: RunOutput): string {
  switch (output.kind) {
    case "text":
      return output.text;
    case "list":
      return output.items
        .map((it) => (typeof it === "string" ? it : Object.entries(it).map(([k, v]) => `${label(k)}: ${v}`).join("\n")))
        .join(output.items.some((it) => typeof it !== "string") ? "\n\n" : "\n");
    case "script":
      return output.sections.map((s) => `${label(s.section)} (${s.seconds} s)\nSay: ${s.spoken}\nOn screen: ${s.on_screen}`).join("\n\n");
    case "caption_set":
      return output.captions
        .map((c) => {
          const name = PLATFORM_NAMES[c.platform] ?? c.platform;
          return c.variants.length === 1 ? `${name}\n${c.variants[0]}` : `${name}\n${c.variants.map((v, i) => `${i + 1}. ${v}`).join("\n")}`;
        })
        .join("\n\n");
    case "post_set":
      return output.posts.map((p) => `${label(p.format)}\n${p.parts.join("\n")}`).join("\n\n");
  }
}
