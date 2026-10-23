/**
 * Upload rights (phase 18, product doc section 11 "Copyright"): before a
 * file is stored, the person confirms they own it or may use it. The upload
 * is refused without it, and the confirmation is kept with the file id, who,
 * when and the exact words.
 */
import { randomBytes } from "node:crypto";
import { UPLOAD_RIGHTS } from "@/lib/legal/operator";
import type { RightsRow, SafetyStore } from "./store";

/** The form field the upload sends: "yes" when the box was ticked. */
export const RIGHTS_FIELD = "rights";

export const RIGHTS_REFUSAL = "Tick the box to confirm you own this file or have the rights to use it.";

export function rightsGiven(form: FormData): boolean {
  return form.get(RIGHTS_FIELD) === "yes";
}

export async function recordRights(store: SafetyStore, input: Omit<RightsRow, "id" | "statement" | "at"> & { at?: string }): Promise<RightsRow> {
  const row: RightsRow = { id: `rgt_${randomBytes(8).toString("hex")}`, statement: UPLOAD_RIGHTS, at: input.at ?? new Date().toISOString(), ...input };
  await store.rights.insert(row);
  return row;
}
