/**
 * Example Brand Brains, so the builder's test bench (and local work) has
 * something real to run with. Written straight to the store as version 1 by
 * the seed author, like the agent seeds; safe to run again (a name the
 * workspace already has is skipped).
 */
import { newId } from "@/lib/accounts/crypto";
import type { FileStorage, StoredFile } from "@/lib/builder/storage";
import { SEED_AUTHOR } from "./brains";
import type { BrandStore } from "./store";
import { BODY_FIELDS, type Brain, type BrainBody } from "./types";
import { checkBody } from "./validate";

export type ExampleBrain = Omit<BrainBody, "moodBoard"> & { moodBoard: (Omit<BrainBody["moodBoard"][number], "id" | "file"> & { image?: string })[] };

const text = (t: string, note: string) => ({ kind: "text" as const, note, url: null, text: t, color: null });
const swatch = (color: string, note: string) => ({ kind: "swatch" as const, note, url: null, text: null, color });
const link = (url: string, note: string) => ({ kind: "link" as const, note, url, text: null, color: null });
const image = (name: string, note: string) => ({ kind: "image" as const, note, url: null, text: null, color: null, image: name });
const ref = (t: string, note: string, url: string | null = null) => ({ id: "", text: t, url, note });

export const EXAMPLE_BRAINS: ExampleBrain[] = [
  {
    name: "Crumb and Co",
    niche: "Small bakery in Leeds",
    platforms: ["x", "tiktok", "reels"],
    voice: {
      description: "Warm, dry humour, short sentences. Talks like the baker at 5 a.m., not like a brand. Owns the mistakes and shows the mess.",
      tone: ["warm", "dry", "punchy", "personal"],
      use: ["proper loaf", "Gerald", "the 5 a.m. shift"],
      avoid: ["artisanal", "mouthwatering", "indulge", "game-changer"],
      samples: ["We burned 40 croissants so you would not have to.", "The starter is called Gerald. Gerald is nine.", "First loaf goes to whoever is waiting at five."],
    },
    topics: ["sourdough", "early mornings", "mistakes in the kitchen"],
    references: [
      ref("We burned 40 croissants so you would not have to. Here is what we learned about lamination.", "Owns the mistake, then teaches something real"),
      ref("The sourdough starter is called Gerald. Gerald is nine years old. Gerald has never missed a bake.", "One named character carries the whole post"),
      ref("", "The time-lapse of the oven at 5 a.m. Shows the work, no voiceover", "https://www.tiktok.com/@crumbandco/video/1"),
    ],
    moodBoard: [
      image("crust.png", "The colour of a proper crust"),
      image("morning.png", "Morning light through the flour"),
      text("flour dust in morning light, close hands, slow pours", "The feel of every clip"),
      swatch("#8A4B2A", "Crust"),
      swatch("#F3E3C3", "Crumb"),
      swatch("#2B2420", "The oven at night"),
      link("https://www.pinterest.com/crumbandco/bakery-mornings", "The board we shot the shop from"),
    ],
    dos: ["Show the hands and the process", "Name the real ingredient", "End on a small, dry joke"],
    donts: ["No hashtags", "Never call anything artisanal", "No discounts in the first line", "No exclamation marks"],
    idea: "Honest baking: show the mess behind every good loaf.",
  },
  {
    name: "Desk Stretch",
    niche: "Physio for people who sit all day",
    platforms: ["tiktok", "shorts", "reels"],
    voice: {
      description: "Calm, practical, a little teasing. Lists and numbers, one move per line. Talks to you, never at you.",
      tone: ["calm", "practical", "direct"],
      use: ["your back is bored", "one minute", "at your desk"],
      avoid: ["pain-free forever", "miracle", "cure"],
      samples: ["Your back is not broken. It is bored.", "3 moves. 1 minute. Do them now, not later.", "Which one do you skip?"],
    },
    topics: ["desk posture", "neck and shoulders", "tiny habits"],
    references: [ref("5 stretches for desk workers:\n1. Neck rolls\n2. Wrist circles\n3. Seated twist\n4. Hip opener\n5. Shoulder shrugs\nWhich one do you skip?", "Numbered, saveable, ends on a question")],
    moodBoard: [swatch("#3E7CB1", "Calm blue"), swatch("#E8F1F8", "Clinic white"), text("one person, one chair, one move, natural light", "Every video looks like this")],
    dos: ["Open with a number", "One move per line", "End with a question"],
    donts: ["Never promise to cure anything", "No emoji", 'Never say "no pain, no gain"'],
    idea: "Small moves you can do without standing up.",
  },
  {
    name: "Night Owl Coffee",
    niche: "Late-night coffee bar",
    platforms: ["x", "reels"],
    voice: {
      description: "lowercase, sleepy, warm. writes like a text sent at 1 a.m. short lines, one emoji at most.",
      tone: ["casual", "warm", "playful"],
      use: ["still open", "night shift", "one more cup"],
      avoid: ["grind", "hustle", "rise and grind"],
      samples: ["still open. still warm. still here.", "for the night shift, the second shift and the no shift ☕", "the last cup is always the best one"],
    },
    topics: ["night shifts", "the regulars", "decaf after midnight"],
    references: [ref("still open. still warm. still here.", "Three beats, no pitch")],
    moodBoard: [swatch("#1B1F3B", "Midnight"), swatch("#E0A458", "Lamp light"), text("neon on wet pavement, steam off a cup", "The look")],
    dos: ["Write in lowercase", "Keep it under three lines"],
    donts: ["No hashtags", "No ALL CAPS", "Never mention hustle culture"],
    idea: "A warm place for people awake when everyone else is not.",
  },
];

/**
 * Adds the examples to a workspace that does not have them yet. Images come
 * from `images` (name to PNG bytes) when given, and are stored under the
 * workspace like any upload. The first Brand Brain made is the default.
 * `examples` replaces the list (the launch set adds its own Brand Brains).
 */
export async function seedBrains(
  store: BrandStore,
  files: FileStorage,
  workspaceId: string,
  opts: { images?: Record<string, Uint8Array>; now?: () => string; examples?: ExampleBrain[] } = {},
): Promise<string[]> {
  const now = opts.now ?? (() => new Date().toISOString());
  const existing = await store.brains.find({ workspaceId });
  const made: string[] = [];
  for (const ex of opts.examples ?? EXAMPLE_BRAINS) {
    if (existing.some((b) => b.name === ex.name)) continue;
    const moodBoard = [];
    for (const m of ex.moodBoard) {
      const { image: name, ...item } = m;
      if (!name) {
        moodBoard.push({ ...item, id: "", file: null });
        continue;
      }
      const bytes = opts.images?.[name];
      if (!bytes) continue;
      const file: StoredFile = await files.put(workspaceId, { name, mimeType: "image/png", bytes });
      moodBoard.push({ ...item, id: "", file });
    }
    const checked = checkBody({ ...ex, moodBoard });
    if (!checked.ok) throw new Error(`Example "${ex.name}" is not valid: ${checked.errors.join(" ")}`);
    const at = now();
    const isDefault = existing.length + made.length === 0;
    const brain: Brain = { id: newId("bb"), workspaceId, name: ex.name, isDefault, currentVersion: 1, createdBy: SEED_AUTHOR, createdAt: at, updatedAt: at };
    await store.brainVersions.insert({ id: `${brain.id}@1`, workspaceId, brainId: brain.id, version: 1, body: checked.value, note: "Example Brand Brain", changed: [...BODY_FIELDS], by: SEED_AUTHOR, at });
    await store.brains.insert(brain);
    made.push(ex.name);
  }
  return made;
}
