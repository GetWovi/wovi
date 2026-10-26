/**
 * The Brand Brain picker while working for one client: only that client's
 * brands, with the client's default pre-picked. Without a client, every brand
 * with the workspace default.
 */
import type { Principal } from "@/lib/accounts/accounts";
import type { Platform } from "@/lib/agents/catalog";
import type { BrainSummary } from "@/lib/brand/brains";
import { readClientFilter } from "./client-filter";
import { appTeam } from "./server";

export async function brainChoices(me: Principal, workspaceId: string, brains: BrainSummary[]): Promise<{ id: string; name: string; isDefault: boolean; platforms: Platform[] }[]> {
  // The platforms ride along so a form can open on the brand's own platform.
  const all = brains.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault, platforms: b.platforms }));
  const clientId = await readClientFilter(workspaceId);
  if (!clientId) return all;
  const client = (await appTeam().clients(me, workspaceId)).find((c) => c.id === clientId);
  if (!client || client.brands.length === 0) return all;
  return all.filter((b) => client.brandBrainIds.includes(b.id)).map((b) => ({ ...b, isDefault: b.id === client.defaultBrandBrainId }));
}
