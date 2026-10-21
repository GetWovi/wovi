import type { Metadata } from "next";
import { ActionForm } from "@/components/account/ActionForm";
import { AuthShell } from "@/components/account/AuthShell";
import styles from "@/components/account/Account.module.css";
import { Button, ButtonLink } from "@/components/ui/Button";
import { accounts, csrfFor, readSession } from "@/lib/accounts/server";
import { acceptInvite } from "./actions";

export const metadata: Metadata = { title: "Invite", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitePage({ searchParams }: PageProps<"/invite">) {
  const { token: raw } = await searchParams;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const invite = await accounts().workspaces.previewInvite(token);

  if (!invite) {
    return (
      <AuthShell title="This invite has run out" lead="Invites work once and expire after seven days. Ask for a new one.">
        <ButtonLink href="/account" block>
          Go to your account
        </ButtonLink>
      </AuthShell>
    );
  }

  const title = `Join ${invite.workspaceName}`;
  const lead = (
    <>
      {invite.invitedBy ?? "Someone"} invited <strong>{invite.email}</strong> as {invite.role}.
    </>
  );
  const session = await readSession();

  if (!session) {
    const next = `/invite?token=${token}`;
    return (
      <AuthShell title={title} lead={lead}>
        <ButtonLink href={`/sign-in?next=${encodeURIComponent(next)}`} block>
          Sign in to accept
        </ButtonLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={title} lead={lead}>
      {session.user.email === invite.email ? (
        <ActionForm action={acceptInvite} csrf={csrfFor(session)} className={styles.stack}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" block>
            Accept and join
          </Button>
        </ActionForm>
      ) : (
        <p className={styles.error}>You are signed in as {session.user.email}. Sign out and sign in with {invite.email} to accept.</p>
      )}
    </AuthShell>
  );
}
