/** How a live agent's new version goes out from a save: a canary on a share of live runs. Client-safe. */
export const SHARE_CHOICES = [
  { value: "10", label: "Canary to 10% of live runs" },
  { value: "5", label: "Canary to 5% of live runs" },
  { value: "25", label: "Canary to 25% of live runs" },
  { value: "50", label: "Canary to 50% of live runs" },
  { value: "0", label: "Bench only, no live runs" },
];

/** What the save toast says about where the new version went. */
export function savedWords(version: string, canary: number | null): { title: string; description: string } {
  if (canary === null) return { title: `Saved as version ${version}`, description: "The new version is current." };
  return {
    title: `Saved as version ${version}`,
    description: canary ? `It serves ${canary}% of live runs beside the current version. Compare and publish it on Stats.` : "Only the bench and you get it. Start its canary or publish it on Stats.",
  };
}
