import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/account/AuthShell";
import { JoinForm } from "@/components/builder/JoinForm";
import { readSession } from "@/lib/accounts/server";
import { appBuilder } from "@/lib/builder/server";

export const metadata: Metadata = { title: "Join", robots: { index: false, follow: false } };

/** Hidden: nothing links here. A builder code, a name and a passkey make a builder account. */
export default async function BuilderJoinPage() {
  const info = await readSession();
  if (info && (await appBuilder().builderFor({ kind: "user", userId: info.user.id }))) redirect("/builder");
  return (
    <AuthShell title="Join the builder" lead="Enter the code you were given and pick a name. You sign in with a passkey on this device. No email needed.">
      <JoinForm />
    </AuthShell>
  );
}
