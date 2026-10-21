/**
 * Puts example golden and bad samples on the launch agents in the local
 * store, so the test bench has something to run. Local only, safe to run
 * again: a sample whose title an agent already has is skipped.
 *
 *   npm run builder:samples
 */
import { join } from "node:path";
import { newId } from "@/lib/accounts/crypto";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { jsonFileBuilderStore } from "@/lib/builder/store";
import type { Sample } from "@/lib/builder/types";
import { validateRunInputs } from "@/lib/runs/inputs";

type Seed = Pick<Sample, "title" | "label" | "idealOutput" | "note"> & { inputs: Record<string, unknown> };

const SAMPLES: Record<string, Seed[]> = {
  "hook-writer": [
    {
      title: "Gerald turns nine",
      label: "gold",
      inputs: { idea: "Gerald, our sourdough starter, turns nine this week. He has never missed a bake.", platform: "tiktok" },
      idealOutput: [
        "Gerald is nine. He has never missed a bake.",
        "Nine years of feeding one jar at 5 a.m.",
        "The starter is older than our oven.",
        "We named him Gerald. He named nothing back.",
        "Every loaf you ate this year started with him.",
        "He survived two moves and one power cut.",
        "Gerald does not do discounts.",
        "The only thing we never sold: Gerald.",
        "Nine years, one jar, zero days off.",
        "Meet the oldest employee at the bakery.",
      ].join("\n"),
      note: "Names the thing. Every line could only be about Gerald.",
    },
    {
      title: "Forty burned croissants",
      label: "gold",
      inputs: { idea: "We finally fixed the croissant lamination after burning forty of them in one week.", platform: "reels" },
      idealOutput: [
        "Forty croissants died so this one could live.",
        "Lamination is a mood. Ours was bad for a week.",
        "The bin knows what we did.",
        "Butter, fold, fail, repeat. Then this.",
        "We counted. Forty. Then it clicked.",
        "This croissant cost us a week and a bin.",
        "The layers finally showed up on Thursday.",
        "Croissant number 41.",
        "Nobody tells you lamination has feelings.",
        "The first one that did not burn.",
      ].join("\n"),
      note: "Dry, specific, no sell in the first line.",
    },
    {
      title: "No more wedding cakes",
      label: "gold",
      inputs: { idea: "We stopped taking wedding cake orders so the bakery could open at six again and the team could go home on time.", platform: "shorts" },
      idealOutput: [
        "We said no to wedding cakes. The bread said thank you.",
        "Six a.m. is back. The tiers are gone.",
        "Cakes paid well. Fridays paid for it.",
        "The team goes home at four now.",
        "A third of the money, most of the mistakes.",
        "No more tiers. Just loaves.",
        "We picked mornings over weddings.",
        "The sourdough sells out by ten again.",
        "Saying no was the best bake this year.",
        "Open at six. Home by four. No cakes.",
      ].join("\n"),
      note: "A decision, told straight, no regret.",
    },
    {
      title: "Generic launch post",
      label: "bad",
      inputs: { idea: "A post about our new product launch that gets people excited.", platform: "x" },
      idealOutput: ["Are you ready to level up?", "This changes everything.", "You won't believe what we made.", "Big news is coming.", "Get ready to unlock your potential."].join("\n"),
      note: "Could be any brand. Nothing names the product.",
    },
  ],
  "caption-writer": [
    {
      title: "Gerald time-lapse",
      label: "gold",
      inputs: { post: "Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight next to the oven.", platforms: ["tiktok", "reels"], length: "short" },
      idealOutput: "TikTok: Gerald rose. We did not.\nReels: Nine years old and still the first one up. Gerald, overnight, next to the oven.",
      note: "Short, dry, names Gerald.",
    },
    {
      title: "Croissant lamination",
      label: "gold",
      inputs: { post: "Slow close-up of folding butter into croissant dough, flour on the bench, morning light.", platforms: ["reels"], length: "medium" },
      idealOutput: "Reels: Fold, turn, rest. Fold, turn, rest. The layers you see on Saturday start on Thursday at six. Butter from the farm down the road, dough from Gerald.",
      note: "Shows the hands and the process.",
    },
  ],
  "hashtag-picker": [
    {
      title: "Gerald turns nine",
      label: "gold",
      inputs: { caption: "Gerald the sourdough starter turned nine today. Still rising before we do.", platform: "tiktok" },
      idealOutput: "#sourdough #sourdoughstarter #bakery #bakerylife #breadtok #homebakery #fermentation #sourdoughbread",
      note: "Specific to sourdough, no spam tags.",
    },
    {
      title: "Croissant morning",
      label: "gold",
      inputs: { caption: "Croissant number 41. The first one that did not burn.", platform: "reels" },
      idealOutput: "#croissant #lamination #bakery #pastry #butter #bakerylife #viennoiserie",
      note: "Pastry tags only.",
    },
  ],
  "script-writer": [
    {
      title: "Three-day croissant",
      label: "gold",
      inputs: { idea: "Why our croissants take three days, shown through one batch from dough to the counter.", length: "s30" },
      idealOutput: "Opening: Day one, 6 a.m., the dough. Day two, the butter goes in. Day three, the counter.\nMiddle: Fold and rest, fold and rest. The layers need the sleep more than we do.\nEnding: Three days for one croissant. That is why they sell out by ten.",
      note: "One batch, one arc, no claims.",
    },
  ],
  "trend-scout": [
    {
      title: "Neighbourhood bakery on Reels",
      label: "gold",
      inputs: { niche: "small neighbourhood bakery", platform: "reels" },
      idealOutput: "1. Behind-the-counter time-lapses at opening. Why: shows the process, fits the bakery morning.\n2. One-ingredient close-ups with a line of text. Why: short, honest, cheap to shoot.\n3. Staff picks in one sentence. Why: faces and names, no script.",
      note: "Formats a two-person team can actually shoot.",
    },
  ],
};

async function main() {
  const dataDir = dataDirFromEnv();
  const registry = localRegistry(dataDir);
  const store = jsonFileBuilderStore(join(dataDir, "builder.json"));
  const at = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  for (const [agentId, seeds] of Object.entries(SAMPLES)) {
    const spec = await registry.get(PLATFORM_WORKSPACE_ID, agentId);
    if (!spec) {
      console.log(`${agentId}: not in the store, run npm run agents:seed first`);
      continue;
    }
    const existing = await store.samples.find({ workspaceId: PLATFORM_WORKSPACE_ID, agentId });
    for (const s of seeds) {
      if (existing.some((e) => e.title === s.title)) {
        skipped++;
        continue;
      }
      const checked = validateRunInputs(spec, s.inputs);
      if (!checked.ok) throw new Error(`${agentId} / ${s.title}: ${checked.errors.join(" ")}`);
      await store.samples.insert({
        id: newId("smp"),
        workspaceId: PLATFORM_WORKSPACE_ID,
        agentId,
        version: spec.version,
        label: s.label,
        title: s.title,
        inputs: checked.value,
        idealOutput: s.idealOutput,
        note: s.note,
        links: [],
        files: [],
        createdBy: "seed",
        createdAt: at,
      });
      added++;
    }
  }
  console.log(`samples added: ${added}, already there: ${skipped}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
