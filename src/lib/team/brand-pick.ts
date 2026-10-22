/**
 * The Brand Brain picker while working for one client: only that client's
 * brands, with the client's default pre-picked. Without a client, every brand
 * with the workspace default.
 */
import type { Principal } from "@/lib/accounts/accounts";
import type { BrainSummary } from "@/lib/brand/brains";
import { readClientFilter } from "./client-filter";
import { appTeam } from "./server";

export async function brainChoices(me: Principal, workspaceId: string, brains: BrainSummary[]): Promise<{ id: string; name: string; isDefault: boolean }[]> {
  const all = brains.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault }));
  const clientId = await readClientFilter(workspaceId);
  if (!clientId) return all;
  const client = (await appTeam().clients(me, workspaceId)).find((c) => c.id === clientId);
  if (!client || client.brands.length === 0) return all;
  return all.filter((b) => client.brandBrainIds.includes(b.id)).map((b) => ({ ...b, isDefault: b.id === client.defaultBrandBrainId }));
}
