import type { Metadata } from "next";
import { AuthShell } from "@/components/account/AuthShell";
import { VerifyLinkForm } from "@/components/account/SignInForm";
import { ButtonLink } from "@/components/ui/Button";
import { accounts } from "@/lib/accounts/server";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function VerifyPage({ searchParams }: PageProps<"/sign-in/verify">) {
  const { token: raw } = await searchParams;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const link = await accounts().signIn.peekLink(token);

  if (!link) {
    return (
      <AuthShell title="This link has run out" lead="Sign-in links work once and expire after 15 minutes. Ask for a new one.">
        <ButtonLink href="/sign-in" block>
          Back to sign in
        </ButtonLink>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Almost in" lead={<>You are signing in as <strong>{link.email}</strong>.</>}>
      <VerifyLinkForm token={token} />
    </AuthShell>
  );
}
