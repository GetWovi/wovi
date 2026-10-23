/**
 * Sending email. Accounts only talk to the EmailSender interface. In
 * development the dev sender prints each mail to the console and writes it to
 * .data/mail/, so sign-in links and invites can be opened without any email
 * account. A real provider plugs in behind EMAIL_PROVIDER: "resend" (Resend's
 * HTTP API) or "smtp" (any SMTP server), in email-providers.ts. Off by
 * default; off localhost without one, sending refuses.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { providerFromEnv } from "./email-providers";

/** A mail: the plain text always, and its HTML when the mail brings its own (else the providers make it from the text). */
export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Keeps every message in a list. Used by tests. */
export function memoryEmailSender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push({ ...message });
    },
  };
}

/** Prints to the console and writes one text file per mail into `dir`. Never sends anything. */
export function devEmailSender(dir: string, log: (line: string) => void = console.log): EmailSender {
  return {
    async send({ to, subject, text }) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = join(dir, `${stamp}-${to.replace(/[^a-z0-9@._-]/gi, "_")}.txt`);
      writeFileSync(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`, { mode: 0o600 });
      log(`\n[dev email] to ${to}: ${subject}\n${text}\n(saved in ${file})\n`);
    },
  };
}

/** The wired providers, by EMAIL_PROVIDER value. Each reads its own settings (email-providers.ts). */
export const EMAIL_PROVIDERS = ["resend", "smtp"] as const;

/** Refuses every mail with one message, so a setting that is wrong never sends, and never logs, a code or a link. */
function refusing(message: string): EmailSender {
  return {
    async send() {
      throw new Error(message);
    },
  };
}

/**
 * The dev sender unless EMAIL_PROVIDER names a wired provider. Off localhost
 * without a provider it refuses, so sign-in links never end up in server logs.
 * A provider whose own settings are missing refuses every mail and says which.
 */
export function emailSenderFromEnv(dataDir: string, env: NodeJS.ProcessEnv = process.env, local = env.NODE_ENV !== "production"): EmailSender {
  const name = env.EMAIL_PROVIDER?.trim();
  if (name) {
    const made = providerFromEnv(name, env);
    if (!made) throw new Error(`EMAIL_PROVIDER "${name}" is not wired up. Known: ${EMAIL_PROVIDERS.join(", ")}.`);
    if ("missing" in made) return refusing(`Email is not set up: ${made.missing}`);
    return made;
  }
  if (!local) return refusing("No email provider is set up. Set EMAIL_PROVIDER before running in production.");
  return devEmailSender(join(dataDir, "mail"));
}
