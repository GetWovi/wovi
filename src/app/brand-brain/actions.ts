"use server";

import { RIGHTS_REFUSAL, recordRights, rightsGiven } from "@/lib/safety/rights";
import { appSafetyStore } from "@/lib/safety/server";
import { revalidatePath } from "next/cache";
import { AccountError } from "@/lib/accounts/errors";
import { accounts } from "@/lib/accounts/server";
import { BrandError, publicProposal, type ProposalEdits, type ProposeInput, type PublicProposal } from "@/lib/brand/brains";
import { brandAction } from "@/lib/brand/server";
import type { StoredFile } from "@/lib/builder/storage";
import type { BrainBody } from "@/lib/brand/types";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: string; issues?: string[] };

/** Runs a Brand Brain call in the session's workspace and turns known errors into a message for the screen. */
async function run<T>(csrf: string, fn: (ctx: Awaited<ReturnType<typeof brandAction>>) => Promise<T>, opts: { quiet?: boolean } = {}): Promise<Result<T>> {
  try {
    const value = await fn(await brandAction(csrf));
    if (!opts.quiet) revalidatePath("/brand-brain", "layout");
    return { ok: true, value };
  } catch (err) {
    if (err instanceof BrandError) return { ok: false, error: err.message, code: err.code, issues: err.issues };
    if (err instanceof AccountError) return { ok: false, error: err.message, code: err.code };
    throw err;
  }
}

export async function createBrain(csrf: string, name: string): Promise<Result<{ id: string }>> {
  return run(csrf, async ({ brands, me, workspaceId }) => ({ id: (await brands.create(me, workspaceId, { name: name || "New Brand Brain" })).brain.id }));
}

export async function saveBrain(csrf: string, id: string, changes: Partial<BrainBody>, opts: { note?: string; baseVersion?: number }): Promise<Result<{ version: number }>> {
  return run(csrf, async ({ brands, me, workspaceId }) => ({ version: (await brands.save(me, workspaceId, id, changes, opts)).version.version }));
}

export async function restoreVersion(csrf: string, id: string, version: number): Promise<Result<{ version: number }>> {
  return run(csrf, async ({ brands, me, workspaceId }) => ({ version: (await brands.restore(me, workspaceId, id, version)).version.version }));
}

export async function makeDefault(csrf: string, id: string): Promise<Result<null>> {
  return run(csrf, async ({ brands, me, workspaceId }) => {
    await brands.setDefault(me, workspaceId, id);
    return null;
  });
}

export async function deleteBrain(csrf: string, id: string): Promise<Result<null>> {
  return run(csrf, async ({ brands, me, workspaceId }) => {
    await brands.remove(me, workspaceId, id);
    return null;
  });
}

/** A multipart form with `file`. Returns the stored image's metadata. */
export async function uploadImage(csrf: string, formData: FormData): Promise<Result<StoredFile>> {
  return run(
    csrf,
    async ({ brands, me, workspaceId }) => {
      const file = formData.get("file");
      if (!(file instanceof File)) throw new BrandError("invalid_request", "Pick an image first.");
      // Phase 18: no image is stored without the person's rights confirmation.
      if (!rightsGiven(formData)) throw new BrandError("invalid_request", RIGHTS_REFUSAL);
      const stored = await brands.putImage(me, workspaceId, { name: file.name, mimeType: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()) });
      await recordRights(appSafetyStore(), { workspaceId, userId: me.userId, subject: "mood_board", fileId: stored.id, fileName: stored.name });
      return stored;
    },
    { quiet: true },
  );
}

export async function proposeProfile(csrf: string, input: ProposeInput): Promise<Result<PublicProposal>> {
  return run(csrf, async ({ brands, me, workspaceId }) => publicProposal(await brands.propose(me, workspaceId, input)), { quiet: true });
}

export async function acceptProposal(csrf: string, proposalId: string, edits: ProposalEdits): Promise<Result<{ id: string }>> {
  return run(csrf, async ({ brands, me, workspaceId }) => ({ id: (await brands.accept(me, workspaceId, proposalId, edits)).brain.id }));
}

/** Switches the session to another workspace the person belongs to. */
export async function switchWorkspace(csrf: string, workspaceId: string): Promise<Result<null>> {
  return run(csrf, async ({ info }) => {
    await accounts().sessions.switchWorkspace(info.session.id, workspaceId);
    return null;
  });
}
