/**
 * Builder codes, on the command line only. Local data in .data/.
 *
 *   npm run builder:code                 prints a new single-use code (7 days)
 *   npm run builder:code -- --label Funkai
 *   npm run builder:code -- --list       every code and its state
 *   npm run builder:code -- --revoke <id>
 *
 * Hand the code over out of band. The person opens /builder/join, enters it
 * with a display name, and creates a passkey. No email is involved anywhere.
 */
import { localAccounts } from "@/lib/accounts/local";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const day = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

async function main() {
  const accounts = localAccounts();
  await accounts.ensurePlatform();
  const codes = accounts.builderCodes;

  if (flag("--list")) {
    const list = await codes.list();
    if (!list.length) return console.log("No builder codes yet. Make one with: npm run builder:code");
    for (const c of list) {
      const who = c.usedBy ? ` by ${c.usedBy}` : "";
      console.log(`${c.id}  ...${c.suffix}  ${c.state.padEnd(8)}  made ${day(c.createdAt)}  expires ${day(c.expiresAt)}${who}${c.label ? `  (${c.label})` : ""}`);
    }
    return;
  }

  if (flag("--revoke")) {
    const id = value("--revoke");
    if (!id) throw new Error("Give the code id to revoke: npm run builder:code -- --revoke bcd_...");
    const view = await codes.revoke(id);
    console.log(`${view.id} is now ${view.state}.`);
    return;
  }

  // On the host at start: stores the code in WOVI_BUILDER_INVITE once. Prints only its last characters.
  if (flag("--from-env")) {
    const invite = process.env.WOVI_BUILDER_INVITE?.trim();
    if (!invite) return;
    const view = await codes.issueKnown(invite, process.env.WOVI_BUILDER_INVITE_LABEL ?? null);
    console.log(view ? `Builder invite ...${view.suffix} stored as ${view.id}, expires ${day(view.expiresAt)}.` : `Builder invite ...${invite.slice(-6)} is already stored.`);
    return;
  }

  const { code, view } = await codes.issue(value("--label"));
  const base = process.env.WOVI_APP_URL ?? "http://localhost:3900";
  console.log("");
  console.log("New builder code (shown once, works once, expires in 7 days):");
  console.log("");
  console.log(`  ${code}`);
  console.log("");
  console.log(`Join at ${base}/builder/join with a display name and a passkey.`);
  console.log(`Id ${view.id}. Revoke with: npm run builder:code -- --revoke ${view.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
