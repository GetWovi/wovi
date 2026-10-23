/**
 * Canary routing: which side of a release a workspace's runs go to. A stable
 * hash of the release and the workspace picks a bucket from 0 to 9,999; the
 * first `share` percent of buckets get the canary. One workspace sees one
 * version for the whole release, and raising the share only moves more
 * workspaces onto the canary, never one back.
 */
import { createHash } from "node:crypto";
import type { ReleaseArm, ReleaseRow } from "./types";

export const BUCKETS = 10_000;

export function bucketOf(releaseId: string, workspaceId: string): number {
  const h = createHash("sha256").update(`${releaseId}\u0000${workspaceId}`).digest();
  return h.readUInt32BE(0) % BUCKETS;
}

export function armFor(release: Pick<ReleaseRow, "id" | "share">, workspaceId: string): ReleaseArm {
  const share = Math.max(0, Math.min(100, release.share));
  return bucketOf(release.id, workspaceId) < share * (BUCKETS / 100) ? "canary" : "stable";
}
