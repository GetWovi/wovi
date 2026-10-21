"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { passkeyRegister, passkeyRegisterOptions } from "@/app/account/actions";
import { Button } from "@/components/ui/Button";
import styles from "./Account.module.css";

/** Adds a passkey on this device, for signing in without email next time. */
export function PasskeyAdd({ csrf }: { csrf: string }) {
  const [note, setNote] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setNote(null);
    setBusy(true);
    try {
      const opts = await passkeyRegisterOptions(csrf);
      if ("error" in opts) return setNote({ error: opts.error });
      const response = await startRegistration({ optionsJSON: opts.options });
      setNote(await passkeyRegister(csrf, opts.challengeId, response, deviceName()));
    } catch {
      setNote({ error: "The passkey prompt was closed or is not available here." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.inline}>
      <Button variant="secondary" size="sm" onClick={add} loading={busy}>
        Add a passkey
      </Button>
      {note?.error && (
        <span role="alert" className={styles.error}>
          {note.error}
        </span>
      )}
      {note?.ok && (
        <span role="status" className={styles.ok}>
          {note.ok}
        </span>
      )}
    </div>
  );
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone or iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Passkey";
}
