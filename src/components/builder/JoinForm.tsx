"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { joinFinish, joinStart } from "@/app/builder/join/actions";
import styles from "@/components/account/Account.module.css";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

export function JoinForm() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const start = await joinStart(code, name);
      if ("error" in start) return setError(start.error);
      let response;
      try {
        response = await startRegistration({ optionsJSON: start.options });
      } catch {
        return setError("The passkey prompt was closed or is not available here. Your code is still good; try again.");
      }
      const done = await joinFinish(start.challengeId, response);
      if (done?.error) setError(done.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={join} className={styles.stack}>
      <Input label="Builder code" name="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="wovi_builder_..." autoComplete="off" spellCheck={false} required autoFocus className={styles.mono} />
      <Input label="Your name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="How the builder shows you" maxLength={60} required autoComplete="nickname" />
      <Button type="submit" block loading={busy}>
        Create my passkey and join
      </Button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <p className={styles.fine}>The code works once and expires after seven days. Keep the passkey: it is the only way back in.</p>
    </form>
  );
}
