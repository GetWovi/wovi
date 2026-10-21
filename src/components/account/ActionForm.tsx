"use client";

import { useActionState, type ReactNode } from "react";
import styles from "./Account.module.css";

/** What an account server action answers: a note, an error, or a secret shown once (a new API key). */
export type ActionState = { ok?: string; error?: string; secret?: string } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A form posting to a server action, with the CSRF field and the action's answer under it. */
export function ActionForm({ action, csrf, className, children }: { action: FormAction; csrf?: string; className?: string; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className} aria-busy={pending || undefined}>
      {csrf && <input type="hidden" name="csrf" value={csrf} />}
      <fieldset disabled={pending} className={styles.fieldset}>
        {children}
      </fieldset>
      {state?.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className={styles.ok}>
          {state.ok}
        </p>
      )}
      {state?.secret && <code className={styles.secret}>{state.secret}</code>}
    </form>
  );
}
