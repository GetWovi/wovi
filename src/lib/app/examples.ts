/**
 * "Fill with an example" on an agent's or a pipeline's form. Each example is
 * a golden sample written for one launch Brand Brain. On that Brand Brain the
 * whole sample fills in. On any other (the person's own) the inputs that hold
 * the sample business's facts (dates, prices, names, places, what it can
 * film) stay empty, so nothing from another business lands in the form as if
 * it were theirs. Client-safe: the samples themselves stay on the server.
 */

export type FormExample = {
  /** The launch Brand Brain the sample was written for. */
  brain: string;
  inputs: Record<string, unknown>;
  /** Input keys that hold that business's facts. */
  facts: string[];
};

/** The inputs to fill for the picked Brand Brain, or null with no example. */
export function exampleInputs(examples: FormExample[], brandName: string | undefined): Record<string, unknown> | null {
  const own = examples.find((e) => e.brain === brandName);
  if (own) return own.inputs;
  const first = examples[0];
  if (!first) return null;
  return Object.fromEntries(Object.entries(first.inputs).filter(([k]) => !first.facts.includes(k)));
}
