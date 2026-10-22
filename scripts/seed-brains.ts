/**
 * Puts the example Brand Brains into the platform workspace (or the one
 * given), so the builder's test bench has Brand Brains to pick from. Local
 * only, safe to run again: a name the workspace already has is skipped.
 *
 *   npm run brains:seed
 *   npm run brains:seed -- ws_xxxxxxxx
 */
import { join } from "node:path";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { exampleImages } from "@/lib/brand/example-images";
import { seedBrains } from "@/lib/brand/seeds";
import { jsonFileBrandStore } from "@/lib/brand/store";
import { localFileStorage } from "@/lib/builder/storage";

async function main() {
  const dataDir = dataDirFromEnv();
  const workspaceId = process.argv[2] ?? PLATFORM_WORKSPACE_ID;
  const images = exampleImages();
  const made = await seedBrains(jsonFileBrandStore(join(dataDir, "brand-brains.json")), localFileStorage(join(dataDir, "files")), workspaceId, { images });
  console.log(made.length ? `Added to ${workspaceId}: ${made.join(", ")}.` : `${workspaceId} already has the example Brand Brains.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
