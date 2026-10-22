import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/account/AuthShell";
import { SignInForm } from "@/components/account/SignInForm";
import { readSession } from "@/lib/accounts/server";
import { safeNext } from "@/lib/accounts/sign-in";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next: raw } = await searchParams;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw) ?? "/app";
  if (await readSession()) redirect(next);
  return (
    <AuthShell title="Sign in to WOVI" lead="No password. We email you a link and a code.">
      <SignInForm next={next} />
    </AuthShell>
  );
}
