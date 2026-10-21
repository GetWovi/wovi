"use client";

import { useActionState, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { passkeyOptions, passkeySignIn, requestSignIn, verifyCode, verifyLink } from "@/app/sign-in/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import styles from "./Account.module.css";

/** Step one: an email. Step two: the six-digit code from that email (or the link in it). */
export function SignInForm({ next }: { next: string }) {
  const [sent, sendAction, sending] = useActionState(requestSignIn, null);
  const [checked, codeAction, checking] = useActionState(verifyCode, null);

  if (sent?.sent) {
    return (
      <div className={styles.stack}>
        <p className={styles.lead}>
          We sent a link and a six-digit code to <strong>{sent.sent.email}</strong>. Open the link, or enter the code here. Both expire in 15 minutes.
        </p>
        <form action={codeAction} className={styles.stack}>
          <input type="hidden" name="email" value={sent.sent.email} />
          <Input label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus error={checked?.error} />
          <Button type="submit" block loading={checking}>
            Sign in
          </Button>
        </form>
        <form action={sendAction}>
          <input type="hidden" name="email" value={sent.sent.email} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="ghost" size="sm" disabled={sending}>
            Send a new code
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <form action={sendAction} className={styles.stack}>
        <input type="hidden" name="next" value={next} />
        <Input label="Email" name="email" type="email" autoComplete="email webauthn" placeholder="you@example.com" required autoFocus error={sent?.error} />
        <Button type="submit" block loading={sending}>
          Email me a sign-in link
        </Button>
      </form>
      <p className={styles.or}>or</p>
      <PasskeySignIn next={next} />
      <p className={styles.fine}>New here? The same email makes your account.</p>
    </div>
  );
}

function PasskeySignIn({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setError(null);
    setBusy(true);
    try {
      const opts = await passkeyOptions();
      if ("error" in opts) return setError(opts.error);
      const response = await startAuthentication({ optionsJSON: opts.options });
      const result = await passkeySignIn(opts.challengeId, response, next);
      if (result?.error) setError(result.error);
    } catch {
      setError("The passkey prompt was closed or is not available here.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      <Button variant="secondary" block onClick={go} loading={busy}>
        Sign in with a passkey
      </Button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

/** The landing page of an email link: one press uses the link, so mail scanners that open links cannot. */
export function VerifyLinkForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyLink, null);
  return (
    <form action={action} className={styles.stack}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" block loading={pending}>
        Continue to WOVI
      </Button>
      {state?.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
    </form>
  );
}

