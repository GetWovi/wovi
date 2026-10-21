/**
 * An agent's mood board as an extra Brand Brain source. When the engine fills
 * {{brand.mood_board}} and {{brand.references}} for a run of an agent that
 * has a board, the board's items are appended to the user's own parts, so an
 * instruction template can lean on the builder's references without any new
 * placeholder. The user's Brand Brain stays first; the board adds to it.
 */
import type { BrandBrain, BrandBrainSource } from "@/lib/runs/brand-brain";
import type { BoardItem } from "./types";

export interface BoardSource {
  listForAgent(workspaceId: string, agentId: string): Promise<BoardItem[]>;
}

/** One board item as a line of prompt text. */
export function renderBoardItem(item: BoardItem): string {
  const note = item.note ? ` (${item.note})` : "";
  switch (item.kind) {
    case "swatch":
      return `Colour ${item.color}${note}`;
    case "image":
      return `Image "${item.file?.name ?? "reference"}"${note}`;
    case "link":
      return `${item.url}${note}`;
    case "text":
      return `${item.text}${note}`;
  }
}

export function boardBrandBrains(base: BrandBrainSource, boards: BoardSource): BrandBrainSource {
  return {
    async get(workspaceId, id, agent) {
      const brain = await base.get(workspaceId, id);
      if (!agent) return brain;
      const items = await boards.listForAgent(agent.workspaceId, agent.id);
      if (!items.length) return brain;
      const look = items.filter((i) => i.kind !== "link").map(renderBoardItem);
      const refs = items.filter((i) => i.kind === "link").map(renderBoardItem);
      const start: BrandBrain = brain ?? {
        id: `board_${agent.id}`,
        workspaceId,
        name: "Agent references",
        updatedAt: items.map((i) => i.createdAt).sort().pop()!,
        voice: "",
        mood_board: [],
        references: [],
        dos_donts: { dos: [], donts: [], bannedWords: [] },
        idea: "",
      };
      return {
        ...start,
        mood_board: [...start.mood_board, ...look],
        references: [...start.references, ...refs],
      };
    },
  };
}
