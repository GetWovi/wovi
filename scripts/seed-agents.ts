/** Seeds the platform's launch agents into the local store in .data/. Local only. Run: npm run agents:seed */
import { localAccounts } from "@/lib/accounts/local";
import { localRegistry, seedPlatformAgents } from "@/lib/agents";

async function main() {
  // The platform workspace and creator are real account records; builders own them once they sign in.
  await localAccounts().ensurePlatform();
  const result = await seedPlatformAgents(localRegistry());
  console.log(`created: ${result.created.join(", ") || "none"}`);
  console.log(`updated: ${result.updated.join(", ") || "none"}`);
  console.log(`unchanged: ${result.unchanged.join(", ") || "none"}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
