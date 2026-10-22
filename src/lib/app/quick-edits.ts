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
  if (!edit) return null;
  return applyNote(spec, inputs, edit.note, { clip: false });
}

/**
 * Any note on the main text input, the way a quick edit adds one: the
 * person's text kept (cut to make room when it must), any earlier note
 * replaced. Phase 11's "ask for changes" re-runs go through here too, so a
 * reviewer's note reaches the agent as data, never as instructions. Null when
 * the form has no text input to carry it.
 */
export function applyNote(spec: Pick<AgentSpec, "inputs">, inputs: Record<string, unknown>, noteText: string, opts: { clip?: boolean } = {}): { inputs: Record<string, unknown>; note: string } | null {
  const key = primaryTextKey(spec);
  const note = noteText.replace(/\s+/g, " ").trim();
  if (!key || !note) return null;
  const input = spec.inputs.find((i) => i.key === key);
  const max = input && (input.type === "text" || input.type === "long_text") ? input.limits.maxLength : 2000;
  const current = typeof inputs[key] === "string" ? (inputs[key] as string) : "";
  const { text } = splitNote(current);
  // A long note never takes more than half the field, so the person's own words stay the main thing.
  const room0 = Math.floor(max / 2) - `\n\n${NOTE_PREFIX}`.length;
  const clipped = opts.clip !== false && note.length > room0 ? `${note.slice(0, Math.max(0, room0 - 3)).trimEnd()}...` : note;
  const suffix = `\n\n${NOTE_PREFIX}${clipped}`;
  const room = Math.max(0, max - suffix.length);
  const body = text.length > room ? text.slice(0, room).trimEnd() : text;
  return { inputs: { ...inputs, [key]: `${body}${suffix}` }, note: clipped };
}
