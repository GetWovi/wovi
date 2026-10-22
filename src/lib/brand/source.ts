/**
 * The real BrandBrainSource for the run engine (phase 7). It replaces the
 * phase 3 stub: a run gets the Brand Brain it names, or the workspace's
 * default, as the current version flattened into the engine's parts. The
 * engine then fills only the parts the agent's spec declares, each in its own
 * data block.
 */
import type { BrandBrain, BrandBrainSource } from "@/lib/runs/brand-brain";
import type { BrandStore } from "./store";
import type { Brain, BrainBody, MoodItem, Reference } from "./types";

const withNote = (text: string, note: string) => (note ? `${text} (${note})` : text);

export function renderMoodItem(item: MoodItem): string {
  switch (item.kind) {
    case "image":
      return withNote(`Image "${item.file?.name ?? "reference"}"`, item.note);
    case "swatch":
      return withNote(`Colour ${item.color}`, item.note);
    case "link":
      return withNote(`Link ${item.url}`, item.note);
    case "text":
      return withNote(item.text ?? "", item.note);
  }
}

export function renderReference(ref: Reference): string {
  const parts = [ref.text ? `"${ref.text}"` : null, ref.url].filter(Boolean).join(" ");
  return ref.note ? `${parts}\nWhy it works: ${ref.note}` : parts;
}

/** A version as the engine's Brand Brain. Words to avoid become the banned words the guardrails check. */
export function toEngineBrain(brain: Pick<Brain, "id" | "workspaceId" | "updatedAt">, body: BrainBody): BrandBrain {
  return {
    id: brain.id,
    workspaceId: brain.workspaceId,
    name: body.name,
    updatedAt: brain.updatedAt,
    niche: body.niche,
    voice: body.voice.description,
    voiceDetail: { tone: body.voice.tone, use: body.voice.use, avoid: body.voice.avoid, samples: body.voice.samples, topics: body.topics },
    mood_board: body.moodBoard.map(renderMoodItem),
    references: body.references.map(renderReference),
    dos_donts: { dos: body.dos, donts: body.donts, bannedWords: body.voice.avoid },
    idea: body.idea,
  };
}

/** The workspace's default Brand Brain row: the one marked default, else the oldest. */
export async function defaultBrain(store: BrandStore, workspaceId: string): Promise<Brain | null> {
  const rows = await store.brains.find({ workspaceId });
  return rows.find((b) => b.isDefault) ?? rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
}

export function storeBrainSource(store: BrandStore): BrandBrainSource {
  return {
    async get(workspaceId, id) {
      const brain = id === undefined ? await defaultBrain(store, workspaceId) : await store.brains.get(id);
      if (!brain || brain.workspaceId !== workspaceId) return null;
      const v = await store.brainVersions.get(`${brain.id}@${brain.currentVersion}`);
      return v ? toEngineBrain(brain, v.body) : null;
    },
  };
}
