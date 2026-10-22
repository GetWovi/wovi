/**
 * Quick edits: one click to run the same job again with a note. The note is
 * added to the person's own main input as material for the model ("Note for
 * this run: ..."), so the agent's instructions never change and the engine
 * treats it as data like everything the person typed.
 */
import type { AgentSpec } from "@/lib/agents/spec";
import { primaryTextKey } from "./forms";

export type QuickEdit = { id: string; label: string; note: string };

export const QUICK_EDITS: readonly QuickEdit[] = [
  { id: "shorter", label: "Shorter", note: "Make every line shorter. Cut words, keep the point." },
  { id: "punchier", label: "Punchier", note: "Make it punchier: stronger verbs, a sharper first word, no soft openers." },
  { id: "brand", label: "More like my brand", note: "Stay closer to my Brand Brain: its sample lines, its words to use and its rhythm." },
];

export const NOTE_PREFIX = "Note for this run: ";

export function quickEdit(id: string): QuickEdit | null {
  return QUICK_EDITS.find((q) => q.id === id) ?? null;
}

/** The note already in a text, if one is there, so a second edit replaces it instead of piling up. */
export function splitNote(text: string): { text: string; note: string | null } {
  const i = text.lastIndexOf(`\n\n${NOTE_PREFIX}`);
  if (i === -1) return { text, note: null };
  return { text: text.slice(0, i), note: text.slice(i + 2 + NOTE_PREFIX.length) };
}

/**
 * The same inputs with the note on the main text input, inside its limit.
 * Null when the agent has no text input to carry a note.
 */
export function applyQuickEdit(spec: Pick<AgentSpec, "inputs">, inputs: Record<string, unknown>, id: string): { inputs: Record<string, unknown>; note: string } | null {
  const edit = quickEdit(id);
  const key = primaryTextKey(spec);
  if (!edit || !key) return null;
  const input = spec.inputs.find((i) => i.key === key);
  const max = input && (input.type === "text" || input.type === "long_text") ? input.limits.maxLength : 2000;
  const current = typeof inputs[key] === "string" ? (inputs[key] as string) : "";
  const { text } = splitNote(current);
  const suffix = `\n\n${NOTE_PREFIX}${edit.note}`;
  const room = Math.max(0, max - suffix.length);
  const body = text.length > room ? text.slice(0, room).trimEnd() : text;
  return { inputs: { ...inputs, [key]: `${body}${suffix}` }, note: edit.note };
}
