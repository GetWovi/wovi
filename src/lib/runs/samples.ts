/**
 * Example form values for each live launch agent. Used by `npm run agents:try`
 * and by the end-to-end tests.
 */
import type { Confirmations } from "./guardrails";

export type SampleRun = { inputs: Record<string, unknown>; confirmations?: Confirmations };

export const SAMPLE_RUNS: Record<string, SampleRun> = {
  "hook-writer": {
    inputs: { idea: "We stopped taking wedding cake orders so the bakery could open at 6 a.m. again.", platform: "tiktok" },
  },
  "caption-writer": {
    inputs: {
      post: "Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight next to the oven.",
      platforms: ["tiktok", "reels"],
      length: "short",
    },
  },
  "trend-scout": { inputs: { niche: "small neighbourhood bakery", platform: "reels" } },
  "script-writer": {
    inputs: { idea: "Why our croissants take three days, shown through one batch from dough to the counter.", length: "s30" },
  },
  "hashtag-picker": {
    inputs: { caption: "Gerald the sourdough starter turned nine today. Still rising before we do.", platform: "tiktok" },
  },
  repurposer: {
    inputs: {
      source: [
        "Last spring we stopped taking wedding cake orders. They paid well, but every Friday night the whole team decorated until two,",
        "and on Saturday morning the bread came out late and the regulars waited outside. We counted: cakes were a third of our money",
        "and most of our mistakes. So we said no. We now open at six again, the sourdough sells out by ten, and the team goes home on time.",
        "Here is what changed, what we lost, and why we would do it again.",
      ].join(" "),
    },
    confirmations: { rights: true },
  },
};
