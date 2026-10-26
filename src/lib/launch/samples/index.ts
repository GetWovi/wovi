import { CAPTION_WRITER_SAMPLES } from "./caption-writer";
import { HASHTAG_OPTIMIZER_SAMPLES } from "./hashtag-optimizer";
import { HOOK_WRITER_SAMPLES } from "./hook-writer";
import { IDEA_GENERATOR_SAMPLES } from "./idea-generator";
import { PLATFORM_REPURPOSER_SAMPLES } from "./platform-repurposer";
import { SCRIPT_WRITER_SAMPLES } from "./script-writer";
import { TREND_SCOUT_SAMPLES } from "./trend-scout";
import type { LaunchSample } from "./types";

export type { LaunchSample } from "./types";

/** Golden and bad samples per launch agent id. */
export const LAUNCH_SAMPLES: Record<string, LaunchSample[]> = {
  "trend-scout": TREND_SCOUT_SAMPLES,
  "idea-generator": IDEA_GENERATOR_SAMPLES,
  "hook-writer": HOOK_WRITER_SAMPLES,
  "script-writer": SCRIPT_WRITER_SAMPLES,
  "caption-writer": CAPTION_WRITER_SAMPLES,
  "hashtag-picker": HASHTAG_OPTIMIZER_SAMPLES,
  repurposer: PLATFORM_REPURPOSER_SAMPLES,
};

/**
 * Inputs in which a sample carries its own business's facts: what is coming
 * up, facts to include, what it can film, where it is, lines that must stay.
 * "Fill with an example" copies them only onto the sample's own Brand Brain.
 */
export const SAMPLE_FACT_INPUTS: Record<string, readonly string[]> = {
  "idea-generator": ["coming_up"],
  "script-writer": ["footage"],
  "caption-writer": ["details"],
  "hashtag-picker": ["location"],
  repurposer: ["keep"],
};
