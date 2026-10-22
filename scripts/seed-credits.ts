/**
 * A small team to look at for the phase 13 credit screenshots: the owner's
 * workspace becomes "Northside Bikes" with an admin and two editors, and the
 * example Brand Brains. Credits themselves are added through the app's own
 * test top-up, not here. Local only: no key, no network, no money.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-credits-screens npx tsx scripts/seed-credits.ts maya@example.com
 */
import { join } from "node:path";
import type { Principal } from "@/lib/accounts/accounts";
import { dataDirFromEnv, localAccounts } from "@/lib/accounts/local";
import { seedBrains } from "@/lib/brand/seeds";
import { jsonFileBrandStore } from "@/lib/brand/store";
import { localFileStorage } from "@/lib/builder/storage";

const as = (userId: string): Principal => ({ kind: "user", userId });

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: seed-credits.ts <owner email>");
  const dir = dataDirFromEnv();
  const accounts = localAccounts(dir);
  const owner = await accounts.findUserByEmail(email);
  if (!owner) throw new Error(`No account for ${email}. Sign in once first.`);
  const ws = owner.personalWorkspaceId;
  const row = (await accounts.store.workspaces.get(ws))!;
  await accounts.store.workspaces.update({ ...row, name: "Northside Bikes", updatedAt: accounts.iso() });
  await accounts.store.users.update({ ...owner, name: "Maya Lind", updatedAt: accounts.iso() });
  const people: [string, string, "admin" | "editor"][] = [
    ["al@northside.bike", "Al Okafor", "admin"],
    ["sam@northside.bike", "Sam Reyes", "editor"],
    ["jo@northside.bike", "Jo Berg", "editor"],
  ];
  for (const [mail, name, role] of people) {
    const { user } = await accounts.ensureUser(mail);
    await accounts.store.users.update({ ...user, name, updatedAt: accounts.iso() });
    if (!(await accounts.roleIn(as(user.id), ws))) await accounts.addMember(ws, user.id, role, owner.id);
  }
  const brands = jsonFileBrandStore(join(dir, "brand-brains.json"));
  if (!(await brands.brains.find({ workspaceId: ws })).length) await seedBrains(brands, localFileStorage(join(dir, "files")), ws);
  console.log(JSON.stringify({ workspaceId: ws }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
