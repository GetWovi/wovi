"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { AccountError } from "@/lib/accounts/errors";
import { SESSION_COOKIE, accounts, checkOrigin, requestMeta, setSessionCookie } from "@/lib/accounts/server";

function message(err: unknown): string {
  if (err instanceof AccountError) return err.message;
  throw err;
}

/** Step one: the code and the name. Returns the passkey creation options. */
export async function joinStart(code: string, name: string): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON } | { error: string }> {
  try {
    await checkOrigin();
    const { ip } = await requestMeta();
    return await accounts().builderCodes.startJoin({ code, name, ip });
  } catch (err) {
    return { error: message(err) };
  }
}

/** Step two: the passkey. Signs the new builder in and goes to the builder. */
export async function joinFinish(challengeId: string, response: RegistrationResponseJSON): Promise<{ error: string }> {
  try {
    await checkOrigin();
    const { ip, userAgent } = await requestMeta();
    const result = await accounts().builderCodes.finishJoin({ challengeId, response, ip, userAgent });
    const old = (await cookies()).get(SESSION_COOKIE)?.value;
    if (old) await accounts().sessions.signOut(old);
    await setSessionCookie(result.token, result.session);
  } catch (err) {
    return { error: message(err) };
  }
  redirect("/builder");
}
