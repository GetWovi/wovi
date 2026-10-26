"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { AccountError } from "@/lib/accounts/errors";
import { SESSION_COOKIE, accounts, checkOrigin, requestMeta, setSessionCookie } from "@/lib/accounts/server";
import { safeNext, typedEmail, type SignInResult } from "@/lib/accounts/sign-in";

/** `email` is what was typed, kept on an error so the form shows it again. */
export type SignInState = { error?: string; email?: string; sent?: { email: string; next: string } } | null;

function message(err: unknown): string {
  if (err instanceof AccountError) return err.message;
  throw err;
}

/** Ends the session this browser had, then sets the new one. */
async function finish(result: SignInResult) {
  const old = (await cookies()).get(SESSION_COOKIE)?.value;
  if (old) await accounts().sessions.signOut(old);
  await setSessionCookie(result.token, result.session);
}

export async function requestSignIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const next = safeNext(formData.get("next")) ?? "/app";
  try {
    await checkOrigin();
    const { ip } = await requestMeta();
    await accounts().signIn.request({ email, ip, next });
    return { sent: { email: email.trim().toLowerCase(), next } };
  } catch (err) {
    return { error: message(err), email: typedEmail(email) };
  }
}

export async function verifyCode(prev: SignInState, formData: FormData): Promise<SignInState> {
  let next: string;
  try {
    await checkOrigin();
    const { ip, userAgent } = await requestMeta();
    const result = await accounts().signIn.verifyCode({ email: String(formData.get("email") ?? ""), code: String(formData.get("code") ?? ""), ip, userAgent });
    await finish(result);
    next = result.next ?? "/app";
  } catch (err) {
    return { ...prev, error: message(err) };
  }
  redirect(next);
}

export async function verifyLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  let next: string;
  try {
    await checkOrigin();
    const { ip, userAgent } = await requestMeta();
    const result = await accounts().signIn.verifyLink({ token: String(formData.get("token") ?? ""), ip, userAgent });
    await finish(result);
    next = result.next ?? "/app";
  } catch (err) {
    return { error: message(err) };
  }
  redirect(next);
}

export async function passkeyOptions(): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON } | { error: string }> {
  try {
    await checkOrigin();
    return await accounts().passkeys.authenticationOptions((await requestMeta()).ip);
  } catch (err) {
    return { error: message(err) };
  }
}

export async function passkeySignIn(challengeId: string, response: AuthenticationResponseJSON, nextInput: string | null): Promise<{ error: string }> {
  let next: string;
  try {
    await checkOrigin();
    const { ip, userAgent } = await requestMeta();
    await finish(await accounts().passkeys.verifyAuthentication({ challengeId, response, ip, userAgent }));
    next = safeNext(nextInput) ?? "/app";
  } catch (err) {
    return { error: message(err) };
  }
  redirect(next);
}
