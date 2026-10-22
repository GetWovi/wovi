/**
 * The agents the app shows: the launch lineup from the registry, in the
 * product doc's order, live ones only, plus Trend Scout as coming until the
 * trend tool exists. Grouped by what a person wants to do.
 */
import type { PublicAgent } from "@/lib/accounts/guard";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";

export type LineupAgent = {
  id: string;
  name: string;
  job: string;
  category: string;
  status: "live" | "coming";
  /** The listed spec, for live agents. */
  spec: PublicAgent | null;
};

/** Doc order: research, ideation, writing, writing, writing, optimization, optimization. */
export const LINEUP_IDS: readonly string[] = LAUNCH_AGENTS.map((a) => a.id);

/** Agents shown as coming: in the lineup, not live yet. */
export const COMING: readonly { id: string; name: string; job: string; category: string }[] = LAUNCH_AGENTS.filter((a) => a.status === "draft").map((a) => ({ id: a.id, name: a.name, job: a.job, category: a.category }));

export const STAGES: readonly { id: string; title: string; lead: string; ids: readonly string[] }[] = [
  { id: "ideas", title: "Get ideas", lead: "Start from nothing but your business.", ids: ["idea-generator", "trend-scout"] },
  { id: "write", title: "Write the post", lead: "Turn one idea into words that sound like you.", ids: ["hook-writer", "script-writer", "caption-writer"] },
  { id: "travel", title: "Make it travel", lead: "Help the right people find it, on every platform.", ids: ["hashtag-picker", "repurposer"] },
];

/** The lineup in order: public live agents from the registry, then the coming ones. */
export function orderLineup(agents: PublicAgent[]): LineupAgent[] {
  const live = agents.filter((a) => a.status === "live" && a.visibility === "public");
  const byId = new Map(live.map((a) => [a.id, a]));
  const out: LineupAgent[] = [];
  for (const id of LINEUP_IDS) {
    const spec = byId.get(id);
    if (spec) out.push({ id, name: spec.name, job: spec.job, category: spec.category, status: "live", spec });
    else {
      const coming = COMING.find((c) => c.id === id);
      if (coming) out.push({ ...coming, status: "coming", spec: null });
    }
  }
  // Live agents outside the lineup (a workspace's own, later a creator's) come after.
  for (const a of live) if (!LINEUP_IDS.includes(a.id)) out.push({ id: a.id, name: a.name, job: a.job, category: a.category, status: "live", spec: a });
  return out;
}

/** The lineup grouped by stage; agents outside every stage land in a last group. */
export function groupLineup(lineup: LineupAgent[]): { id: string; title: string; lead: string; agents: LineupAgent[] }[] {
  const groups = STAGES.map((s) => ({ id: s.id, title: s.title, lead: s.lead, agents: s.ids.map((id) => lineup.find((a) => a.id === id)).filter((a): a is LineupAgent => Boolean(a)) }));
  const placed = new Set(STAGES.flatMap((s) => s.ids));
  const rest = lineup.filter((a) => !placed.has(a.id));
  if (rest.length) groups.push({ id: "more", title: "More", lead: "Agents made for this workspace.", agents: rest });
  return groups.filter((g) => g.agents.length);
}
